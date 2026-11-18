// Benchmark metrics. Everything here is a pure function over ReplayRecord[] so
// it can be tested on hand-made cases. Conventions:
//  - An empty denominator gives NaN (rendered "n/a"), never a fake 0 or 1.
//  - Confidence intervals are percentile bootstrap intervals that resample
//    whole flows (all of a flow's replays move together), because replays of
//    the same flow across seeds are not independent.
import { makeRng } from '../../demo-apps/rng.ts';

export type StepKind = 'correct' | 'wrong' | 'refused' | 'error';

export interface StepOutcome {
  idx: number;
  kind: StepKind;
  /** css | role | semantic | llm | none */
  strategyUsed: string;
  retries: number;
}

export interface ReplayRecord {
  flowId: string;
  app: string;
  /** css-only, role-only, semantic-hash, semantic-minilm, semantic-minilm+llm, scratch-agent */
  strategy: string;
  level: string;
  seed: number;
  /** Set for single-operator runs (mut=op:<name>). */
  operator?: string;
  success: boolean;
  steps: StepOutcome[];
  durationMs: number;
  llmTokens: number;
  llmCostUsd: number;
}

export interface Estimate {
  /** Point estimate; NaN when there is no data. */
  value: number;
  lo: number;
  hi: number;
  n: number;
}

export const NO_DATA: Estimate = { value: NaN, lo: NaN, hi: NaN, n: 0 };

// ---- basic statistics -------------------------------------------------------

export function mean(xs: number[]): number {
  return xs.length === 0 ? NaN : xs.reduce((a, b) => a + b, 0) / xs.length;
}

/** Linear-interpolation percentile (the common "type 7" definition). p in [0, 1]. */
export function percentile(xs: number[], p: number): number {
  if (xs.length === 0) return NaN;
  const s = [...xs].sort((a, b) => a - b);
  const idx = (s.length - 1) * Math.min(1, Math.max(0, p));
  const lo = Math.floor(idx);
  const hi = Math.ceil(idx);
  return s[lo]! + (s[hi]! - s[lo]!) * (idx - lo);
}

export const median = (xs: number[]): number => percentile(xs, 0.5);
export const p95 = (xs: number[]): number => percentile(xs, 0.95);

// ---- bootstrap --------------------------------------------------------------

export const BOOTSTRAP_ITERATIONS = 2000;

/**
 * Percentile bootstrap CI for a pooled ratio: `groups` is one array of 0/1 (or
 * numeric) values per cluster (flow). Resamples clusters with replacement.
 */
export function bootstrapCI(groups: number[][], iterations = BOOTSTRAP_ITERATIONS, seed = 1234): Estimate {
  const nonEmpty = groups.filter((g) => g.length > 0);
  const all = nonEmpty.flat();
  if (all.length === 0) return NO_DATA;
  const value = mean(all);
  if (nonEmpty.length === 1) return { value, lo: value, hi: value, n: all.length };
  const rng = makeRng(`bootstrap:${seed}`);
  const means: number[] = [];
  for (let it = 0; it < iterations; it++) {
    let sum = 0;
    let cnt = 0;
    for (let k = 0; k < nonEmpty.length; k++) {
      const g = nonEmpty[Math.floor(rng.next() * nonEmpty.length)]!;
      for (const v of g) sum += v;
      cnt += g.length;
    }
    means.push(sum / cnt);
  }
  return { value, lo: percentile(means, 0.025), hi: percentile(means, 0.975), n: all.length };
}

function groupByFlow(records: ReplayRecord[], f: (r: ReplayRecord) => number): number[][] {
  const m = new Map<string, number[]>();
  for (const r of records) {
    const arr = m.get(r.flowId) ?? [];
    arr.push(f(r));
    m.set(r.flowId, arr);
  }
  return [...m.values()];
}

// ---- rates over replays -------------------------------------------------------

export const wrongElement = (r: ReplayRecord): boolean => r.steps.some((s) => s.kind === 'wrong');
export const refused = (r: ReplayRecord): boolean => !wrongElement(r) && !r.success && r.steps.some((s) => s.kind === 'refused');

/** Share of replays whose flow success check passed. */
export function successRate(records: ReplayRecord[]): Estimate {
  return bootstrapCI(groupByFlow(records, (r) => (r.success ? 1 : 0)));
}

/** Share of replays in which at least one step acted on the wrong element (the worst failure). */
export function wrongElementRate(records: ReplayRecord[]): Estimate {
  return bootstrapCI(groupByFlow(records, (r) => (wrongElement(r) ? 1 : 0)));
}

/** Share of replays that stopped safely (a step refused to guess) without acting on a wrong element. */
export function refusalRate(records: ReplayRecord[]): Estimate {
  return bootstrapCI(groupByFlow(records, (r) => (refused(r) ? 1 : 0)));
}

/**
 * Per-step resolution accuracy: of the target steps that were attempted
 * (reached), the share resolved to the recorded element. Refused and errored
 * steps count as not accurate; steps never reached because an earlier step
 * stopped the run are not counted.
 */
export function stepAccuracy(records: ReplayRecord[]): Estimate {
  const groups = new Map<string, number[]>();
  for (const r of records) {
    const arr = groups.get(r.flowId) ?? [];
    for (const s of r.steps) arr.push(s.kind === 'correct' ? 1 : 0);
    groups.set(r.flowId, arr);
  }
  return bootstrapCI([...groups.values()]);
}

/** Share of target steps that acted on a wrong element. */
export function wrongStepRate(records: ReplayRecord[]): Estimate {
  const groups = new Map<string, number[]>();
  for (const r of records) {
    const arr = groups.get(r.flowId) ?? [];
    for (const s of r.steps) arr.push(s.kind === 'wrong' ? 1 : 0);
    groups.set(r.flowId, arr);
  }
  return bootstrapCI([...groups.values()]);
}

const cellKey = (r: ReplayRecord) => `${r.flowId}|${r.level}|${r.seed}|${r.operator ?? ''}`;

/**
 * Recovery rate versus css-only: among the (flow, level, seed) cells where
 * css-only failed, the share where `strategy` succeeded. NaN when css-only
 * never failed (nothing to recover from).
 */
export function recoveryRate(strategy: ReplayRecord[], cssOnly: ReplayRecord[]): Estimate {
  const cssFailed = new Set(cssOnly.filter((r) => !r.success).map(cellKey));
  const groups = new Map<string, number[]>();
  for (const r of strategy) {
    if (!cssFailed.has(cellKey(r))) continue;
    const arr = groups.get(r.flowId) ?? [];
    arr.push(r.success ? 1 : 0);
    groups.set(r.flowId, arr);
  }
  return bootstrapCI([...groups.values()]);
}

// ---- time, tokens, cost --------------------------------------------------------

export interface TimeStats {
  n: number;
  medianMs: number;
  p95Ms: number;
  meanMs: number;
}

export function timeStats(records: ReplayRecord[]): TimeStats {
  const ms = records.map((r) => r.durationMs);
  return { n: ms.length, medianMs: median(ms), p95Ms: p95(ms), meanMs: mean(ms) };
}

export function perFlowCost(records: ReplayRecord[]): { tokens: number; usd: number; steps: number } {
  return {
    tokens: mean(records.map((r) => r.llmTokens)),
    usd: mean(records.map((r) => r.llmCostUsd)),
    steps: mean(records.map((r) => r.steps.length)),
  };
}

// ---- retries ------------------------------------------------------------------

export interface RetryStats {
  steps: number;
  stepsNeedingRetry: number;
  retriesThatSucceeded: number;
}

export function retryStats(records: ReplayRecord[]): RetryStats {
  let steps = 0;
  let needing = 0;
  let ok = 0;
  for (const r of records) {
    for (const s of r.steps) {
      steps++;
      if (s.retries > 0) {
        needing++;
        if (s.kind === 'correct' || s.kind === 'wrong') ok++;
      }
    }
  }
  return { steps, stepsNeedingRetry: needing, retriesThatSucceeded: ok };
}

// ---- grouping -----------------------------------------------------------------

export function groupBy<T>(items: T[], key: (t: T) => string): Map<string, T[]> {
  const m = new Map<string, T[]>();
  for (const it of items) {
    const k = key(it);
    const arr = m.get(k) ?? [];
    arr.push(it);
    m.set(k, arr);
  }
  return m;
}

/** Success rate per key (level, operator, app...), keys sorted for stable reports. */
export function successBy(records: ReplayRecord[], key: (r: ReplayRecord) => string): Record<string, Estimate> {
  const out: Record<string, Estimate> = {};
  for (const [k, rs] of [...groupBy(records, key)].sort(([a], [b]) => a.localeCompare(b))) out[k] = successRate(rs);
  return out;
}

/** Format an estimate as `87.5% [80.0, 93.3]` or `n/a`. */
export function fmtPct(e: Estimate, digits = 1): string {
  if (!Number.isFinite(e.value)) return 'n/a';
  const f = (x: number) => (x * 100).toFixed(digits);
  return `${f(e.value)}% [${f(e.lo)}, ${f(e.hi)}]`;
}
