import { randomUUID } from 'node:crypto';
import { openDb, type Db } from './db.ts';
import {
  TargetSchema,
  type ApprovalDecision,
  type ApprovalRow,
  type LlmCallInput,
  type LlmCallRow,
  type RunRow,
  type RunStatus,
  type RunStepInput,
  type RunStepRow,
  type StepRow,
  type Workflow,
  type WorkflowInput,
  type WorkflowRow,
} from './types.ts';

const now = () => new Date().toISOString();

interface WfDb {
  id: number;
  name: string;
  task: string;
  intent: string;
  start_url_pattern: string;
  params_json: string;
  version: number;
  created_at: string;
}
interface StepDb {
  id: number;
  workflow_id: number;
  idx: number;
  action: StepRow['action'];
  intent: string;
  url_pattern: string;
  value_template: string | null;
  target_json: string | null;
  created_at: string;
}
interface RunDb {
  id: string;
  workflow_id: number;
  strategy: string;
  mutation_level: string;
  seed: number;
  status: RunStatus;
  started_at: string;
  ended_at: string | null;
  duration_ms: number | null;
}
interface RunStepDb {
  run_id: string;
  idx: number;
  strategy_used: string;
  candidates_json: string;
  chosen_json: string | null;
  score: number | null;
  margin: number | null;
  retries: number;
  screenshot_path: string | null;
  error: string | null;
}
interface ApprovalDb {
  id: number;
  run_id: string;
  step_idx: number;
  summary_json: string;
  screenshot_path: string | null;
  decision: ApprovalDecision | null;
  decided_by: string | null;
  decided_at: string | null;
}

const toWf = (r: WfDb): WorkflowRow => ({
  id: r.id,
  name: r.name,
  task: r.task,
  intent: r.intent,
  startUrlPattern: r.start_url_pattern,
  params: JSON.parse(r.params_json) as Record<string, string>,
  version: r.version,
  createdAt: r.created_at,
});
const toStep = (r: StepDb): StepRow => ({
  id: r.id,
  workflowId: r.workflow_id,
  idx: r.idx,
  action: r.action,
  intent: r.intent,
  urlPattern: r.url_pattern,
  valueTemplate: r.value_template,
  target: r.target_json ? TargetSchema.parse(JSON.parse(r.target_json)) : null,
  createdAt: r.created_at,
});
const toRun = (r: RunDb): RunRow => ({
  id: r.id,
  workflowId: r.workflow_id,
  strategy: r.strategy,
  mutationLevel: r.mutation_level,
  seed: r.seed,
  status: r.status,
  startedAt: r.started_at,
  endedAt: r.ended_at,
  durationMs: r.duration_ms,
});
const toRunStep = (r: RunStepDb): RunStepRow => ({
  runId: r.run_id,
  idx: r.idx,
  strategyUsed: r.strategy_used,
  candidates: JSON.parse(r.candidates_json) as unknown[],
  chosen: r.chosen_json ? (JSON.parse(r.chosen_json) as unknown) : null,
  score: r.score,
  margin: r.margin,
  retries: r.retries,
  screenshotPath: r.screenshot_path,
  error: r.error,
});
const toApproval = (r: ApprovalDb): ApprovalRow => ({
  id: r.id,
  runId: r.run_id,
  stepIdx: r.step_idx,
  summary: JSON.parse(r.summary_json) as unknown,
  screenshotPath: r.screenshot_path,
  decision: r.decision,
  decidedBy: r.decided_by,
  decidedAt: r.decided_at,
});

/** Typed repository over the SQLite store. All writes that touch several rows are transactions. */
export class Store {
  constructor(readonly db: Db) {}

  static open(path = ':memory:'): Store {
    return new Store(openDb(path));
  }

  close(): void {
    this.db.close();
  }

  // ---- workflows and steps ----------------------------------------------

  /** Saves a workflow. Re-using a name creates the next version; old versions stay replayable. */
  createWorkflow(input: WorkflowInput): Workflow {
    const tx = this.db.transaction((): number => {
      const prev = this.db.prepare('SELECT MAX(version) AS v FROM workflows WHERE name = ?').get(input.name) as { v: number | null };
      const version = (prev.v ?? 0) + 1;
      const info = this.db
        .prepare(
          'INSERT INTO workflows (name, task, intent, start_url_pattern, params_json, version, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
        )
        .run(input.name, input.task, input.intent ?? '', input.startUrlPattern, JSON.stringify(input.params ?? {}), version, now());
      const id = Number(info.lastInsertRowid);
      const ins = this.db.prepare(
        'INSERT INTO steps (workflow_id, idx, action, intent, url_pattern, value_template, target_json, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
      );
      input.steps.forEach((s, idx) => {
        const target = s.target ? TargetSchema.parse(s.target) : null;
        ins.run(id, idx, s.action, s.intent ?? '', s.urlPattern ?? '', s.valueTemplate ?? null, target ? JSON.stringify(target) : null, now());
      });
      return id;
    });
    return this.getWorkflowById(tx())!;
  }

  getWorkflowById(id: number): Workflow | undefined {
    const row = this.db.prepare('SELECT * FROM workflows WHERE id = ?').get(id) as WfDb | undefined;
    return row ? this.withSteps(toWf(row)) : undefined;
  }

  /** Latest version by default. */
  getWorkflowByName(name: string, version?: number): Workflow | undefined {
    const row = (
      version === undefined
        ? this.db.prepare('SELECT * FROM workflows WHERE name = ? ORDER BY version DESC LIMIT 1').get(name)
        : this.db.prepare('SELECT * FROM workflows WHERE name = ? AND version = ?').get(name, version)
    ) as WfDb | undefined;
    return row ? this.withSteps(toWf(row)) : undefined;
  }

  /** Latest version of every workflow, newest first. */
  listWorkflows(): (WorkflowRow & { stepCount: number })[] {
    const rows = this.db
      .prepare(
        `SELECT w.*, (SELECT COUNT(*) FROM steps s WHERE s.workflow_id = w.id) AS step_count
         FROM workflows w
         WHERE w.version = (SELECT MAX(version) FROM workflows x WHERE x.name = w.name)
         ORDER BY w.created_at DESC, w.id DESC`,
      )
      .all() as (WfDb & { step_count: number })[];
    return rows.map((r) => ({ ...toWf(r), stepCount: r.step_count }));
  }

  deleteWorkflow(id: number): boolean {
    return this.db.prepare('DELETE FROM workflows WHERE id = ?').run(id).changes > 0;
  }

  private withSteps(wf: WorkflowRow): Workflow {
    const steps = (this.db.prepare('SELECT * FROM steps WHERE workflow_id = ? ORDER BY idx').all(wf.id) as StepDb[]).map(toStep);
    return { ...wf, steps };
  }

  /** Update only the intent labels of a workflow's steps (written by the intent-labelling pass). */
  setStepIntents(workflowId: number, intents: string[]): void {
    const upd = this.db.prepare('UPDATE steps SET intent = ? WHERE workflow_id = ? AND idx = ?');
    this.db.transaction(() => intents.forEach((t, idx) => upd.run(t, workflowId, idx)))();
  }

  setWorkflowIntent(workflowId: number, intent: string): void {
    this.db.prepare('UPDATE workflows SET intent = ? WHERE id = ?').run(intent, workflowId);
  }

  // ---- runs -------------------------------------------------------------

  startRun(o: { workflowId: number; strategy: string; mutationLevel?: string; seed?: number; id?: string }): RunRow {
    const id = o.id ?? randomUUID();
    this.db
      .prepare('INSERT INTO runs (id, workflow_id, strategy, mutation_level, seed, status, started_at) VALUES (?, ?, ?, ?, ?, ?, ?)')
      .run(id, o.workflowId, o.strategy, o.mutationLevel ?? 'none', o.seed ?? 0, 'running', now());
    return this.getRun(id)!;
  }

  setRunStatus(id: string, status: RunStatus): void {
    this.db.prepare('UPDATE runs SET status = ? WHERE id = ?').run(status, id);
  }

  finishRun(id: string, status: Exclude<RunStatus, 'running'>, durationMs: number): void {
    this.db.prepare('UPDATE runs SET status = ?, ended_at = ?, duration_ms = ? WHERE id = ?').run(status, now(), Math.round(durationMs), id);
  }

  getRun(id: string): RunRow | undefined {
    const r = this.db.prepare('SELECT * FROM runs WHERE id = ?').get(id) as RunDb | undefined;
    return r ? toRun(r) : undefined;
  }

  listRuns(workflowId?: number): RunRow[] {
    const rows = (
      workflowId === undefined
        ? this.db.prepare('SELECT * FROM runs ORDER BY started_at DESC')
        : this.db.prepare('SELECT * FROM runs WHERE workflow_id = ? ORDER BY started_at DESC').bind(workflowId)
    ).all() as RunDb[];
    return rows.map(toRun);
  }

  addRunStep(s: RunStepInput): void {
    this.db
      .prepare(
        `INSERT OR REPLACE INTO run_steps
         (run_id, idx, strategy_used, candidates_json, chosen_json, score, margin, retries, screenshot_path, error)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        s.runId,
        s.idx,
        s.strategyUsed,
        JSON.stringify(s.candidates ?? []),
        s.chosen === undefined || s.chosen === null ? null : JSON.stringify(s.chosen),
        s.score ?? null,
        s.margin ?? null,
        s.retries ?? 0,
        s.screenshotPath ?? null,
        s.error ?? null,
      );
  }

  getRunSteps(runId: string): RunStepRow[] {
    return (this.db.prepare('SELECT * FROM run_steps WHERE run_id = ? ORDER BY idx').all(runId) as RunStepDb[]).map(toRunStep);
  }

  // ---- approvals --------------------------------------------------------

  createApproval(o: { runId: string; stepIdx: number; summary: unknown; screenshotPath?: string | null }): ApprovalRow {
    const info = this.db
      .prepare('INSERT INTO approvals (run_id, step_idx, summary_json, screenshot_path) VALUES (?, ?, ?, ?)')
      .run(o.runId, o.stepIdx, JSON.stringify(o.summary), o.screenshotPath ?? null);
    return this.getApproval(Number(info.lastInsertRowid))!;
  }

  decideApproval(id: number, decision: ApprovalDecision, decidedBy: string): ApprovalRow {
    const res = this.db
      .prepare('UPDATE approvals SET decision = ?, decided_by = ?, decided_at = ? WHERE id = ? AND decision IS NULL')
      .run(decision, decidedBy, now(), id);
    if (res.changes === 0) throw new Error(`approval ${id} does not exist or was already decided`);
    return this.getApproval(id)!;
  }

  getApproval(id: number): ApprovalRow | undefined {
    const r = this.db.prepare('SELECT * FROM approvals WHERE id = ?').get(id) as ApprovalDb | undefined;
    return r ? toApproval(r) : undefined;
  }

  listApprovals(runId?: string): ApprovalRow[] {
    const rows = (
      runId === undefined
        ? this.db.prepare('SELECT * FROM approvals ORDER BY id')
        : this.db.prepare('SELECT * FROM approvals WHERE run_id = ? ORDER BY id').bind(runId)
    ).all() as ApprovalDb[];
    return rows.map(toApproval);
  }

  pendingApprovals(): ApprovalRow[] {
    return (this.db.prepare('SELECT * FROM approvals WHERE decision IS NULL ORDER BY id').all() as ApprovalDb[]).map(toApproval);
  }

  // ---- llm ledger -------------------------------------------------------

  logLlmCall(c: LlmCallInput): LlmCallRow {
    const info = this.db
      .prepare(
        'INSERT INTO llm_calls (purpose, model, input_tokens, output_tokens, cost_usd, latency_ms, fixture_key, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
      )
      .run(c.purpose, c.model, c.inputTokens, c.outputTokens, c.costUsd, c.latencyMs, c.fixtureKey ?? null, now());
    const r = this.db.prepare('SELECT * FROM llm_calls WHERE id = ?').get(Number(info.lastInsertRowid)) as {
      id: number; purpose: string; model: string; input_tokens: number; output_tokens: number; cost_usd: number; latency_ms: number; fixture_key: string | null; created_at: string;
    };
    return { id: r.id, purpose: r.purpose, model: r.model, inputTokens: r.input_tokens, outputTokens: r.output_tokens, costUsd: r.cost_usd, latencyMs: r.latency_ms, fixtureKey: r.fixture_key, createdAt: r.created_at };
  }

  totalLlmCostUsd(): number {
    return (this.db.prepare('SELECT COALESCE(SUM(cost_usd), 0) AS t FROM llm_calls').get() as { t: number }).t;
  }

  // ---- embedding cache --------------------------------------------------

  getEmbedding(textHash: string, model: string): Float32Array | undefined {
    const r = this.db.prepare('SELECT vector, dims FROM embeddings WHERE text_hash = ? AND model = ?').get(textHash, model) as
      | { vector: Buffer; dims: number }
      | undefined;
    if (!r) return undefined;
    const copy = new Uint8Array(r.vector).buffer;
    return new Float32Array(copy, 0, r.dims);
  }

  putEmbedding(textHash: string, model: string, vector: Float32Array): void {
    this.db
      .prepare('INSERT OR REPLACE INTO embeddings (text_hash, model, dims, vector) VALUES (?, ?, ?, ?)')
      .run(textHash, model, vector.length, Buffer.from(vector.buffer, vector.byteOffset, vector.byteLength));
  }
}
