import { createInterface } from 'node:readline';
import type { ElementHandle, Page } from 'playwright';
import type { Store } from '../memory/store.ts';
import type { ApprovalDecision, Action } from '../memory/types.ts';
import { Allowlist } from '../safety/allowlist.ts';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';

export interface FormInfo {
  tag: string;
  type: string;
  name: string;
  inForm: boolean;
  method: string;
}
export interface FieldRow {
  label: string;
  value: string;
}
export interface ApprovalSummary {
  action: Action;
  control: string;
  formMethod: string;
  fields: FieldRow[];
  url: string;
}
export interface ApprovalRequest {
  approvalId: number;
  runId: string;
  stepIdx: number;
  summary: ApprovalSummary;
  screenshotPath: string | null;
}
export interface ApprovalOutcome {
  decision: ApprovalDecision;
  decidedBy: string;
}
export interface ApprovalProvider {
  readonly name: string;
  decide(req: ApprovalRequest): Promise<ApprovalOutcome>;
}

const SUBMITTY = /\b(submit|send|place|confirm|order|pay|purchase|checkout|reserve)\b/i;

/**
 * When must a person approve? Any submit step; Enter in a form field; a click on a submit control of
 * a form that changes state (POST) or whose name reads like submit/send/place/confirm. A GET form is a
 * query, not a submission, so a Search button does not pause the run.
 */
export function needsApproval(action: Action, key: string | null, info: FormInfo | null): boolean {
  if (action === 'submit') return true;
  if (!info || !info.inForm) return false;
  if (action === 'press') return (key ?? '').toLowerCase() === 'enter';
  if (action === 'click') {
    const submitControl = info.type === 'submit' || info.type === 'image';
    return submitControl && (info.method === 'post' || SUBMITTY.test(info.name));
  }
  return false;
}

type BmaForm = { __bma: { formInfo(el: Element): FormInfo; formSummary(el: Element): FieldRow[] } };

export async function readFormInfo(handle: ElementHandle): Promise<FormInfo> {
  return handle.evaluate((el) => (window as unknown as BmaForm).__bma.formInfo(el as unknown as Element));
}

export async function buildSummary(page: Page, handle: ElementHandle, action: Action): Promise<ApprovalSummary> {
  const info = await readFormInfo(handle);
  const fields = await handle.evaluate((el) => (window as unknown as BmaForm).__bma.formSummary(el as unknown as Element));
  return { action, control: info.name || info.tag, formMethod: info.method, fields, url: page.url() };
}

export interface GateResult {
  decision: ApprovalDecision;
  approvalId: number;
}

/**
 * Pause before a gated step: record the approval with the field summary and a screenshot, then wait
 * for the provider. Anything but 'approved' (deny or timeout) must stop the run before it acts.
 */
export async function gateStep(o: {
  page: Page;
  store: Store;
  runId: string;
  stepIdx: number;
  action: Action;
  handle: ElementHandle;
  provider: ApprovalProvider;
  runDir: string;
  timeoutMs?: number;
}): Promise<GateResult> {
  const summary = await buildSummary(o.page, o.handle, o.action);
  mkdirSync(o.runDir, { recursive: true });
  const shot = join(o.runDir, `approval-${o.stepIdx}.png`);
  const screenshotPath = await o.page.screenshot({ path: shot, fullPage: true }).then(() => shot, () => null);
  const row = o.store.createApproval({ runId: o.runId, stepIdx: o.stepIdx, summary, screenshotPath });
  o.store.setRunStatus(o.runId, 'pending_approval');
  const req: ApprovalRequest = { approvalId: row.id, runId: o.runId, stepIdx: o.stepIdx, summary, screenshotPath };
  const timeoutMs = o.timeoutMs ?? 120_000;
  let timer: NodeJS.Timeout | undefined;
  const timeout = new Promise<ApprovalOutcome>((r) => {
    timer = setTimeout(() => r({ decision: 'timeout', decidedBy: 'timeout' }), timeoutMs);
  });
  const outcome = await Promise.race([o.provider.decide(req).catch((): ApprovalOutcome => ({ decision: 'denied', decidedBy: o.provider.name })), timeout]);
  clearTimeout(timer);
  o.store.decideApproval(row.id, outcome.decision, outcome.decidedBy);
  if (outcome.decision === 'approved') o.store.setRunStatus(o.runId, 'running');
  return { decision: outcome.decision, approvalId: row.id };
}

// ---- providers ---------------------------------------------------------------

export function formatSummary(s: ApprovalSummary): string {
  const rows = s.fields.map((f) => `    ${f.label}: ${f.value}`).join('\n') || '    (no fields)';
  return `About to ${s.action} "${s.control}" (${s.formMethod || 'no form'}) on ${s.url}\n${rows}`;
}

/** Interactive y/N prompt. Anything other than y or yes (including empty input) is No. */
export class CliApprovalProvider implements ApprovalProvider {
  readonly name = 'cli';
  constructor(private readonly ask: (q: string) => Promise<string> = defaultAsk) {}
  async decide(req: ApprovalRequest): Promise<ApprovalOutcome> {
    const answer = await this.ask(`${formatSummary(req.summary)}\nSubmit this? [y/N] `);
    return { decision: /^y(es)?$/i.test(answer.trim()) ? 'approved' : 'denied', decidedBy: 'cli' };
  }
}

function defaultAsk(q: string): Promise<string> {
  return new Promise((resolve) => {
    const rl = createInterface({ input: process.stdin, output: process.stdout });
    rl.question(q, (a) => {
      rl.close();
      resolve(a);
    });
  });
}

/** MCP mode: the run waits until the approve_submission tool resolves the approval by id. */
export class ManualApprovalProvider implements ApprovalProvider {
  readonly name = 'mcp';
  private waiting = new Map<number, (o: ApprovalOutcome) => void>();
  readonly requests = new Map<number, ApprovalRequest>();
  onRequest?: (req: ApprovalRequest) => void;

  decide(req: ApprovalRequest): Promise<ApprovalOutcome> {
    this.requests.set(req.approvalId, req);
    this.onRequest?.(req);
    return new Promise((resolve) => this.waiting.set(req.approvalId, resolve));
  }
  /** Returns false when no run is waiting on that approval. */
  resolve(approvalId: number, approve: boolean): boolean {
    const w = this.waiting.get(approvalId);
    if (!w) return false;
    this.waiting.delete(approvalId);
    w({ decision: approve ? 'approved' : 'denied', decidedBy: 'mcp' });
    return true;
  }
}

/** Always says no. Used by tests and as a safe default for unattended runs. */
export class DenyAllProvider implements ApprovalProvider {
  readonly name = 'deny-all';
  async decide(): Promise<ApprovalOutcome> {
    return { decision: 'denied', decidedBy: 'deny-all' };
  }
}

/**
 * `--approve-all-for-benchmark`: approves every gate automatically, but only for the local demo
 * server. For any other origin this throws and nothing runs.
 */
export function benchmarkApproval(startUrl: string, allowlist: Allowlist = new Allowlist()): ApprovalProvider {
  allowlist.assert(startUrl);
  return {
    name: 'benchmark-flag',
    async decide() {
      return { decision: 'approved', decidedBy: 'benchmark-flag' };
    },
  };
}
