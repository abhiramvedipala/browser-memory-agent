// Pure threshold search over step-level semantic scores (no browser needed, unit-testable).
export interface TuneRow {
  score: number;
  margin: number;
  correct: boolean;
}
export interface TuneResult {
  minScore: number;
  minMargin: number;
  utility: number;
  acceptedCorrect: number;
  acceptedWrong: number;
  refused: number;
  total: number;
}

export const WRONG_PENALTY = 10;

export function evaluate(rows: TuneRow[], minScore: number, minMargin: number): TuneResult {
  let c = 0;
  let w = 0;
  for (const r of rows) {
    if (r.score >= minScore && r.margin >= minMargin) {
      if (r.correct) c++;
      else w++;
    }
  }
  return { minScore, minMargin, utility: c - WRONG_PENALTY * w, acceptedCorrect: c, acceptedWrong: w, refused: rows.length - c - w, total: rows.length };
}

/** Grid search. Ties go to the stricter (higher score, then higher margin) pair: refusing is the safe failure. */
export function tune(rows: TuneRow[], scores: number[], margins: number[]): TuneResult {
  let best: TuneResult | undefined;
  for (const s of scores) {
    for (const m of margins) {
      const r = evaluate(rows, s, m);
      if (!best || r.utility > best.utility || (r.utility === best.utility && (s > best.minScore || (s === best.minScore && m > best.minMargin)))) best = r;
    }
  }
  if (!best) throw new Error('empty grid');
  return best;
}

export const range = (lo: number, hi: number, step: number): number[] => {
  const out: number[] = [];
  for (let x = lo; x <= hi + 1e-9; x += step) out.push(Math.round(x * 1000) / 1000);
  return out;
};
