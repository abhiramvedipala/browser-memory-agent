// Small deterministic PRNG helpers (no dependencies) so the same seed always
// yields the same mutated DOM.

/** FNV-1a 32-bit hash of a string. */
export function hash32(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

export interface Rng {
  next(): number;
  chance(p: number): boolean;
  int(lo: number, hi: number): number;
  shuffle<T>(arr: T[]): T[];
}

/** mulberry32 seeded from a string. */
export function makeRng(seedText: string): Rng {
  let a = hash32(seedText);
  const next = () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  return {
    next,
    chance: (p) => next() < p,
    int: (lo, hi) => lo + Math.floor(next() * (hi - lo + 1)),
    shuffle: (arr) => {
      const out = [...arr];
      for (let i = out.length - 1; i > 0; i--) {
        const j = Math.floor(next() * (i + 1));
        [out[i], out[j]] = [out[j]!, out[i]!];
      }
      return out;
    },
  };
}

export function shortId(seedText: string, prefix = 'x'): string {
  return `${prefix}${hash32(seedText).toString(36).slice(0, 6)}`;
}
