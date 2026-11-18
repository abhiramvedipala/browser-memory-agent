import { readFileSync } from 'node:fs';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { chromium, type Browser, type Page } from 'playwright';
import { allApps } from '../demo-apps/apps/index.ts';
import { mutate } from '../demo-apps/mutate.ts';
import { startDemoServer, type DemoServer } from '../demo-apps/server.ts';
import { describeHandle, ensurePageScript, PAGE_SCRIPT_PATH } from '../src/recorder/page-script.ts';
import type { Target } from '../src/memory/types.ts';

let browser: Browser;
let page: Page;
let srv: DemoServer;

beforeAll(async () => {
  browser = await chromium.launch();
  page = await browser.newPage();
  srv = await startDemoServer({ port: 0, apps: allApps, mutator: mutate });
});
afterAll(async () => {
  await browser?.close();
  await srv?.close();
});

async function describeIn(html: string, selector: string): Promise<Target> {
  await page.setContent(html);
  await ensurePageScript(page);
  const h = await page.$(selector);
  if (!h) throw new Error(`no element for ${selector}`);
  return describeHandle(h);
}

describe('page script source', () => {
  it('never mentions the ground-truth attribute', () => {
    expect(readFileSync(PAGE_SCRIPT_PATH, 'utf8')).not.toContain('bench');
  });
});

describe('describe(): names and labels', () => {
  it('uses label[for] for the accessible name and label', async () => {
    const t = await describeIn('<label for="q">Search books</label><input id="q" name="q" placeholder="Title">', '#q');
    expect(t).toMatchObject({ role: 'textbox', accessibleName: 'Search books', label: 'Search books', placeholder: 'Title', tag: 'input', inputType: 'text' });
    expect(t.attrs).toEqual({ name: 'q' });
  });

  it('handles a wrapping label', async () => {
    const t = await describeIn('<label>Email <input type="email" name="e"></label>', 'input');
    expect(t.accessibleName).toBe('Email');
    expect(t.inputType).toBe('email');
  });

  it('prefers aria-labelledby, then aria-label, over a native label', async () => {
    const a = await describeIn('<span id="x">From span</span><label for="i">Native</label><input id="i" aria-labelledby="x">', '#i');
    expect(a.accessibleName).toBe('From span');
    const b = await describeIn('<label for="i">Native</label><input id="i" aria-label="Aria wins">', '#i');
    expect(b.accessibleName).toBe('Aria wins');
    expect(b.label).toBe('Native');
  });

  it('falls back to the placeholder for an unlabelled input', async () => {
    const t = await describeIn('<input placeholder="Find a thing">', 'input');
    expect(t.accessibleName).toBe('Find a thing');
    expect(t.label).toBe('');
  });

  it('names buttons and links from their content, submit inputs from value', async () => {
    expect((await describeIn('<button type="submit">  Add   to cart </button>', 'button')).accessibleName).toBe('Add to cart');
    expect((await describeIn('<a href="/x?y=1">Go <b>now</b></a>', 'a'))).toMatchObject({ role: 'link', accessibleName: 'Go now', attrs: { href: '/x?y=1' } });
    expect((await describeIn('<input type="submit" value="Send">', 'input')).accessibleName).toBe('Send');
  });

  it('maps native elements to roles', async () => {
    expect((await describeIn('<select><option>A</option></select>', 'select')).role).toBe('combobox');
    expect((await describeIn('<input type="checkbox" aria-label="c">', 'input')).role).toBe('checkbox');
    expect((await describeIn('<textarea aria-label="t"></textarea>', 'textarea')).role).toBe('textbox');
    expect((await describeIn('<a role="tab" href="/t">Tab</a>', 'a')).role).toBe('tab');
  });

  it('reads the selected option as text for a select', async () => {
    const t = await describeIn('<select aria-label="s"><option>One</option><option selected>Two</option></select>', 'select');
    expect(t.text).toBe('Two');
  });
});

describe('describe(): nearby text, css candidates and attrs', () => {
  it('collects legend, nearest heading and card heading as nearby text', async () => {
    const t = await describeIn(
      '<h1>Page title</h1><form aria-label="Filters"><fieldset><legend>Dietary needs</legend><input type="checkbox" id="v" aria-label="Vegan"></fieldset></form>',
      '#v',
    );
    expect(t.nearbyText).toContain('Dietary needs');
    expect(t.nearbyText).toContain('Filters');
    expect(t.nearbyText).toContain('Page title');
    const card = await describeIn('<h2>Results</h2><ul><li><h3>Rust for Rustaceans</h3><a href="/b/4">Buy</a></li></ul>', 'a');
    expect(card.nearbyText.split(' | ')[0]).toBe('Rust for Rustaceans');
  });

  it('lists id, data-testid and a short CSS path, best first', async () => {
    const t = await describeIn('<div><form><div></div><div><button id="go" data-testid="go-btn">Go</button></div></form></div>', 'button');
    expect(t.cssCandidates[0]).toBe('#go');
    expect(t.cssCandidates[1]).toBe('[data-testid="go-btn"]');
    expect(t.cssCandidates[2]).toMatch(/form > div:nth-of-type\(2\) > button$/);
    for (const c of t.cssCandidates) expect(await page.locator(c).count()).toBe(1);
  });

  it('only keeps allowlisted attributes and no class, id or data-* values', async () => {
    const t = await describeIn('<input class="secret-class" id="sid" data-foo="x" data-bench-id="gt" name="n" autocomplete="off" aria-label="x">', 'input');
    expect(Object.keys(t.attrs).sort()).toEqual(['autocomplete', 'name']);
    expect(JSON.stringify(t)).not.toContain('bench');
    expect(JSON.stringify(t)).not.toContain('secret-class');
  });

  it('records a bounding box and the frame url', async () => {
    const t = await describeIn('<button style="width:120px;height:30px">B</button>', 'button');
    expect(t.bbox).toMatchObject({ width: 120, height: 30 });
    expect(t.frameUrl).toContain('about:blank');
  });
});

describe('agreement with Playwright accessible names on the demo apps', () => {
  const pages = [
    '/bookshop/',
    '/bookshop/search?q=rust',
    '/bookshop/book/4',
    '/library/',
    '/library/catalog?keywords=poetry',
    '/library/hold/10',
    '/jobs/',
    '/jobs/search?kw=developer&loc=Remote',
    '/jobs/posting/9',
    '/recipes/search?q=pasta',
    '/docs/page/install',
    '/helpdesk/new',
    '/helpdesk/new/2',
  ];
  for (const level of ['none', 'heavy'] as const) {
    it(`every visible control is found by getByRole(role, {name, exact}) on ${level} pages`, async () => {
      const bad: string[] = [];
      let checked = 0;
      for (const path of pages) {
        const ctx = await browser.newContext();
        try {
          const p = await ctx.newPage();
          await p.goto(`${srv.url}${path}${path.includes('?') ? '&' : '?'}mut=${level}&seed=7`);
          await p.waitForFunction(() => Array.from(document.querySelectorAll<HTMLElement>('[data-late]')).every((e) => e.style.display !== 'none')); // delayed controls appeared
          await ensurePageScript(p);
          const handles = await p.evaluateHandle(() => (window as unknown as { __bma: { interactiveElements(): Element[] } }).__bma.interactiveElements());
          const n = await handles.evaluate((a) => a.length);
          for (let i = 0; i < n; i++) {
            const el = (await handles.evaluateHandle((a, k) => a[k], i)).asElement()!;
            const t = await describeHandle(el);
            if (!t.role || !t.accessibleName) continue; // not addressable by role: covered by other strategies
            if (t.tag === 'summary') continue; // Playwright exposes no role for <summary>; handled in the role strategy
            checked++;
            const loc = p.getByRole(t.role as Parameters<Page['getByRole']>[0], { name: t.accessibleName, exact: true });
            const matches = await loc.elementHandles();
            const same = await Promise.all(matches.map((m) => m.evaluate((x, y) => x === y, el)));
            if (!same.some(Boolean)) bad.push(`${path} ${t.role} "${t.accessibleName}"`);
          }
        } finally {
          await ctx.close();
        }
      }
      expect(checked).toBeGreaterThan(60);
      expect(bad).toEqual([]);
    }, 90_000);
  }
});
