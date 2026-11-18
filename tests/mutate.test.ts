import { describe, expect, it } from 'vitest';
import { findAll, serialize, serializeDocument, textOf, type El } from '../demo-apps/dom.ts';
import { allApps } from '../demo-apps/apps/index.ts';
import { LEVEL_OPS, mutateWithReport, OPERATORS } from '../demo-apps/mutate.ts';
import type { MutationLevel } from '../demo-apps/mutate-api.ts';
import type { AppRequest } from '../demo-apps/types.ts';

function req(path: string, query = ''): AppRequest {
  return { method: 'GET', path, query: new URLSearchParams(query), form: new URLSearchParams(), session: { sid: 't', submissions: 0, events: [], draft: {}, createdAt: 0 } };
}
function page(app: string, path: string, query = ''): El {
  const a = allApps.find((x) => x.name === app)!;
  return a.handle(req(path, query))!.page!;
}
const SAMPLES: [string, string, string][] = [
  ['bookshop', '/', ''],
  ['bookshop', '/search', 'q=rust'],
  ['library', '/catalog', 'keywords=history'],
  ['jobs', '/search', 'kw=developer&loc=Remote'],
  ['recipes', '/search', 'q=pasta'],
  ['docs', '/page/install', ''],
  ['helpdesk', '/new/2', ''],
];
const benchIds = (root: El) => findAll(root, (e) => typeof e.attrs['data-bench-id'] === 'string').map((e) => String(e.attrs['data-bench-id']));
const mut = (root: El, level: MutationLevel, seed: number, only?: string[]) => mutateWithReport(root, { level, seed, path: '/x', only });

describe('mutation engine: invariants', () => {
  it('is deterministic: same seed, same DOM', () => {
    for (const [app, path, q] of SAMPLES) {
      const a = page(app, path, q);
      const b = page(app, path, q);
      mut(a, 'heavy', 101);
      mut(b, 'heavy', 101);
      expect(serialize(a)).toBe(serialize(b));
    }
  });

  it('different seeds give different heavy pages', () => {
    const a = page('bookshop', '/search', 'q=rust');
    const b = page('bookshop', '/search', 'q=rust');
    mut(a, 'heavy', 100);
    mut(b, 'heavy', 101);
    expect(serialize(a)).not.toBe(serialize(b));
  });

  it('level none only strips markers', () => {
    const a = page('docs', '/', '');
    const before = serializeDocument(a).replace(/ data-mut="[^"]*"/g, '');
    mut(a, 'none', 5);
    expect(serializeDocument(a)).toBe(before);
  });

  it('preserves every original data-bench-id exactly once at every level and seed', () => {
    for (const [app, path, q] of SAMPLES) {
      const original = benchIds(page(app, path, q)).sort();
      for (const level of ['light', 'medium', 'heavy'] as const) {
        for (const seed of [0, 1, 2, 100, 101, 102]) {
          const m = page(app, path, q);
          mut(m, level, seed);
          const ids = benchIds(m);
          expect(ids.filter((i) => !i.startsWith('decoy.')).sort()).toEqual(original);
        }
      }
    }
  });

  it('never leaves data-mut markers behind', () => {
    const m = page('library', '/catalog', 'keywords=poetry');
    mut(m, 'heavy', 3);
    expect(serialize(m)).not.toContain('data-mut');
  });

  it('levels nest: light within medium within heavy', () => {
    expect(LEVEL_OPS.light.every((o) => LEVEL_OPS.medium.includes(o))).toBe(true);
    expect(LEVEL_OPS.medium.every((o) => LEVEL_OPS.heavy.includes(o))).toBe(true);
    for (const o of LEVEL_OPS.heavy) expect(OPERATORS.some(([n]) => n === o)).toBe(true);
  });

  it('only=[op] runs just that operator', () => {
    const m = page('bookshop', '/', '');
    const { applied } = mut(m, 'heavy', 1, ['synonyms']);
    expect(Object.keys(applied)).toEqual(['synonyms']);
  });
});

describe('mutation engine: operators', () => {
  const ALL_SEEDS = [0, 1, 2, 3, 4, 5, 6, 7];

  it('ids: renames ids and keeps label[for] pointing at the input', () => {
    const m = page('bookshop', '/', '');
    const oldIds = findAll(m, (e) => typeof e.attrs.id === 'string').map((e) => String(e.attrs.id));
    mut(m, 'light', 4, ['ids']);
    const newIds = new Set(findAll(m, (e) => typeof e.attrs.id === 'string').map((e) => String(e.attrs.id)));
    for (const o of oldIds) expect(newIds.has(o)).toBe(false);
    for (const l of findAll(m, (e) => e.tag === 'label')) expect(newIds.has(String(l.attrs.for))).toBe(true);
  });

  it('classes: renames every class token', () => {
    const m = page('bookshop', '/search', 'q=rust');
    mut(m, 'light', 4, ['classes']);
    expect(serialize(m)).not.toContain('class="list"');
    expect(serialize(m)).not.toContain('class="field"');
  });

  it('wrap: adds extra div ancestors without losing elements', () => {
    const depth = (root: El, id: string) => {
      let best = 0;
      const rec = (e: El, d: number) => {
        if (e.attrs['data-bench-id'] === id) best = d;
        for (const c of e.children) if (typeof c === 'object' && 'tag' in c) rec(c, d + 1);
      };
      rec(root, 0);
      return best;
    };
    let deeper = false;
    for (const s of ALL_SEEDS) {
      const m = page('bookshop', '/', '');
      const base = depth(m, 'bk.q');
      mut(m, 'light', s, ['wrap']);
      if (depth(m, 'bk.q') > base) deeper = true;
    }
    expect(deeper).toBe(true);
  });

  it('testids: removes all data-testid attributes', () => {
    const m = page('bookshop', '/', '');
    expect(serialize(m)).toContain('data-testid');
    mut(m, 'medium', 1, ['testids']);
    expect(serialize(m)).not.toContain('data-testid');
  });

  it('reorder: keeps the same children, changes order for some seed', () => {
    const order = (root: El) => findAll(root, (e) => e.tag === 'ul' && e.attrs.class === 'list')[0]!.children.map((c) => textOf(c));
    const base = order(page('bookshop', '/search', 'q=rust'));
    let changed = false;
    for (const s of ALL_SEEDS) {
      const m = page('bookshop', '/search', 'q=rust');
      mut(m, 'medium', s, ['reorder']);
      const o = order(m);
      expect([...o].sort()).toEqual([...base].sort());
      if (o.join() !== base.join()) changed = true;
    }
    expect(changed).toBe(true);
  });

  it('synonyms: swaps button text for a synonym', () => {
    const texts = new Set<string>();
    for (const s of ALL_SEEDS) {
      const m = page('bookshop', '/', '');
      mut(m, 'medium', s, ['synonyms']);
      texts.add(textOf(findAll(m, (e) => e.attrs['data-bench-id'] === 'bk.search')[0]!));
    }
    expect(texts.has('Find')).toBe(true);
    expect([...texts].every((t) => t === 'Search' || t === 'Find')).toBe(true);
  });

  it('labels: rewrites label text and placeholders', () => {
    const seen = new Set<string>();
    for (const s of ALL_SEEDS) {
      const m = page('library', '/', '');
      mut(m, 'heavy', s, ['labels']);
      for (const l of findAll(m, (e) => e.tag === 'label')) seen.add(textOf(l));
    }
    expect(seen.has('Search terms')).toBe(true);
    expect(seen.has('Written by')).toBe(true);
  });

  it('decoy: inserts a harmless look-alike with a decoy bench id', () => {
    let found = false;
    for (const s of ALL_SEEDS) {
      const m = page('bookshop', '/', '');
      mut(m, 'heavy', s, ['decoy']);
      const d = findAll(m, (e) => e.attrs['data-bench-id'] === 'decoy.bk.search')[0];
      if (d) {
        found = true;
        expect(d.attrs.type).toBe('button');
        expect(textOf(d)).toBe('Search tips');
        expect(d.attrs.id).toBeUndefined();
      }
      const di = findAll(m, (e) => e.attrs['data-bench-id'] === 'decoy.bk.q')[0];
      if (di) expect(di.attrs.name).toBeUndefined();
    }
    expect(found).toBe(true);
  });

  it('move: puts the submit area before the fields of its form', () => {
    let moved = false;
    for (const s of ALL_SEEDS) {
      const m = page('bookshop', '/', '');
      mut(m, 'heavy', s, ['move']);
      const form = findAll(m, (e) => e.tag === 'form')[0]!;
      const first = form.children[0] as El;
      if (first.attrs.class !== undefined && findAll(first, (e) => e.attrs['data-bench-id'] === 'bk.search').length) moved = true;
    }
    expect(moved).toBe(true);
  });

  it('urlpath: aliases internal links under /v2', () => {
    const m = page('bookshop', '/search', 'q=rust');
    mut(m, 'heavy', 2, ['urlpath']);
    const hrefs = findAll(m, (e) => e.tag === 'a').map((e) => String(e.attrs.href));
    expect(hrefs.some((h) => h.includes('/bookshop/v2/book/'))).toBe(true);
  });

  it('delay: hides control areas and adds a reveal script of at most 1.5 s', () => {
    let seen = false;
    for (const s of ALL_SEEDS) {
      const m = page('bookshop', '/', '');
      mut(m, 'heavy', s, ['delay']);
      const html = serialize(m);
      if (html.includes('data-late=')) {
        seen = true;
        expect(html).toContain('display:none');
        const ms = [...html.matchAll(/\},(\d+)\);/g)].map((x) => Number(x[1]));
        expect(ms.length).toBeGreaterThan(0);
        for (const v of ms) {
          expect(v).toBeGreaterThanOrEqual(300);
          expect(v).toBeLessThanOrEqual(1500);
        }
      }
    }
    expect(seen).toBe(true);
  });
});
