import { mkdtempSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Budget, BudgetExceededError, REFUSE_ABOVE_USD, fixtureSpendUsd } from '../src/llm/budget.ts';
import { LlmClient, MissingFixtureError, fixtureKey, llmMode } from '../src/llm/client.ts';
import { buildLabelRequest, fallbackIntent, labelWorkflow } from '../src/llm/intents.ts';
import { costUsd, priceFor } from '../src/llm/pricing.ts';
import type { LlmRequest, Transport } from '../src/llm/types.ts';
import { Store } from '../src/memory/store.ts';
import type { StepInput, Target } from '../src/memory/types.ts';

const req = (text = 'hi'): LlmRequest => ({ model: 'claude-haiku-5-5', max_tokens: 100, messages: [{ role: 'user', content: text }] });
const okTransport = (text: string, inTok = 1000, outTok = 200): Transport => vi.fn(async () => ({ content: [{ type: 'text' as const, text }], stopReason: 'end_turn', inputTokens: inTok, outputTokens: outTok }));

let dir: string;
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'bma-fx-'));
});

describe('fixtureKey', () => {
  it('is a stable sha256 independent of object key order', () => {
    const a = { model: 'm', max_tokens: 5, messages: [{ role: 'user' as const, content: 'x' }] };
    const b = { messages: [{ content: 'x', role: 'user' as const }], max_tokens: 5, model: 'm' };
    expect(fixtureKey(a)).toBe(fixtureKey(b));
    expect(fixtureKey(a)).toMatch(/^[0-9a-f]{64}$/);
    expect(fixtureKey({ ...a, max_tokens: 6 })).not.toBe(fixtureKey(a));
  });
});

describe('pricing', () => {
  it('computes cost per million tokens and prices unknown models at the highest known rate', () => {
    expect(costUsd('claude-haiku-5-5', 1_000_000, 0)).toBeCloseTo(priceFor('claude-haiku-5-5').inPerMTok, 10);
    expect(priceFor('some-new-model').outPerMTok).toBeGreaterThanOrEqual(priceFor('claude-haiku-5-5').outPerMTok);
  });
});

describe('LlmClient replay mode', () => {
  it('defaults to replay and throws MissingFixtureError without touching any transport', async () => {
    delete process.env.LLM_MODE;
    expect(llmMode()).toBe('replay');
    const transport = okTransport('x');
    const c = new LlmClient({ fixtureDir: dir, transport });
    await expect(c.complete('tiebreak', req())).rejects.toThrow(MissingFixtureError);
    expect(transport).not.toHaveBeenCalled();
  });

  it('serves a recorded response and logs a zero-cost ledger row', async () => {
    const store = Store.open(':memory:');
    const rec = new LlmClient({ mode: 'record', fixtureDir: dir, transport: okTransport('hello'), store });
    const live = await rec.complete('tiebreak', req());
    const replay = new LlmClient({ mode: 'replay', fixtureDir: dir, store });
    const again = await replay.complete('tiebreak', req());
    expect(again).toEqual(live);
    const rows = store.db.prepare('SELECT cost_usd, fixture_key FROM llm_calls ORDER BY id').all() as { cost_usd: number; fixture_key: string }[];
    expect(rows).toHaveLength(2);
    expect(rows[0]!.cost_usd).toBeGreaterThan(0);
    expect(rows[1]!.cost_usd).toBe(0);
    expect(rows[0]!.fixture_key).toBe(fixtureKey(req()));
  });
});

describe('LlmClient record mode', () => {
  it('needs a transport', async () => {
    const c = new LlmClient({ mode: 'record', fixtureDir: dir });
    await expect(c.complete('tiebreak', req())).rejects.toThrow(/transport/);
  });

  it('calls once, writes the fixture, computes cost, and replays without calling again', async () => {
    const transport = okTransport('answer', 2000, 500);
    const c = new LlmClient({ mode: 'record', fixtureDir: dir, transport, budget: new Budget(dir, undefined, () => undefined) });
    const r1 = await c.complete('intent_labels', req());
    const r2 = await c.complete('intent_labels', req());
    expect(transport).toHaveBeenCalledTimes(1);
    expect(r1.costUsd).toBeCloseTo(costUsd('claude-haiku-5-5', 2000, 500), 12);
    expect(r2).toEqual(r1);
    expect(readdirSync(dir)).toHaveLength(1);
    expect(fixtureSpendUsd(dir)).toBeCloseTo(r1.costUsd, 12);
  });
});

describe('Budget', () => {
  it('refuses a call that would push the total past the limit and allows one below it', () => {
    writeFileSync(join(dir, 'a.json'), JSON.stringify({ response: { costUsd: REFUSE_ABOVE_USD - 0.01 } }));
    const b = new Budget(dir, undefined, () => undefined);
    expect(b.spentUsd()).toBeCloseTo(REFUSE_ABOVE_USD - 0.01, 10);
    expect(() => b.assertCanSpend(0.005)).not.toThrow();
    expect(() => b.assertCanSpend(0.02)).toThrow(BudgetExceededError);
  });

  it('uses the larger of fixture spend and the SQLite ledger', () => {
    const store = Store.open(':memory:');
    store.logLlmCall({ purpose: 'tiebreak', model: 'm', inputTokens: 1, outputTokens: 1, costUsd: 1.5, latencyMs: 1 });
    const b = new Budget(dir, store, () => undefined);
    expect(b.spentUsd()).toBe(1.5);
    expect(() => b.assertCanSpend(0.4)).toThrow(BudgetExceededError);
  });

  it('prints the running total', () => {
    const lines: string[] = [];
    new Budget(dir, undefined, (l) => lines.push(l)).printRunning();
    expect(lines[0]).toContain('LLM spend so far: $0.0000');
  });

  it('a refused live call never reaches the transport', async () => {
    writeFileSync(join(dir, 'a.json'), JSON.stringify({ response: { costUsd: 1.7999 } }));
    const transport = okTransport('x');
    const c = new LlmClient({ mode: 'record', fixtureDir: dir, transport });
    await expect(c.complete('scratch_agent', req('y'.repeat(3000)))).rejects.toThrow(BudgetExceededError);
    expect(transport).not.toHaveBeenCalled();
  });
});

const target = (name: string, role = 'button'): Target => ({ role, accessibleName: name, label: '', placeholder: '', text: name, nearbyText: '', tag: 'button', inputType: '', attrs: {}, cssCandidates: [], bbox: null, frameUrl: '' });
const steps: StepInput[] = [
  { action: 'navigate', valueTemplate: 'http://x/' },
  { action: 'fill', valueTemplate: '{{query}}', target: target('Search books', 'textbox') },
  { action: 'click', target: target('Search') },
];

describe('intent labels', () => {
  it('builds a deterministic request (same input, same fixture key)', () => {
    expect(fixtureKey(buildLabelRequest({ task: 't', steps }))).toBe(fixtureKey(buildLabelRequest({ task: 't', steps })));
  });

  it('parses a valid reply into per-step labels', async () => {
    const reply = JSON.stringify({ intent: 'Search for a book', steps: ['open the shop', 'type the query', 'run the search'] });
    const llm = new LlmClient({ mode: 'record', fixtureDir: dir, transport: okTransport(`Sure!\n${reply}`), budget: new Budget(dir, undefined, () => undefined) });
    const labels = await labelWorkflow(llm, { task: 'Find a book', steps });
    expect(labels).toEqual({ intent: 'Search for a book', steps: ['open the shop', 'type the query', 'run the search'], source: 'llm' });
  });

  it('falls back to deterministic labels on bad JSON or the wrong number of steps', async () => {
    for (const bad of ['not json', JSON.stringify({ intent: 'x', steps: ['only one'] })]) {
      const d = mkdtempSync(join(tmpdir(), 'bma-fx-'));
      const llm = new LlmClient({ mode: 'record', fixtureDir: d, transport: okTransport(bad), budget: new Budget(d, undefined, () => undefined) });
      const labels = await labelWorkflow(llm, { task: 'Find a book', steps });
      expect(labels.source).toBe('fallback');
      expect(labels.steps).toEqual(steps.map(fallbackIntent));
    }
  });

  it('fallback intents read naturally for every action', () => {
    expect(fallbackIntent(steps[0]!)).toBe('open the start page');
    expect(fallbackIntent(steps[1]!)).toBe('type {{query}} into "Search books"');
    expect(fallbackIntent(steps[2]!)).toBe('click "Search"');
    expect(fallbackIntent({ action: 'check', valueTemplate: 'false', target: target('Vegan', 'checkbox') })).toBe('untick "Vegan"');
  });

  it('in replay mode a missing intent fixture is an error, not a silent network call', async () => {
    const llm = new LlmClient({ mode: 'replay', fixtureDir: dir });
    await expect(labelWorkflow(llm, { task: 't', steps })).rejects.toThrow(MissingFixtureError);
  });

  it('writes fixture files that contain the request and the response', async () => {
    const llm = new LlmClient({ mode: 'record', fixtureDir: dir, transport: okTransport('{"intent":"i","steps":["a","b","c"]}'), budget: new Budget(dir, undefined, () => undefined) });
    await labelWorkflow(llm, { task: 'Find a book', steps });
    const file = readdirSync(dir)[0]!;
    const fx = JSON.parse(readFileSync(join(dir, file), 'utf8')) as { request: LlmRequest; response: { costUsd: number } };
    expect(fx.request.messages[0]?.content).toContain('Find a book');
    expect(fx.response.costUsd).toBeGreaterThan(0);
  });
});
