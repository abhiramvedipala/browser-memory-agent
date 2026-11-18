import { describe, expect, it } from 'vitest';
import {
  bootstrapCI,
  fmtPct,
  mean,
  median,
  p95,
  percentile,
  recoveryRate,
  refusalRate,
  retryStats,
  stepAccuracy,
  successBy,
  successRate,
  timeStats,
  wrongElementRate,
  type ReplayRecord,
  type StepKind,
} from '../src/bench/metrics.ts';

let counter = 0;
function rec(over: Partial<ReplayRecord> & { kinds?: StepKind[] } = {}): ReplayRecord {
  const { kinds, ...rest } = over;
  counter++;
  return {
    flowId: `f${counter}`,
    app: 'a',
    strategy: 's',
    level: 'medium',
    seed: 100,
    success: true,
    steps: (kinds ?? ['correct']).map((kind, idx) => ({ idx, kind, strategyUsed: 'role', retries: 0 })),
    durationMs: 1000,
    llmTokens: 0,
    llmCostUsd: 0,
    ...rest,
  };
}

describe('basic statistics', () => {
  it('mean, median and percentile on hand-computed values', () => {
    expect(mean([1, 2, 3, 4])).toBe(2.5);
    expect(median([1, 2, 3, 4])).toBe(2.5);
    expect(median([5, 1, 3])).toBe(3);
    expect(percentile([10], 0.95)).toBe(10);
    const xs = Array.from({ length: 20 }, (_, i) => i + 1);
    expect(p95(xs)).toBeCloseTo(19.05, 10);
    expect(percentile(xs, 0)).toBe(1);
    expect(percentile(xs, 1)).toBe(20);
  });

  it('handles ties and empty input', () => {
    expect(median([7, 7, 7, 7])).toBe(7);
    expect(p95([2, 2, 2])).toBe(2);
    expect(Number.isNaN(mean([]))).toBe(true);
    expect(Number.isNaN(median([]))).toBe(true);
  });
});

describe('bootstrapCI', () => {
  it('is NaN for empty data and degenerate for a single cluster', () => {
    expect(bootstrapCI([]).n).toBe(0);
    expect(Number.isNaN(bootstrapCI([[], []]).value)).toBe(true);
    expect(bootstrapCI([[1, 0, 1, 1]])).toEqual({ value: 0.75, lo: 0.75, hi: 0.75, n: 4 });
  });

  it('is exactly [1,1] when everything succeeds and [0,0] when everything fails', () => {
    expect(bootstrapCI([[1], [1], [1]])).toMatchObject({ value: 1, lo: 1, hi: 1 });
    expect(bootstrapCI([[0], [0], [0]])).toMatchObject({ value: 0, lo: 0, hi: 0 });
  });

  it('is reproducible and brackets the point estimate', () => {
    const groups = [[1, 1, 1], [1, 0, 1], [0, 0, 0], [1, 1, 0], [1, 1, 1]];
    const a = bootstrapCI(groups);
    const b = bootstrapCI(groups);
    expect(a).toEqual(b);
    expect(a.value).toBeCloseTo(10 / 15, 10);
    expect(a.lo).toBeLessThanOrEqual(a.value);
    expect(a.hi).toBeGreaterThanOrEqual(a.value);
    expect(a.lo).toBeGreaterThanOrEqual(0);
    expect(a.hi).toBeLessThanOrEqual(1);
    expect(a.hi - a.lo).toBeGreaterThan(0.05);
  });
});

describe('replay rates', () => {
  it('successRate: 3 of 4 flows succeed', () => {
    const rs = [rec(), rec(), rec(), rec({ success: false, kinds: ['correct', 'refused'] })];
    expect(successRate(rs).value).toBe(0.75);
    expect(successRate(rs).n).toBe(4);
  });

  it('successRate on empty and all-failure inputs', () => {
    expect(Number.isNaN(successRate([]).value)).toBe(true);
    const failing = [rec({ success: false }), rec({ success: false })];
    expect(successRate(failing)).toMatchObject({ value: 0, lo: 0, hi: 0 });
  });

  it('wrong-element rate counts a replay once however many steps were wrong', () => {
    const rs = [rec({ success: false, kinds: ['wrong', 'wrong'] }), rec(), rec(), rec()];
    expect(wrongElementRate(rs).value).toBe(0.25);
  });

  it('refusal rate excludes replays that also acted on a wrong element', () => {
    const rs = [
      rec({ success: false, kinds: ['correct', 'refused'] }),
      rec({ success: false, kinds: ['wrong', 'refused'] }),
      rec(),
      rec(),
    ];
    expect(refusalRate(rs).value).toBe(0.25);
  });

  it('step accuracy counts only reached steps and treats refused and error as inaccurate', () => {
    const rs = [rec({ kinds: ['correct', 'correct', 'correct'] }), rec({ success: false, kinds: ['correct', 'refused'] }), rec({ success: false, kinds: ['error'] })];
    // 4 correct of 6 reached steps
    expect(stepAccuracy(rs).value).toBeCloseTo(4 / 6, 10);
  });

  it('groups by key and keeps keys sorted', () => {
    const rs = [rec({ level: 'none' }), rec({ level: 'heavy', success: false }), rec({ level: 'heavy' })];
    const by = successBy(rs, (r) => r.level);
    expect(Object.keys(by)).toEqual(['heavy', 'none']);
    expect(by.heavy?.value).toBe(0.5);
    expect(by.none?.value).toBe(1);
  });
});

describe('recoveryRate versus css-only', () => {
  const cell = (flowId: string, success: boolean, strategy: string): ReplayRecord => rec({ flowId, success, strategy, level: 'medium', seed: 100 });

  it('is the share of css-only failures the strategy succeeds on', () => {
    const css = [cell('a', false, 'css-only'), cell('b', false, 'css-only'), cell('c', false, 'css-only'), cell('d', true, 'css-only')];
    const sem = [cell('a', true, 's'), cell('b', false, 's'), cell('c', true, 's'), cell('d', true, 's')];
    const r = recoveryRate(sem, css);
    expect(r.value).toBeCloseTo(2 / 3, 10);
    expect(r.n).toBe(3);
  });

  it('is n/a when css-only never failed', () => {
    const css = [cell('a', true, 'css-only')];
    expect(Number.isNaN(recoveryRate([cell('a', true, 's')], css).value)).toBe(true);
  });

  it('matches cells by flow, level and seed', () => {
    const css = [rec({ flowId: 'a', level: 'heavy', seed: 1, success: false })];
    const sem = [rec({ flowId: 'a', level: 'heavy', seed: 2, success: true }), rec({ flowId: 'a', level: 'heavy', seed: 1, success: true })];
    expect(recoveryRate(sem, css).n).toBe(1);
  });
});

describe('time and retries', () => {
  it('timeStats gives median and p95 of replay durations', () => {
    const rs = [1000, 2000, 3000, 4000].map((durationMs) => rec({ durationMs }));
    expect(timeStats(rs)).toMatchObject({ n: 4, medianMs: 2500, meanMs: 2500 });
    expect(timeStats(rs).p95Ms).toBeCloseTo(3850, 6);
  });

  it('retryStats counts steps that needed a retry and those that then resolved', () => {
    const r1 = rec();
    r1.steps = [
      { idx: 0, kind: 'correct', strategyUsed: 'role', retries: 2 },
      { idx: 1, kind: 'refused', strategyUsed: 'none', retries: 3 },
      { idx: 2, kind: 'correct', strategyUsed: 'css', retries: 0 },
    ];
    expect(retryStats([r1])).toEqual({ steps: 3, stepsNeedingRetry: 2, retriesThatSucceeded: 1 });
  });
});

describe('formatting', () => {
  it('renders percentages with CI and n/a for no data', () => {
    expect(fmtPct({ value: 0.875, lo: 0.8, hi: 0.933, n: 10 })).toBe('87.5% [80.0, 93.3]');
    expect(fmtPct({ value: NaN, lo: NaN, hi: NaN, n: 0 })).toBe('n/a');
  });
});
