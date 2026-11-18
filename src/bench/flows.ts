import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

export type GoldenOp = 'click' | 'fill' | 'select' | 'check';

export interface GoldenStep {
  op: GoldenOp;
  /** Ground-truth data-bench-id of the element a human would use. */
  id: string;
  value?: string;
}

export interface SuccessClause {
  event: string;
  where: Record<string, string | number | boolean>;
}

export interface Flow {
  id: string;
  app: string;
  task: string;
  params: Record<string, string>;
  startUrl: string;
  steps: GoldenStep[];
  success: SuccessClause[];
  /** Expected number of final submissions when the flow succeeds (default 0). */
  submissions?: number;
}

export interface BenchState {
  sid: string;
  submissions: number;
  events: { type: string; data: Record<string, string | number | boolean> }[];
}

const here = dirname(fileURLToPath(import.meta.url));
export const FLOWS_DIR = join(here, '..', '..', 'bench', 'flows');

export function loadFlows(dir = FLOWS_DIR): Flow[] {
  return readdirSync(dir)
    .filter((f) => f.endsWith('.json'))
    .sort()
    .flatMap((f) => JSON.parse(readFileSync(join(dir, f), 'utf8')) as Flow[]);
}

/** Replace {{name}} placeholders; unknown names are left untouched. */
export function interpolate(template: string, params: Record<string, string>): string {
  return template.replace(/\{\{(\w+)\}\}/g, (m, k: string) => params[k] ?? m);
}

export function taskSentence(flow: Flow, params: Record<string, string> = flow.params): string {
  return interpolate(flow.task, params);
}

/** Success is judged by the server's own state, never by the agent. */
export function evaluateSuccess(flow: Flow, state: BenchState): boolean {
  const clausesOk = flow.success.every((c) =>
    state.events.some((e) => e.type === c.event && Object.entries(c.where).every(([k, v]) => e.data[k] === v)),
  );
  return clausesOk && state.submissions === (flow.submissions ?? 0);
}

export async function fetchState(base: string, sid: string): Promise<BenchState> {
  const r = await fetch(`${base}/__bench/state?sid=${encodeURIComponent(sid)}`);
  return (await r.json()) as BenchState;
}
