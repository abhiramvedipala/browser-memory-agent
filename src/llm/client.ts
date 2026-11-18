import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Store } from '../memory/store.ts';
import { Budget } from './budget.ts';
import { costUsd } from './pricing.ts';
import type { ContentBlock, LlmRequest, LlmResponse, Purpose, Transport } from './types.ts';

const here = dirname(fileURLToPath(import.meta.url));
export const DEFAULT_FIXTURE_DIR = process.env.LLM_FIXTURE_DIR ?? join(here, '..', '..', 'fixtures', 'llm');
export const DEFAULT_MODEL = process.env.ANTHROPIC_MODEL || 'claude-haiku-5-5';

export type LlmMode = 'replay' | 'record';

export class MissingFixtureError extends Error {
  constructor(public readonly key: string) {
    super(`No LLM fixture ${key}.json and LLM_MODE=replay: refusing to call the network. Record it once with LLM_MODE=record and an API key.`);
    this.name = 'MissingFixtureError';
  }
}

export function llmMode(): LlmMode {
  return process.env.LLM_MODE === 'record' ? 'record' : 'replay';
}

function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .filter(([, v]) => v !== undefined)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([k, v]) => [k, canonical(v)]),
    );
  }
  return value;
}

/** sha256 of the canonical JSON of the request: the fixture file name. */
export function fixtureKey(req: LlmRequest): string {
  return createHash('sha256').update(JSON.stringify(canonical(req))).digest('hex');
}

export interface LlmClientOptions {
  mode?: LlmMode;
  fixtureDir?: string;
  store?: Store;
  /** Required in record mode; built from the Anthropic SDK by makeAnthropicTransport(). */
  transport?: Transport;
  budget?: Budget;
}

/** Record/replay LLM client. Replay (the default) can never reach the network. */
export class LlmClient {
  readonly mode: LlmMode;
  readonly fixtureDir: string;
  readonly budget: Budget;

  constructor(private readonly opts: LlmClientOptions = {}) {
    this.mode = opts.mode ?? llmMode();
    this.fixtureDir = opts.fixtureDir ?? DEFAULT_FIXTURE_DIR;
    this.budget = opts.budget ?? new Budget(this.fixtureDir, opts.store);
  }

  async complete(purpose: Purpose, req: LlmRequest): Promise<LlmResponse> {
    const key = fixtureKey(req);
    const file = join(this.fixtureDir, `${key}.json`);
    if (existsSync(file)) {
      const fx = JSON.parse(readFileSync(file, 'utf8')) as { response: LlmResponse };
      this.opts.store?.logLlmCall({ purpose, model: req.model, inputTokens: fx.response.inputTokens, outputTokens: fx.response.outputTokens, costUsd: 0, latencyMs: 0, fixtureKey: key });
      return fx.response;
    }
    if (this.mode === 'replay') throw new MissingFixtureError(key);
    if (!this.opts.transport) throw new Error('LLM_MODE=record needs a transport (an API key); none was configured.');

    // Pessimistic estimate: ~3 characters per input token plus the full output allowance.
    const approxIn = Math.ceil(JSON.stringify(req).length / 3);
    this.budget.assertCanSpend(costUsd(req.model, approxIn, req.max_tokens));

    const started = Date.now();
    const out = await this.opts.transport(req);
    const latencyMs = Date.now() - started;
    const response: LlmResponse = {
      content: out.content,
      stopReason: out.stopReason,
      inputTokens: out.inputTokens,
      outputTokens: out.outputTokens,
      costUsd: costUsd(req.model, out.inputTokens, out.outputTokens),
      latencyMs,
    };
    mkdirSync(this.fixtureDir, { recursive: true });
    writeFileSync(file, `${JSON.stringify({ request: req, response, recordedAt: new Date().toISOString() }, null, 2)}\n`);
    this.opts.store?.logLlmCall({ purpose, model: req.model, inputTokens: out.inputTokens, outputTokens: out.outputTokens, costUsd: response.costUsd, latencyMs, fixtureKey: key });
    this.budget.printRunning();
    return response;
  }
}

/** Build a live transport from the Anthropic SDK. Only called in record mode. */
export async function makeAnthropicTransport(apiKey = process.env.ANTHROPIC_API_KEY): Promise<Transport> {
  if (!apiKey) throw new Error('ANTHROPIC_API_KEY is not set; it is only needed with LLM_MODE=record.');
  const { default: Anthropic } = await import('@anthropic-ai/sdk');
  const sdk = new Anthropic({ apiKey });
  return async (req) => {
    const res = await sdk.messages.create({
      model: req.model,
      max_tokens: req.max_tokens,
      system: req.system,
      messages: req.messages as never,
      tools: req.tools as never,
    });
    return {
      content: res.content.flatMap((b): ContentBlock[] => {
        if (b.type === 'text') return [{ type: 'text', text: b.text }];
        if (b.type === 'tool_use') return [{ type: 'tool_use', id: b.id, name: b.name, input: b.input as Record<string, unknown> }];
        return [];
      }),
      stopReason: res.stop_reason ?? 'end_turn',
      inputTokens: res.usage.input_tokens,
      outputTokens: res.usage.output_tokens,
    };
  };
}
