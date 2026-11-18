import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { chromium, type Browser, type Page } from 'playwright';
import { HashEmbedder } from '../src/embeddings/embedder.ts';
import type { Target } from '../src/memory/types.ts';
import { installPageScript, describeHandle } from '../src/recorder/page-script.ts';
import { loadResolverConfig } from '../src/resolver/config.ts';
import { resolveOnce } from '../src/resolver/chain.ts';

let browser: Browser;
let page: Page;
const cfg = loadResolverConfig();
const deps = { embedder: new HashEmbedder(), cfg };

beforeAll(async () => {
  browser = await chromium.launch();
  const ctx = await browser.newContext();
  await installPageScript(ctx);
  page = await ctx.newPage();
});
afterAll(async () => {
  await browser?.close();
});

let n = 0;
async function load(body: string): Promise<void> {
  const url = `http://127.0.0.1:1/fx${n++}`;
  await page.route(url, (r) => r.fulfill({ contentType: 'text/html', body: `<!doctype html><body>${body}</body>` }));
  await page.goto(url);
}
async function record(body: string, selector: string): Promise<Target> {
  await load(body);
  return describeHandle((await page.$(selector))!);
}
const textOfChosen = async (r: Awaited<ReturnType<typeof resolveOnce>>) => (r.ok ? (await r.locator!.textContent())?.trim() : null);

const SHOP = (id: string, label: string, btn: string, extra = '') =>
  `<h1>Shop</h1><form aria-label="Search"><label for="${id}">${label}</label><input id="${id}" name="q" placeholder="Title or author">${extra}<button type="submit" id="go-${id}" data-testid="go">${btn}</button></form>`;

describe('css strategy', () => {
  it('resolves by a recorded selector when exactly one element matches with the right role', async () => {
    const t = await record(SHOP('q', 'Search books', 'Search'), 'button');
    await load(SHOP('q', 'Search books', 'Search'));
    const r = await resolveOnce(page, t, ['css'], deps);
    expect(r).toMatchObject({ ok: true, strategy: 'css' });
  });

  it('misses when ids and test ids changed and the path now points at another element', async () => {
    const t = await record(SHOP('q', 'Search books', 'Search'), 'button');
    await load(`<h1>Shop</h1><div><form><label for="z">Search books</label><input id="z"><a href="/x" id="other">Search</a></form></div>`);
    const r = await resolveOnce(page, t, ['css'], deps);
    expect(r.ok).toBe(false);
  });

  it('css-only accepts a positional hit on the wrong element (naive baseline behaviour)', async () => {
    const t = await record(SHOP('q', 'Search books', 'Search'), 'button');
    // same structure, ids stripped, but the button is now a different action
    await load(`<h1>Shop</h1><form aria-label="Search"><label for="q2">Search books</label><input id="q2" name="q" placeholder="Title or author"><button type="submit">Clear everything</button></form>`);
    const r = await resolveOnce(page, t, ['css'], deps);
    expect(r).toMatchObject({ ok: true, strategy: 'css' });
    expect(await textOfChosen(r)).toBe('Clear everything');
  });

  it('in the full chain the same wrong positional hit is rejected by verification', async () => {
    const t = await record(SHOP('q', 'Search books', 'Search'), 'button');
    await load(`<h1>Shop</h1><form aria-label="Search"><label for="q2">Search books</label><input id="q2" name="q" placeholder="Title or author"><button type="submit">Clear everything</button></form>`);
    const r = await resolveOnce(page, t, ['css', 'role', 'semantic'], deps);
    expect(r.ok).toBe(false);
    expect(r.trace[0]).toContain('does not look like');
  });
});

describe('role strategy', () => {
  it('needs exactly one exact name match', async () => {
    const t = await record(SHOP('q', 'Search books', 'Search'), 'button');
    await load(`<button>Search</button>`);
    expect(await resolveOnce(page, t, ['role'], deps)).toMatchObject({ ok: true, strategy: 'role' });
    await load(`<button>Search</button><button>Search</button>`);
    expect((await resolveOnce(page, t, ['role'], deps)).ok).toBe(false);
    await load(`<button>Find</button>`);
    expect((await resolveOnce(page, t, ['role'], deps)).ok).toBe(false);
  });

  it('matches <summary> by tag because Playwright gives it no role', async () => {
    const t = await record('<details><summary>Advanced filters</summary><p>x</p></details>', 'summary');
    await load('<details><summary>Advanced filters</summary><p>y</p></details>');
    expect(await resolveOnce(page, t, ['role'], deps)).toMatchObject({ ok: true, strategy: 'role' });
  });
});

describe('semantic strategy', () => {
  it('finds a renamed, re-structured control and reports score and margin', async () => {
    const t = await record(SHOP('q', 'Search books', 'Add to cart'), 'button');
    await load(`<section><h1>Shop</h1><div><span>Search books</span><div><button class="x9">Add to cart now</button></div></div><button>Reset filters</button></section>`);
    const r = await resolveOnce(page, t, ['semantic'], deps);
    expect(r).toMatchObject({ ok: true, strategy: 'semantic' });
    expect(await textOfChosen(r)).toBe('Add to cart now');
    expect(r.score).toBeGreaterThanOrEqual(cfg.minScore);
    expect(r.margin).toBeGreaterThanOrEqual(cfg.minMargin);
    expect(r.top.length).toBeGreaterThan(1);
  });

  it('prefers the original over a look-alike decoy when the name is unchanged', async () => {
    const t = await record(SHOP('q', 'Search books', 'Add to cart'), 'button');
    await load(`<h1>Shop</h1><button>Add to cart</button><button type="button">Add to wishlist</button>`);
    const r = await resolveOnce(page, t, ['semantic'], deps);
    expect(await textOfChosen(r)).toBe('Add to cart');
  });

  it('refuses when two candidates are indistinguishable (tie, zero margin)', async () => {
    const t = await record('<h1>S</h1><button>Go</button>', 'button');
    await load('<h1>S</h1><button>Go</button><button>Go</button>');
    const r = await resolveOnce(page, t, ['semantic'], deps);
    expect(r.ok).toBe(false);
    expect(r.strategy).toBe('none');
    expect(r.margin).toBeCloseTo(0, 6);
    expect(r.reason).toContain('margin');
  });

  it('refuses rather than guess when nothing resembles the target', async () => {
    const t = await record('<h1>S</h1><button>Add to cart</button>', 'button');
    await load('<h1>Z</h1><a href="/q">Zebra crossing</a><input aria-label="Quantum flux">');
    const r = await resolveOnce(page, t, ['semantic'], deps);
    expect(r.ok).toBe(false);
    expect(r.reason).toContain('below');
    expect(r.top.length).toBeGreaterThan(0);
  });

  it('never picks a disabled element', async () => {
    const t = await record('<h1>S</h1><button>Pay</button>', 'button');
    await load('<h1>S</h1><button disabled>Pay</button>');
    expect((await resolveOnce(page, t, ['semantic'], deps)).ok).toBe(false);
  });

  it('reports no candidates on an empty page', async () => {
    const t = await record('<button>Pay</button>', 'button');
    await load('<p>nothing here</p>');
    const r = await resolveOnce(page, t, ['semantic'], deps);
    expect(r.reason).toContain('no enabled candidates');
  });
});

describe('chain ordering and llm hook', () => {
  it('uses css first, then role, then semantic and logs which won', async () => {
    const t = await record(SHOP('q', 'Search books', 'Search'), 'button');
    await load(SHOP('q', 'Search books', 'Search'));
    expect((await resolveOnce(page, t, ['css', 'role', 'semantic'], deps)).strategy).toBe('css');
    await load(`<div><section><button type="submit" class="a">Search</button></section></div>`);
    const r2 = await resolveOnce(page, t, ['css', 'role', 'semantic'], deps);
    expect(r2.strategy).toBe('role');
    await load(`<form><button type="submit">Find</button></form>`);
    const r3 = await resolveOnce(page, t, ['css', 'role', 'semantic'], deps);
    expect(r3.trace.some((x) => x.startsWith('css:'))).toBe(true);
    expect(r3.trace.some((x) => x.startsWith('role:'))).toBe(true);
  });

  it('calls the llm hook only after semantic refused, restricted to the top 3, and accepts "none"', async () => {
    const t = await record('<h1>S</h1><button>Go</button>', 'button');
    await load('<h1>S</h1><button>Go</button><button>Go</button><button>Go</button>');
    let seen = 0;
    const picks = async (_t: Target, top: { idx: number }[]) => {
      seen = top.length;
      return top[1]!.idx;
    };
    const r = await resolveOnce(page, t, ['semantic', 'llm'], { ...deps, llmPick: picks });
    expect(r).toMatchObject({ ok: true, strategy: 'llm' });
    expect(seen).toBe(3);
    const none = await resolveOnce(page, t, ['semantic', 'llm'], { ...deps, llmPick: async () => null });
    expect(none.ok).toBe(false);
    const bogus = await resolveOnce(page, t, ['semantic', 'llm'], { ...deps, llmPick: async () => 99 });
    expect(bogus.ok).toBe(false);
  });
});
