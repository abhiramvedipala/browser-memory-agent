import { randomUUID } from 'node:crypto';
import { join } from 'node:path';
import type { Browser, ElementHandle, Page } from 'playwright';
import { RUNS_DIR } from '../config.ts';
import { interpolate } from '../bench/flows.ts';
import type { Store } from '../memory/store.ts';
import type { StepRow, Workflow } from '../memory/types.ts';
import { installPageScript } from '../recorder/page-script.ts';
import { rebase, urlMatches } from '../recorder/url.ts';
import { loadResolverConfig, type ResolverConfig } from '../resolver/config.ts';
import { type LlmPick } from '../resolver/chain.ts';
import type { Resolution } from '../resolver/types.ts';
import { Allowlist } from '../safety/allowlist.ts';
import { newGuardedContext } from '../safety/guard.ts';
import { gateStep, needsApproval, readFormInfo, type ApprovalProvider } from './approval.ts';
import { resolveWithRetry } from './retry.ts';
import { STRATEGIES, makeEmbedder } from './strategies.ts';

export interface StepObservation {
  idx: number;
  step: StepRow;
  handle: ElementHandle;
  resolution: Resolution;
}

export interface ReplayOptions {
  store: Store;
  browser: Browser;
  /** Origin of the demo server, e.g. http://127.0.0.1:4173. Must pass the allowlist. */
  base: string;
  strategy?: string;
  /** none | light | medium | heavy | op:<operator> */
  mutationLevel?: string;
  seed?: number;
  params?: Record<string, string>;
  approval: ApprovalProvider;
  approvalTimeoutMs?: number;
  runsDir?: string;
  cfg?: ResolverConfig;
  llmPick?: LlmPick;
  /** Called after a step resolves and before it acts; the benchmark scorer uses it (and only it) to read ground truth. */
  observe?: (o: StepObservation) => Promise<void>;
  sid?: string;
  /** Use this id for the run row (the MCP server hands it out before the replay starts). */
  runId?: string;
  headless?: boolean;
  log?: (line: string) => void;
}

export interface StepResult {
  idx: number;
  action: string;
  ok: boolean;
  strategyUsed: string;
  retries: number;
  score: number | null;
  margin: number | null;
  error?: string;
  screenshotPath?: string;
  urlMismatch?: boolean;
}

export interface ReplaySummary {
  runId: string;
  sid: string;
  status: 'success' | 'failed' | 'denied';
  steps: StepResult[];
  durationMs: number;
  blockedRequests: string[];
}

export class ReplayError extends Error {}

const ACTION_TIMEOUT_MS = 8000;

async function act(page: Page, step: StepRow, handle: ElementHandle, value: string): Promise<void> {
  const opts = { timeout: ACTION_TIMEOUT_MS };
  switch (step.action) {
    case 'click':
      await handle.click(opts);
      break;
    case 'fill':
      await handle.fill(value, opts);
      break;
    case 'select':
      await handle.selectOption({ value }, opts).then((r) => (r.length ? r : handle.selectOption({ label: value }, opts)));
      break;
    case 'check':
      if (value === 'false') await handle.uncheck(opts);
      else await handle.check(opts);
      break;
    case 'press':
      await handle.press(value || 'Enter', opts);
      break;
    case 'submit':
      await handle.evaluate((el) => {
        const e = el as unknown as HTMLElement & { form?: HTMLFormElement | null };
        const form = e.tagName === 'FORM' ? (e as unknown as HTMLFormElement) : (e.form ?? e.closest('form'));
        if (form) form.requestSubmit();
        else e.click();
      });
      break;
    default:
      throw new ReplayError(`unsupported action ${step.action}`);
  }
  await page.waitForLoadState('load', { timeout: ACTION_TIMEOUT_MS }).catch(() => undefined);
}

/** Replay a stored workflow in a guarded browser context. */
export async function replayWorkflow(workflow: Workflow, o: ReplayOptions): Promise<ReplaySummary> {
  const strategyName = o.strategy ?? 'semantic-minilm';
  const def = STRATEGIES[strategyName];
  if (!def) throw new ReplayError(`unknown strategy "${strategyName}"; use one of ${Object.keys(STRATEGIES).join(', ')}`);
  const baseUrl = new URL(o.base);
  new Allowlist({ ports: [Number(baseUrl.port || 80)] }).assert(o.base);
  const allowlist = new Allowlist({ ports: [Number(baseUrl.port || 80)] });

  const params = { ...workflow.params, ...(o.params ?? {}) };
  for (const s of workflow.steps) {
    const missing = [...(s.valueTemplate ?? '').matchAll(/\{\{(\w+)\}\}/g)].map((m) => m[1]!).filter((k) => !(k in params));
    if (missing.length) throw new ReplayError(`missing parameter ${missing[0]}; pass --param ${missing[0]}=<value>`);
  }

  const cfg = o.cfg ?? loadResolverConfig();
  const embedder = makeEmbedder(def.embedder, o.store);
  const sid = o.sid ?? randomUUID();
  const level = o.mutationLevel ?? 'none';
  const seed = o.seed ?? 0;
  const run = o.store.startRun({ workflowId: workflow.id, strategy: strategyName, mutationLevel: level, seed, id: o.runId });
  const runDir = join(o.runsDir ?? RUNS_DIR, run.id);
  const log = o.log ?? (() => undefined);
  const started = Date.now();
  const results: StepResult[] = [];
  let status: ReplaySummary['status'] = 'success';

  const { context, stats } = await newGuardedContext(o.browser, allowlist);
  try {
    await context.addCookies([{ name: 'bma_sid', value: sid, url: o.base }]);
    await installPageScript(context);
    const page = await context.newPage();

    for (const step of workflow.steps) {
      const base: StepResult = { idx: step.idx, action: step.action, ok: false, strategyUsed: 'none', retries: 0, score: null, margin: null };

      if (step.action === 'navigate') {
        const q = level === 'none' ? '' : `${step.valueTemplate?.includes('?') ? '&' : '?'}mut=${level}&seed=${seed}`;
        const url = `${rebase(interpolate(step.valueTemplate ?? '', params), o.base)}${q}`;
        allowlist.assert(url);
        await page.goto(url);
        results.push({ ...base, ok: true });
        o.store.addRunStep({ runId: run.id, idx: step.idx, strategyUsed: 'navigate' });
        log(`  ${step.idx}: navigate ${url}`);
        continue;
      }
      if (!step.target) throw new ReplayError(`step ${step.idx} (${step.action}) has no target`);

      const urlMismatch = !urlMatches(step.urlPattern, page.url());
      const r = await resolveWithRetry(page, step.target, def.chain, { embedder, cfg, llmPick: o.llmPick }, { runDir, stepIdx: step.idx });
      const res = r.resolution;
      const common = { ...base, retries: r.retries, score: res.score, margin: res.margin, urlMismatch, screenshotPath: r.screenshotPath };
      if (!res.ok || !res.locator) {
        const error = `refused: ${res.reason ?? 'no match'}`;
        results.push({ ...common, error });
        o.store.addRunStep({ runId: run.id, idx: step.idx, strategyUsed: 'none', candidates: res.top, score: res.score, margin: res.margin, retries: r.retries, screenshotPath: r.screenshotPath, error });
        log(`  ${step.idx}: ${step.action} REFUSED (${res.reason})`);
        status = 'failed';
        break;
      }
      const handle = await res.locator.elementHandle({ timeout: ACTION_TIMEOUT_MS });
      if (!handle) {
        results.push({ ...common, error: 'element vanished before the action' });
        status = 'failed';
        break;
      }
      const chosen = { name: res.candidate?.accessibleName, role: res.candidate?.role, via: res.strategy };
      const value = interpolate(step.valueTemplate ?? '', params);
      await o.observe?.({ idx: step.idx, step, handle, resolution: res });

      const info = ['click', 'press', 'submit'].includes(step.action) ? await readFormInfo(handle) : null;
      if (needsApproval(step.action, step.valueTemplate, info)) {
        const gate = await gateStep({ page, store: o.store, runId: run.id, stepIdx: step.idx, action: step.action, handle, provider: o.approval, runDir, timeoutMs: o.approvalTimeoutMs });
        if (gate.decision !== 'approved') {
          const error = `approval ${gate.decision}: step not performed`;
          results.push({ ...common, strategyUsed: res.strategy, error });
          o.store.addRunStep({ runId: run.id, idx: step.idx, strategyUsed: res.strategy, candidates: res.top, chosen, score: res.score, margin: res.margin, retries: r.retries, error });
          log(`  ${step.idx}: ${step.action} ${error}`);
          status = 'denied';
          break;
        }
      }
      try {
        await act(page, step, handle, value);
      } catch (e) {
        const error = `action failed: ${(e as Error).message.split('\n')[0]}`;
        results.push({ ...common, strategyUsed: res.strategy, error });
        o.store.addRunStep({ runId: run.id, idx: step.idx, strategyUsed: res.strategy, candidates: res.top, chosen, score: res.score, margin: res.margin, retries: r.retries, error });
        status = 'failed';
        break;
      }
      results.push({ ...common, ok: true, strategyUsed: res.strategy });
      o.store.addRunStep({ runId: run.id, idx: step.idx, strategyUsed: res.strategy, candidates: res.top, chosen: { ...chosen, urlMismatch }, score: res.score, margin: res.margin, retries: r.retries });
      log(`  ${step.idx}: ${step.action} via ${res.strategy}${r.retries ? ` after ${r.retries} retries` : ''}`);
    }
  } catch (e) {
    status = 'failed';
    results.push({ idx: results.length, action: 'error', ok: false, strategyUsed: 'none', retries: 0, score: null, margin: null, error: (e as Error).message });
    throw e;
  } finally {
    const durationMs = Date.now() - started;
    o.store.finishRun(run.id, status, durationMs);
    await context.close().catch(() => undefined);
  }
  return { runId: run.id, sid, status, steps: results, durationMs: Date.now() - started, blockedRequests: stats.blocked };
}
