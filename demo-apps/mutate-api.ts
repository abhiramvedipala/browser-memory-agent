// Public surface of the mutation engine as the server sees it.
import type { El } from './dom.ts';

export type MutationLevel = 'none' | 'light' | 'medium' | 'heavy';

export interface MutationRequest {
  level: MutationLevel;
  seed: number;
  /** Normalized page path, part of the RNG seed so the same page is stable. */
  path: string;
  /** Optional: apply only these operators (used for per-operator benchmark rows). */
  only?: string[];
}

export type Mutator = (root: El, req: MutationRequest) => El;
