import { beforeEach, describe, expect, it } from 'vitest';
import { migrate, MIGRATIONS, openDb } from '../src/memory/db.ts';
import { Store } from '../src/memory/store.ts';
import type { Target, WorkflowInput } from '../src/memory/types.ts';

const target = (over: Partial<Target> = {}): Target => ({
  role: 'button',
  accessibleName: 'Search',
  label: '',
  placeholder: '',
  text: 'Search',
  nearbyText: 'Search books',
  tag: 'button',
  inputType: 'submit',
  attrs: { type: 'submit' },
  cssCandidates: ['#f-search', 'button[data-testid="search-btn"]'],
  bbox: { x: 1, y: 2, width: 3, height: 4 },
  frameUrl: 'http://127.0.0.1:4173/bookshop/',
  ...over,
});

const wf = (name = 'find-book'): WorkflowInput => ({
  name,
  task: 'Find a {{query}} book',
  startUrlPattern: 'http://127.0.0.1:*/bookshop/',
  params: { query: 'rust' },
  steps: [
    { action: 'navigate', urlPattern: '/bookshop/' },
    { action: 'fill', valueTemplate: '{{query}}', target: target({ role: 'textbox', accessibleName: 'Search books', tag: 'input' }) },
    { action: 'click', target: target() },
  ],
});

let store: Store;
beforeEach(() => {
  store = Store.open(':memory:');
});

describe('migrations', () => {
  it('sets user_version to the number of migrations and is idempotent', () => {
    expect(store.db.pragma('user_version', { simple: true })).toBe(MIGRATIONS.length);
    expect(migrate(store.db)).toBe(MIGRATIONS.length);
    expect(store.db.pragma('user_version', { simple: true })).toBe(MIGRATIONS.length);
  });

  it('creates the seven documented tables', () => {
    const names = (store.db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'").all() as { name: string }[]).map((r) => r.name).sort();
    expect(names).toEqual(['approvals', 'embeddings', 'llm_calls', 'run_steps', 'runs', 'steps', 'workflows']);
  });

  it('enables foreign keys', () => {
    expect(openDb(':memory:').pragma('foreign_keys', { simple: true })).toBe(1);
  });
});

describe('workflows and steps', () => {
  it('round-trips a workflow with typed targets', () => {
    const saved = store.createWorkflow(wf());
    expect(saved.version).toBe(1);
    expect(saved.steps).toHaveLength(3);
    expect(saved.steps[1]?.target?.accessibleName).toBe('Search books');
    expect(saved.steps[0]?.target).toBeNull();
    expect(saved.params).toEqual({ query: 'rust' });
    expect(store.getWorkflowByName('find-book')?.id).toBe(saved.id);
  });

  it('creates a new version when a name is reused and returns the latest by default', () => {
    const v1 = store.createWorkflow(wf());
    const v2 = store.createWorkflow(wf());
    expect(v2.version).toBe(2);
    expect(store.getWorkflowByName('find-book')?.id).toBe(v2.id);
    expect(store.getWorkflowByName('find-book', 1)?.id).toBe(v1.id);
    expect(store.listWorkflows()).toHaveLength(1);
  });

  it('lists latest versions with step counts', () => {
    store.createWorkflow(wf('a'));
    store.createWorkflow(wf('b'));
    const list = store.listWorkflows();
    expect(list.map((w) => w.name).sort()).toEqual(['a', 'b']);
    expect(list.every((w) => w.stepCount === 3)).toBe(true);
  });

  it('rejects an invalid action and an invalid target shape', () => {
    expect(() => store.createWorkflow({ ...wf(), steps: [{ action: 'explode' as never }] })).toThrow();
    expect(() => store.createWorkflow({ ...wf(), steps: [{ action: 'click', target: { role: 'x' } as unknown as Target }] })).toThrow();
    expect(store.listWorkflows()).toHaveLength(0); // transaction rolled back
  });

  it('stores intent labels', () => {
    const w = store.createWorkflow(wf());
    store.setStepIntents(w.id, ['open shop', 'type the query', 'run the search']);
    store.setWorkflowIntent(w.id, 'find a book');
    const again = store.getWorkflowById(w.id)!;
    expect(again.steps.map((s) => s.intent)).toEqual(['open shop', 'type the query', 'run the search']);
    expect(again.intent).toBe('find a book');
  });

  it('cascades deletes to steps and runs', () => {
    const w = store.createWorkflow(wf());
    const r = store.startRun({ workflowId: w.id, strategy: 'css-only' });
    store.addRunStep({ runId: r.id, idx: 0, strategyUsed: 'css' });
    expect(store.deleteWorkflow(w.id)).toBe(true);
    expect(store.db.prepare('SELECT COUNT(*) AS n FROM steps').get()).toEqual({ n: 0 });
    expect(store.getRun(r.id)).toBeUndefined();
    expect(store.getRunSteps(r.id)).toEqual([]);
  });
});

describe('runs and run steps', () => {
  it('records a run lifecycle and its steps', () => {
    const w = store.createWorkflow(wf());
    const run = store.startRun({ workflowId: w.id, strategy: 'semantic-minilm', mutationLevel: 'medium', seed: 100 });
    expect(run.status).toBe('running');
    store.addRunStep({ runId: run.id, idx: 0, strategyUsed: 'role', candidates: [{ name: 'a', score: 1 }], chosen: { name: 'a' }, score: 1, margin: 0.5, retries: 2 });
    store.addRunStep({ runId: run.id, idx: 1, strategyUsed: 'none', error: 'refused', screenshotPath: 'runs/x/1.png' });
    store.finishRun(run.id, 'failed', 1234.6);
    const done = store.getRun(run.id)!;
    expect(done).toMatchObject({ status: 'failed', durationMs: 1235, mutationLevel: 'medium', seed: 100 });
    expect(done.endedAt).not.toBeNull();
    const steps = store.getRunSteps(run.id);
    expect(steps).toHaveLength(2);
    expect(steps[0]).toMatchObject({ strategyUsed: 'role', retries: 2, margin: 0.5, chosen: { name: 'a' } });
    expect(steps[1]).toMatchObject({ error: 'refused', chosen: null, screenshotPath: 'runs/x/1.png' });
    expect(store.listRuns(w.id)).toHaveLength(1);
  });

  it('rejects an unknown run status', () => {
    const w = store.createWorkflow(wf());
    const run = store.startRun({ workflowId: w.id, strategy: 's' });
    expect(() => store.setRunStatus(run.id, 'weird' as never)).toThrow();
  });

  it('replacing a run step keeps one row per index', () => {
    const w = store.createWorkflow(wf());
    const run = store.startRun({ workflowId: w.id, strategy: 's' });
    store.addRunStep({ runId: run.id, idx: 0, strategyUsed: 'css' });
    store.addRunStep({ runId: run.id, idx: 0, strategyUsed: 'role' });
    expect(store.getRunSteps(run.id).map((s) => s.strategyUsed)).toEqual(['role']);
  });
});

describe('approvals', () => {
  it('creates a pending approval and records exactly one decision', () => {
    const w = store.createWorkflow(wf());
    const run = store.startRun({ workflowId: w.id, strategy: 's' });
    const a = store.createApproval({ runId: run.id, stepIdx: 2, summary: { fields: [{ label: 'Name', value: 'Alex' }] }, screenshotPath: 'p.png' });
    expect(a.decision).toBeNull();
    expect(store.pendingApprovals()).toHaveLength(1);
    const decided = store.decideApproval(a.id, 'denied', 'cli');
    expect(decided).toMatchObject({ decision: 'denied', decidedBy: 'cli' });
    expect(store.pendingApprovals()).toHaveLength(0);
    expect(() => store.decideApproval(a.id, 'approved', 'mcp')).toThrow(/already decided/);
    expect(store.listApprovals(run.id)).toHaveLength(1);
  });

  it('rejects an invalid decision value', () => {
    const w = store.createWorkflow(wf());
    const run = store.startRun({ workflowId: w.id, strategy: 's' });
    const a = store.createApproval({ runId: run.id, stepIdx: 0, summary: {} });
    expect(() => store.decideApproval(a.id, 'maybe' as never, 'cli')).toThrow();
  });
});

describe('llm ledger and embedding cache', () => {
  it('sums LLM cost across calls and is zero when empty', () => {
    expect(store.totalLlmCostUsd()).toBe(0);
    store.logLlmCall({ purpose: 'intent_labels', model: 'm', inputTokens: 100, outputTokens: 20, costUsd: 0.0012, latencyMs: 300, fixtureKey: 'abc' });
    store.logLlmCall({ purpose: 'tiebreak', model: 'm', inputTokens: 10, outputTokens: 2, costUsd: 0.0003, latencyMs: 100 });
    expect(store.totalLlmCostUsd()).toBeCloseTo(0.0015, 10);
  });

  it('round-trips a float32 embedding keyed by (hash, model)', () => {
    const v = new Float32Array([0.5, -1.25, 3]);
    store.putEmbedding('h1', 'minilm', v);
    expect([...store.getEmbedding('h1', 'minilm')!]).toEqual([0.5, -1.25, 3]);
    expect(store.getEmbedding('h1', 'other')).toBeUndefined();
    store.putEmbedding('h1', 'minilm', new Float32Array([9, 9, 9]));
    expect([...store.getEmbedding('h1', 'minilm')!]).toEqual([9, 9, 9]);
  });
});
