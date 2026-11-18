import { describe, expect, it } from 'vitest';
import { evaluate, range, tune, WRONG_PENALTY } from '../src/bench/tuning.ts';
import { judge } from '../src/bench/scorer.ts';
import { loadResolverConfig, thresholdsFor } from '../src/resolver/config.ts';

describe('threshold search', () => {
  const rows = [
    { score: 0.9, margin: 0.3, correct: true },
    { score: 0.8, margin: 0.2, correct: true },
    { score: 0.6, margin: 0.02, correct: false },
    { score: 0.5, margin: 0.2, correct: false },
    { score: 0.7, margin: 0.1, correct: true },
  ];
  it('counts accepted-correct, accepted-wrong and refused on hand-made rows', () => {
    expect(evaluate(rows, 0.65, 0.05)).toMatchObject({ acceptedCorrect: 3, acceptedWrong: 0, refused: 2, utility: 3 });
    expect(evaluate(rows, 0, 0)).toMatchObject({ acceptedCorrect: 3, acceptedWrong: 2, utility: 3 - 2 * WRONG_PENALTY });
  });
  it('picks thresholds that reject the wrong answers and keep the right ones', () => {
    const best = tune(rows, range(0.3, 0.9, 0.05), range(0, 0.2, 0.01));
    expect(best.acceptedWrong).toBe(0);
    expect(best.acceptedCorrect).toBe(3);
  });
  it('breaks ties toward the stricter pair', () => {
    expect(tune([{ score: 0.9, margin: 0.5, correct: true }], [0.5, 0.9], [0, 0.5])).toMatchObject({ minScore: 0.9, minMargin: 0.5 });
  });
  it('handles no rows and a wrong-only set (accepts nothing)', () => {
    expect(tune([], [0.5], [0.1]).total).toBe(0);
    expect(tune([{ score: 0.9, margin: 0.9, correct: false }], [0.5, 0.95], [0, 0.95]).acceptedWrong).toBe(0);
  });
  it('range includes both ends without float drift', () => {
    expect(range(0.1, 0.3, 0.1)).toEqual([0.1, 0.2, 0.3]);
  });
});

describe('scorer and config helpers', () => {
  it('judge treats a missing or decoy id as wrong', () => {
    expect(judge('bk.q', 'bk.q')).toBe('correct');
    expect(judge('decoy.bk.q', 'bk.q')).toBe('wrong');
    expect(judge(null, 'bk.q')).toBe('wrong');
  });
  it('thresholdsFor prefers a per-embedder pair', () => {
    const cfg = { ...loadResolverConfig(), perEmbedder: { x: { minScore: 0.1, minMargin: 0.2 } } };
    expect(thresholdsFor(cfg, 'x')).toEqual({ minScore: 0.1, minMargin: 0.2 });
    expect(thresholdsFor(cfg, 'other')).toEqual({ minScore: cfg.minScore, minMargin: cfg.minMargin });
  });
});
