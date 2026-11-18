import { mkdtempSync } from 'node:fs';
import { existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { chromium, type Browser } from 'playwright';
import { allApps } from '../demo-apps/apps/index.ts';
import { mutate } from '../demo-apps/mutate.ts';
import { startDemoServer, type DemoServer } from '../demo-apps/server.ts';
import { evaluateSuccess, fetchState, loadFlows } from '../src/bench/flows.ts';
import { loadRecordings } from '../src/bench/recordings.ts';
import { Store } from '../src/memory/store.ts';
import { importRecording } from '../src/recorder/golden.ts';
import { Allowlist, BlockedUrlError } from '../src/safety/allowlist.ts';
import { DenyAllProvider, benchmarkApproval, type ApprovalProvider } from '../src/replay/approval.ts';
import { replayWorkflow, ReplayError } from '../src/replay/engine.ts';

let browser: Browser;
let srv: DemoServer;
let store: Store;
const flows = loadFlows();
const recs = loadRecordings();
const runsDir = mkdtempSync(join(tmpdir(), 'runs-'));

beforeAll(async () => {
  browser = await chromium.launch();
  srv = await startDemoServer({ port: 0, apps: allApps, mutator: mutate });
});
afterAll(async () => {
  await browser?.close();
  await srv?.close();
});
beforeEach(() => {
  store = Store.open(':memory:');
});

const wf = (flowId: string) => importRecording(store, recs.find((r) => r.flowId === flowId)!);
const flow = (id: string) => flows.find((f) => f.id === id)!;
const approve = () => benchmarkApproval(`${srv.url}/`, new Allowlist({ ports: [srv.port] }));

function opts(extra: Partial<Parameters<typeof replayWorkflow>[1]> = {}) {
  return { store, browser, base: srv.url, strategy: 'semantic-hash', approval: approve(), runsDir, ...extra };
}

describe('replay on unmutated pages', () => {
  it.each(['bookshop-sql-cart', 'docs-install-examples', 'jobs-save-analyst', 'recipes-vegan-pasta', 'library-author-filter'])('%s succeeds by the server-side check', async (id) => {
    const res = await replayWorkflow(wf(id), opts());
    expect(res.status).toBe('success');
    expect(evaluateSuccess(flow(id), await fetchState(srv.url, res.sid))).toBe(true);
    expect(res.blockedRequests).toEqual([]);
    const run = store.getRun(res.runId)!;
    expect(run.status).toBe('success');
    expect(store.getRunSteps(res.runId).length).toBe(res.steps.length);
  });

  it('records which strategy resolved each step', async () => {
    const res = await replayWorkflow(wf('bookshop-sql-cart'), opts());
    const used = new Set(res.steps.map((s) => s.strategyUsed));
    expect([...used].every((u) => ['navigate', 'css', 'role', 'semantic', 'none'].includes(u))).toBe(true);
    expect(res.steps.some((s) => s.strategyUsed === 'css')).toBe(true);
  });

  it('works under heavy mutation for a simple flow and may refuse but never errors out', async () => {
    const res = await replayWorkflow(wf('recipes-soup'), opts({ mutationLevel: 'heavy', seed: 1 }));
    expect(['success', 'failed']).toContain(res.status);
    expect(res.blockedRequests).toEqual([]);
  });
});

describe('approval gate end to end', () => {
  it('a denied approval stops before the submit and leaves the submission count at 0', async () => {
    const res = await replayWorkflow(wf('helpdesk-billing'), opts({ approval: new DenyAllProvider() }));
    expect(res.status).toBe('denied');
    const state = await fetchState(srv.url, res.sid);
    expect(state.submissions).toBe(0);
    expect(state.events.some((e) => e.type === 'ticket')).toBe(false);
    expect(store.listApprovals(res.runId).at(-1)).toMatchObject({ decision: 'denied' });
    expect(store.getRun(res.runId)!.status).toBe('denied');
  });

  it('a timed-out approval also leaves the count at 0', async () => {
    const never: ApprovalProvider = { name: 'never', decide: () => new Promise(() => undefined) };
    const res = await replayWorkflow(wf('library-place-hold'), opts({ approval: never, approvalTimeoutMs: 200 }));
    expect(res.status).toBe('denied');
    expect((await fetchState(srv.url, res.sid)).submissions).toBe(0);
    expect(store.listApprovals(res.runId).at(-1)).toMatchObject({ decision: 'timeout' });
  });

  it('an approved run submits exactly once and records the approval', async () => {
    const res = await replayWorkflow(wf('helpdesk-technical'), opts());
    expect(res.status).toBe('success');
    const state = await fetchState(srv.url, res.sid);
    expect(state.submissions).toBe(1);
    expect(evaluateSuccess(flow('helpdesk-technical'), state)).toBe(true);
    const approvals = store.listApprovals(res.runId);
    expect(approvals.length).toBeGreaterThanOrEqual(3); // two Continue posts and the final submit
    expect(approvals.every((a) => a.decision === 'approved' && a.decidedBy === 'benchmark-flag')).toBe(true);
  });
});

describe('failures and safety', () => {
  it('refuses a step it cannot resolve: run fails, screenshot and candidates are saved, nothing submitted', async () => {
    const w = wf('library-place-hold');
    const broken = store.createWorkflow({
      name: 'broken',
      task: w.task,
      startUrlPattern: w.startUrlPattern,
      params: w.params,
      steps: w.steps.map((s, i) => (i === 3 && s.target ? { ...s, target: { ...s.target, accessibleName: 'Zzz unrelated quux', text: 'Zzz', label: '', placeholder: '', nearbyText: '', role: 'link', cssCandidates: [] } } : s)),
    });
    const res = await replayWorkflow(broken, opts({ cfg: { ...(await import('../src/resolver/config.ts')).loadResolverConfig(), retry: { attempts: 2, delaysMs: [50] } } }));
    expect(res.status).toBe('failed');
    const bad = res.steps.find((s) => !s.ok)!;
    expect(bad.error).toContain('refused');
    expect(existsSync(bad.screenshotPath!)).toBe(true);
    expect((await fetchState(srv.url, res.sid)).submissions).toBe(0);
    expect(store.getRunSteps(res.runId).at(-1)?.error).toContain('refused');
  });

  it('refuses a non-local base before opening a browser context', async () => {
    await expect(replayWorkflow(wf('recipes-soup'), opts({ base: 'https://example.com' }))).rejects.toThrow(BlockedUrlError);
    expect(store.listRuns()).toHaveLength(0);
  });

  it('fails early with a clear message for a missing parameter and for an unknown strategy', async () => {
    const w = store.createWorkflow({ name: 'p', task: 't', startUrlPattern: 'x', params: {}, steps: [{ action: 'navigate', valueTemplate: `${srv.url}/recipes/?q={{needed}}` }] });
    await expect(replayWorkflow(w, opts())).rejects.toThrow(/missing parameter needed/);
    await expect(replayWorkflow(wf('recipes-soup'), opts({ strategy: 'nope' }))).rejects.toThrow(ReplayError);
  });

  it('parameters override recorded defaults', async () => {
    const res = await replayWorkflow(wf('recipes-soup'), opts({ params: { q: 'pasta' } }));
    const state = await fetchState(srv.url, res.sid);
    expect(state.events.some((e) => e.type === 'recipe_search' && e.data.q === 'pasta')).toBe(true);
    expect(res.status).toBe('failed'); // the soup page link no longer exists in pasta results: refused, not guessed
    expect(state.events.some((e) => e.type === 'recipe_view')).toBe(false);
  });
});
