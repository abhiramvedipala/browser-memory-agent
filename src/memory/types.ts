import { z } from 'zod';

export const ACTIONS = ['navigate', 'click', 'fill', 'select', 'check', 'press', 'submit', 'wait_for'] as const;
export type Action = (typeof ACTIONS)[number];

export const BBoxSchema = z.object({ x: z.number(), y: z.number(), width: z.number(), height: z.number() });

/** Everything the recorder remembers about the element a step acted on. */
export const TargetSchema = z.object({
  role: z.string(),
  accessibleName: z.string(),
  label: z.string(),
  placeholder: z.string(),
  text: z.string(),
  nearbyText: z.string(),
  tag: z.string(),
  inputType: z.string(),
  /** Allowlisted attributes only (name, type, href path, value of options...). Never data-bench-id. */
  attrs: z.record(z.string(), z.string()),
  /** id, data-testid and a short CSS path, best first. */
  cssCandidates: z.array(z.string()),
  bbox: BBoxSchema.nullable(),
  frameUrl: z.string(),
});
export type Target = z.infer<typeof TargetSchema>;

export interface StepInput {
  action: Action;
  intent?: string;
  urlPattern?: string;
  valueTemplate?: string | null;
  target?: Target | null;
}

export interface StepRow extends StepInput {
  id: number;
  workflowId: number;
  idx: number;
  intent: string;
  urlPattern: string;
  valueTemplate: string | null;
  target: Target | null;
  createdAt: string;
}

export interface WorkflowInput {
  name: string;
  task: string;
  intent?: string;
  startUrlPattern: string;
  params?: Record<string, string>;
  steps: StepInput[];
}

export interface WorkflowRow {
  id: number;
  name: string;
  task: string;
  intent: string;
  startUrlPattern: string;
  params: Record<string, string>;
  version: number;
  createdAt: string;
}
export interface Workflow extends WorkflowRow {
  steps: StepRow[];
}

export type RunStatus = 'running' | 'success' | 'failed' | 'pending_approval' | 'denied';

export interface RunRow {
  id: string;
  workflowId: number;
  strategy: string;
  mutationLevel: string;
  seed: number;
  status: RunStatus;
  startedAt: string;
  endedAt: string | null;
  durationMs: number | null;
}

export interface RunStepInput {
  runId: string;
  idx: number;
  strategyUsed: string;
  candidates?: unknown[];
  chosen?: unknown;
  score?: number | null;
  margin?: number | null;
  retries?: number;
  screenshotPath?: string | null;
  error?: string | null;
}
export interface RunStepRow {
  runId: string;
  idx: number;
  strategyUsed: string;
  candidates: unknown[];
  chosen: unknown;
  score: number | null;
  margin: number | null;
  retries: number;
  screenshotPath: string | null;
  error: string | null;
}

export type ApprovalDecision = 'approved' | 'denied' | 'timeout';
export interface ApprovalRow {
  id: number;
  runId: string;
  stepIdx: number;
  summary: unknown;
  screenshotPath: string | null;
  decision: ApprovalDecision | null;
  decidedBy: string | null;
  decidedAt: string | null;
}

export interface LlmCallInput {
  purpose: string;
  model: string;
  inputTokens: number;
  outputTokens: number;
  costUsd: number;
  latencyMs: number;
  fixtureKey?: string | null;
}
export interface LlmCallRow extends LlmCallInput {
  id: number;
  createdAt: string;
}
