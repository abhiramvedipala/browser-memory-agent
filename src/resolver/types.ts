import type { Locator } from 'playwright';
import type { Candidate } from '../replay/candidates.ts';

export type StrategyName = 'css' | 'role' | 'semantic' | 'llm';

export interface ScoredCandidate {
  idx: number;
  role: string;
  name: string;
  score: number;
  cosine: number;
}

export interface Resolution {
  ok: boolean;
  /** Which strategy produced the element, or 'none' when the step was refused. */
  strategy: StrategyName | 'none';
  locator?: Locator;
  candidate?: Candidate;
  score: number | null;
  margin: number | null;
  /** Top 5 semantic candidates (empty when css or role resolved first). */
  top: ScoredCandidate[];
  /** Why nothing was chosen, or notes about the choice. */
  reason?: string;
  /** Strategies tried in order, each with a short outcome, for the run log. */
  trace: string[];
}
