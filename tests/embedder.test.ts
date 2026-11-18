import { describe, expect, it } from 'vitest';
import { CachedEmbedder, HashEmbedder, MAX_BATCH, cosine, textHash, type Embedder } from '../src/embeddings/embedder.ts';
import { MiniLmEmbedder, minilmCached } from '../src/embeddings/minilm.ts';
import { Store } from '../src/memory/store.ts';

const h = new HashEmbedder();

describe('HashEmbedder', () => {
  it('is deterministic and L2-normalised', async () => {
    const [a, b] = await h.embed(['Add to cart', 'Add to cart']);
    expect([...a!]).toEqual([...b!]);
    expect(cosine(a!, a!)).toBeCloseTo(1, 5);
    expect(a!.length).toBe(h.dims);
  });

  it('ranks lexically similar text above unrelated text', async () => {
    const [q, near, far] = await h.embed(['Add to cart', 'Add to cart now', 'Place hold reminder']);
    expect(cosine(q!, near!)).toBeGreaterThan(cosine(q!, far!));
  });

  it('puts an exact match above a near match', async () => {
    const [q, exact, near] = await h.embed(['Search books', 'Search books', 'Search books archive']);
    expect(cosine(q!, exact!)).toBeGreaterThan(cosine(q!, near!));
  });

  it('handles empty text without NaN', async () => {
    const [e, x] = await h.embed(['', 'abc']);
    expect(Number.isNaN(cosine(e!, x!))).toBe(false);
  });
});

describe('cosine and hashing', () => {
  it('cosine of orthogonal and zero vectors', () => {
    expect(cosine(new Float32Array([1, 0]), new Float32Array([0, 1]))).toBe(0);
    expect(cosine(new Float32Array([0, 0]), new Float32Array([1, 0]))).toBe(0);
    expect(cosine(new Float32Array([2, 0]), new Float32Array([5, 0]))).toBeCloseTo(1, 6);
  });
  it('textHash is a sha256 hex', () => {
    expect(textHash('x')).toMatch(/^[0-9a-f]{64}$/);
  });
});

describe('CachedEmbedder', () => {
  it('computes each text once and serves repeats from SQLite', async () => {
    let calls = 0;
    let largest = 0;
    const inner: Embedder = {
      name: 'fake',
      dims: 2,
      async embed(texts) {
        calls++;
        largest = Math.max(largest, texts.length);
        return texts.map((t) => new Float32Array([t.length, 1]));
      },
    };
    const c = new CachedEmbedder(inner, Store.open(':memory:'));
    const first = await c.embed(['aa', 'bbb']);
    const second = await c.embed(['bbb', 'aa', 'cccc']);
    expect([...second[0]!]).toEqual([...first[1]!]);
    expect(calls).toBe(2);
    expect(c.hits).toBe(2);
    expect(c.misses).toBe(3);
  });

  it('never sends more than 64 texts to the model at once', async () => {
    let largest = 0;
    const inner: Embedder = { name: 'f', dims: 1, async embed(t) { largest = Math.max(largest, t.length); return t.map(() => new Float32Array([1])); } };
    const c = new CachedEmbedder(inner, Store.open(':memory:'));
    await c.embed(Array.from({ length: 150 }, (_, i) => `t${i}`));
    expect(largest).toBeLessThanOrEqual(MAX_BATCH);
  });
});

describe.skipIf(!minilmCached())('MiniLmEmbedder (runs when models/ is populated)', () => {
  it('embeds to 384 unit vectors and understands synonyms better than the hash model', async () => {
    const m = new MiniLmEmbedder();
    const [basket, cart, hold] = await m.embed(['Add to basket', 'Add to cart', 'Place a library hold']);
    expect(basket!.length).toBe(384);
    expect(cosine(basket!, basket!)).toBeCloseTo(1, 4);
    expect(cosine(basket!, cart!)).toBeGreaterThan(cosine(basket!, hold!));
  }, 120_000);
});
