import { createHash } from 'node:crypto';
import type { Store } from '../memory/store.ts';

export interface Embedder {
  /** Stable model name, part of the cache key. */
  readonly name: string;
  readonly dims: number;
  /** L2-normalised vectors, one per input text. */
  embed(texts: string[]): Promise<Float32Array[]>;
}

export const MAX_BATCH = 64;

export function cosine(a: Float32Array, b: Float32Array): number {
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i]! * b[i]!;
    na += a[i]! * a[i]!;
    nb += b[i]! * b[i]!;
  }
  return na === 0 || nb === 0 ? 0 : dot / Math.sqrt(na * nb);
}

export function textHash(text: string): string {
  return createHash('sha256').update(text).digest('hex');
}

function normalize(v: Float32Array): Float32Array {
  let n = 0;
  for (const x of v) n += x * x;
  n = Math.sqrt(n);
  if (n > 0) for (let i = 0; i < v.length; i++) v[i] = v[i]! / n;
  return v;
}

/**
 * Deterministic, download-free embedding: hashed character 3-grams and word
 * unigrams into a fixed number of buckets. Lexical only (no synonyms), which is
 * exactly why it is the ablation next to the real model.
 */
export class HashEmbedder implements Embedder {
  readonly name = 'hash-ngram-v1';
  constructor(readonly dims = 256) {}

  private bucket(token: string, salt: string): number {
    const h = createHash('md5').update(salt + token).digest();
    return h.readUInt32LE(0) % this.dims;
  }

  async embed(texts: string[]): Promise<Float32Array[]> {
    return texts.map((t) => {
      const v = new Float32Array(this.dims);
      const clean = ` ${t.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()} `;
      for (let i = 0; i + 3 <= clean.length; i++) v[this.bucket(clean.slice(i, i + 3), 'c')]! += 1;
      for (const w of clean.trim().split(' ').filter(Boolean)) v[this.bucket(w, 'w')]! += 2;
      return normalize(v);
    });
  }
}

/** Caches another embedder's vectors in SQLite, keyed by (model, sha256(text)). */
export class CachedEmbedder implements Embedder {
  hits = 0;
  misses = 0;
  constructor(
    private readonly inner: Embedder,
    private readonly store: Store,
  ) {}
  get name(): string {
    return this.inner.name;
  }
  get dims(): number {
    return this.inner.dims;
  }

  async embed(texts: string[]): Promise<Float32Array[]> {
    const out: (Float32Array | undefined)[] = texts.map((t) => this.store.getEmbedding(textHash(t), this.inner.name));
    const missing = out.flatMap((v, i) => (v ? [] : [i]));
    this.hits += texts.length - missing.length;
    this.misses += missing.length;
    for (let s = 0; s < missing.length; s += MAX_BATCH) {
      const idx = missing.slice(s, s + MAX_BATCH);
      const vecs = await this.inner.embed(idx.map((i) => texts[i]!));
      idx.forEach((i, k) => {
        out[i] = vecs[k]!;
        this.store.putEmbedding(textHash(texts[i]!), this.inner.name, vecs[k]!);
      });
    }
    return out as Float32Array[];
  }
}
