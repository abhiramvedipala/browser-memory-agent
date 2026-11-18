import { randomUUID } from 'node:crypto';
import type { Browser } from 'playwright';
import { chromium } from 'playwright';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import type { Store } from '../memory/store.ts';
import { recordSession } from '../recorder/session.ts';
import { ManualApprovalProvider, type ApprovalRequest } from '../replay/approval.ts';
import { replayWorkflow, type ReplaySummary } from '../replay/engine.ts';
import { STRATEGIES } from '../replay/strategies.ts';
import { Allowlist, BlockedUrlError } from '../safety/allowlist.ts';

export const SAFETY_NOTE =
  'Only the local demo apps served by this repo on http://127.0.0.1 are supported; any other URL is rejected. ' +
  'Logins, passwords, payments and CAPTCHAs are never automated, and every form submission waits for approve_submission.';

export interface McpDeps {
  store: Store;
  /** Origin of the demo server, e.g. http://127.0.0.1:4173. */
  base: string;
  getBrowser?: (headless: boolean) => Promise<Browser>;
  headlessRecording?: boolean;
  /** How long a replay call waits for a terminal state or a pending approval before returning `running`. */
  waitMs?: number;
}

type Json = Record<string, unknown>;
const ok = (data: Json) => ({ content: [{ type: 'text' as const, text: JSON.stringify(data, null, 2) }], structuredContent: data });
const fail = (message: string) => ({ content: [{ type: 'text' as const, text: message }], isError: true });

/** A replay running in the background: it either finishes or pauses on an approval. */
class LiveRun {
  pending?: ApprovalRequest;
  private wake: () => void = () => undefined;
  paused: Promise<void> = this.rearm();
  constructor(readonly done: Promise<ReplaySummary | Error>) {}
  rearm(): Promise<void> {
    this.pending = undefined;
    this.paused = new Promise<void>((r) => {
      this.wake = r;
    });
    return this.paused;
  }
  pause(req: ApprovalRequest): void {
    this.pending = req;
    this.wake();
  }
}

/** Build the MCP server. Tools are thin wrappers over the store, recorder and replay engine. */
export function createMcpServer(deps: McpDeps): { server: McpServer; approvals: ManualApprovalProvider; close(): Promise<void> } {
  const allowlist = new Allowlist({ ports: [Number(new URL(deps.base).port || 80)] });
  allowlist.assert(deps.base);
  const approvals = new ManualApprovalProvider();
  const live = new Map<string, LiveRun>();
  const browsers: Browser[] = [];
  const getBrowser =
    deps.getBrowser ??
    (async (headless: boolean) => {
      const b = await chromium.launch({ headless });
      browsers.push(b);
      return b;
    });

  const server = new McpServer({ name: 'browser-memory-agent', version: '0.1.0' });

  const checkUrl = (u: string) => {
    const r = allowlist.check(u);
    return r.ok ? null : fail(new BlockedUrlError(u, r.reason ?? 'not allowed').message);
  };

  /** Wait until the run finishes or pauses for an approval, then describe its state. */
  async function settle(runId: string): Promise<Json> {
    const lr = live.get(runId);
    if (!lr) return describeRun(runId);
    const timeout = new Promise<'wait'>((r) => setTimeout(() => r('wait'), deps.waitMs ?? 60_000));
    const outcome = await Promise.race([lr.done, lr.paused.then(() => 'pending' as const), timeout]);
    if (outcome === 'pending' && lr.pending) {
      const p = lr.pending;
      return { status: 'pending_approval', run_id: runId, approval_id: p.approvalId, step: p.stepIdx, control: p.summary.control, fields: p.summary.fields, screenshot_path: p.screenshotPath, next: 'call approve_submission with approve true or false' };
    }
    if (outcome === 'wait') return { status: 'running', run_id: runId, next: 'call get_run later' };
    live.delete(runId);
    if (outcome instanceof Error) return { status: 'error', run_id: runId, error: outcome.message };
    return describeRun(runId);
  }

  function describeRun(runId: string): Json {
    const run = deps.store.getRun(runId);
    if (!run) return { status: 'unknown_run', run_id: runId };
    const steps = deps.store.getRunSteps(runId).map((s) => ({ idx: s.idx, strategy: s.strategyUsed, score: s.score, margin: s.margin, retries: s.retries, error: s.error, screenshot_path: s.screenshotPath }));
    const appr = deps.store.listApprovals(runId).map((a) => ({ id: a.id, step: a.stepIdx, decision: a.decision, decided_by: a.decidedBy }));
    return { status: run.status, run_id: runId, strategy: run.strategy, duration_ms: run.durationMs, steps, approvals: appr };
  }

  approvals.onRequest = (req) => live.get(req.runId)?.pause(req);

  server.registerTool(
    'list_workflows',
    { description: `List recorded workflows (latest version of each). ${SAFETY_NOTE}`, inputSchema: {} },
    async () => ok({ workflows: deps.store.listWorkflows().map((w) => ({ name: w.name, version: w.version, task: w.task, steps: w.stepCount, params: w.params })) }),
  );

  server.registerTool(
    'get_workflow',
    { description: 'Get one workflow with its steps (action, intent, value template, target role and name).', inputSchema: { name: z.string(), version: z.number().int().optional() } },
    async ({ name, version }) => {
      const wf = deps.store.getWorkflowByName(name, version);
      if (!wf) return fail(`No workflow named "${name}".`);
      return ok({
        name: wf.name,
        version: wf.version,
        task: wf.task,
        params: wf.params,
        steps: wf.steps.map((s) => ({ idx: s.idx, action: s.action, intent: s.intent, value: s.valueTemplate, role: s.target?.role, name: s.target?.accessibleName })),
      });
    },
  );

  server.registerTool(
    'record_workflow',
    {
      description: `Open a browser window on a local demo app and record what the person does as a named workflow. The recording is saved when the window is closed. ${SAFETY_NOTE}`,
      inputSchema: { start_url: z.string(), name: z.string().min(1), task: z.string().optional(), params: z.record(z.string(), z.string()).optional() },
    },
    async ({ start_url, name, task, params }) => {
      const bad = checkUrl(start_url);
      if (bad) return bad;
      const browser = await getBrowser(deps.headlessRecording ?? false);
      void recordSession({ browser, store: deps.store, url: start_url, name, task, params, allowlist, until: (page) => new Promise((r) => page.on('close', () => r())) }).catch(() => undefined);
      return ok({ status: 'recording', name, next: 'close the browser window to save, then call list_workflows' });
    },
  );

  server.registerTool(
    'replay_workflow',
    {
      description: `Replay a recorded workflow on the local demo apps. Returns a run summary, or pending_approval with the form fields and a screenshot path when a submission needs approve_submission. ${SAFETY_NOTE}`,
      inputSchema: {
        name: z.string(),
        params: z.record(z.string(), z.string()).optional(),
        strategy: z.enum(Object.keys(STRATEGIES) as [string, ...string[]]).optional(),
        start_url: z.string().optional().describe('Optional demo-server origin; must be the local demo server.'),
        mutation_level: z.enum(['none', 'light', 'medium', 'heavy']).optional(),
        seed: z.number().int().optional(),
      },
    },
    async ({ name, params, strategy, start_url, mutation_level, seed }) => {
      if (start_url) {
        const bad = checkUrl(start_url);
        if (bad) return bad;
      }
      const wf = deps.store.getWorkflowByName(name);
      if (!wf) return fail(`No workflow named "${name}".`);
      const browser = await getBrowser(true);
      const id = randomUUID();
      const done = replayWorkflow(wf, { store: deps.store, browser, base: deps.base, runId: id, strategy: strategy ?? 'semantic-minilm', params, approval: approvals, mutationLevel: mutation_level, seed, approvalTimeoutMs: 10 * 60_000 }).catch((e: Error) => e);
      live.set(id, new LiveRun(done));
      return ok(await settle(id));
    },
  );

  server.registerTool(
    'approve_submission',
    { description: 'Approve or deny the pending form submission of a replay. Denying stops the run before anything is submitted.', inputSchema: { approval_id: z.number().int(), approve: z.boolean() } },
    async ({ approval_id, approve }) => {
      const req = approvals.requests.get(approval_id);
      if (!req) return fail(`No pending approval ${approval_id}.`);
      live.get(req.runId)?.rearm();
      if (!approvals.resolve(approval_id, approve)) return fail(`Approval ${approval_id} was already decided.`);
      return ok(await settle(req.runId));
    },
  );

  server.registerTool(
    'get_run',
    { description: 'Get the status, per-step strategy, scores, errors, screenshots and approvals of a run.', inputSchema: { run_id: z.string() } },
    async ({ run_id }) => ok(describeRun(run_id)),
  );

  return {
    server,
    approvals,
    async close() {
      for (const id of approvals.requests.keys()) approvals.resolve(id, false);
      await Promise.all(browsers.map((b) => b.close().catch(() => undefined)));
      await server.close();
    },
  };
}
