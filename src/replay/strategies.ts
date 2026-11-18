import { CachedEmbedder, HashEmbedder, type Embedder } from '../embeddings/embedder.ts';
import { MiniLmEmbedder } from '../embeddings/minilm.ts';
import type { Store } from '../memory/store.ts';
import type { StrategyName } from '../resolver/types.ts';

export type EmbedderKind = 'none' | 'hash' | 'minilm';

export interface StrategyDef {
  chain: StrategyName[];
  embedder: EmbedderKind;
  /** Verify css hits against the recorded element (only the full chain does). */
  description: string;
}

/** The benchmark's strategies. css-only and role-only are the honest baselines. */
export const STRATEGIES: Record<string, StrategyDef> = {
  'css-only': { chain: ['css'], embedder: 'none', description: 'recorded CSS selectors, the way naive record-and-replay works' },
  'role-only': { chain: ['role'], embedder: 'none', description: 'Playwright getByRole with the recorded role and exact name' },
  'semantic-hash': { chain: ['css', 'role', 'semantic'], embedder: 'hash', description: 'full chain with the hashed n-gram embedder' },
  'semantic-minilm': { chain: ['css', 'role', 'semantic'], embedder: 'minilm', description: 'full chain with all-MiniLM-L6-v2' },
  'semantic-minilm+llm': { chain: ['css', 'role', 'semantic', 'llm'], embedder: 'minilm', description: 'full chain plus an LLM tie-break over the top 3' },
};

let minilm: MiniLmEmbedder | undefined;

/** Embedders are shared per process (the model loads once) and cached in SQLite. */
export function makeEmbedder(kind: EmbedderKind, store: Store): Embedder {
  if (kind === 'minilm') return new CachedEmbedder((minilm ??= new MiniLmEmbedder()), store);
  return new CachedEmbedder(new HashEmbedder(), store); // 'none' strategies never call it
}
