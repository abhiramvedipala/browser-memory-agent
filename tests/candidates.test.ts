import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { chromium, type Browser, type Page } from 'playwright';
import { allApps } from '../demo-apps/apps/index.ts';
import { mutate } from '../demo-apps/mutate.ts';
import { startDemoServer, type DemoServer } from '../demo-apps/server.ts';
import { candidateLocator, candidateText, collectCandidates } from '../src/replay/candidates.ts';
import { installPageScript } from '../src/recorder/page-script.ts';

let browser: Browser;
let page: Page;
let srv: DemoServer;
beforeAll(async () => {
  browser = await chromium.launch();
  const ctx = await browser.newContext();
  await installPageScript(ctx);
  page = await ctx.newPage();
  srv = await startDemoServer({ port: 0, apps: allApps, mutator: mutate });
  page.route('**/fx', (r) => r.fulfill({ contentType: 'text/html', body: '' }));
});
afterAll(async () => {
  await browser?.close();
  await srv?.close();
});

async function load(body: string) {
  await page.route('**/fx', (r) => r.fulfill({ contentType: 'text/html', body: `<!doctype html><body>${body}</body>` }));
  await page.goto(`${srv.url}/fx`);
}

describe('collectCandidates policy', () => {
  it('excludes hidden elements (display none, visibility hidden, zero size, aria-hidden, closed details)', async () => {
    await load(`
      <button>Visible</button>
      <button style="display:none">NoneBtn</button>
      <button style="visibility:hidden">Invisible</button>
      <button style="width:0;height:0;padding:0;border:0">Zero</button>
      <div aria-hidden="true"><button>AriaHidden</button></div>
      <details><summary>Sum</summary><button>InsideClosed</button></details>`);
    const names = (await collectCandidates(page)).map((c) => c.accessibleName);
    expect(names).toContain('Visible');
    expect(names).toContain('Sum');
    for (const n of ['NoneBtn', 'Invisible', 'Zero', 'AriaHidden', 'InsideClosed']) expect(names).not.toContain(n);
  });

  it('includes disabled elements but flags them', async () => {
    await load('<button disabled>Off</button><button>On</button>');
    const cs = await collectCandidates(page);
    expect(cs.find((c) => c.accessibleName === 'Off')?.disabled).toBe(true);
    expect(cs.find((c) => c.accessibleName === 'On')?.disabled).toBe(false);
  });

  it('includes offscreen elements below the fold, flagged not in viewport, and they can be located', async () => {
    await load('<button>Top</button><div style="height:3000px"></div><button id="b">Bottom</button>');
    const cs = await collectCandidates(page);
    const bottom = cs.find((c) => c.accessibleName === 'Bottom')!;
    expect(bottom.inViewport).toBe(false);
    expect(cs.find((c) => c.accessibleName === 'Top')?.inViewport).toBe(true);
    expect(await candidateLocator(page, bottom).getAttribute('id')).toBe('b');
  });

  it('re-collecting re-numbers candidates and clears stale tags', async () => {
    await load('<button>A</button><button>B</button>');
    await collectCandidates(page);
    await page.evaluate(() => document.querySelector('button')!.remove());
    const cs = await collectCandidates(page);
    expect(cs.map((c) => c.idx)).toEqual([0]);
    expect(await page.locator('[data-bma-cand]').count()).toBe(1);
  });

  it('never exposes the ground-truth id on demo pages', async () => {
    await page.goto(`${srv.url}/bookshop/search?q=rust&mut=heavy&seed=3`);
    await page.waitForTimeout(1700);
    const cs = await collectCandidates(page);
    expect(cs.length).toBeGreaterThan(8);
    expect(JSON.stringify(cs)).not.toMatch(/bench|decoy\./);
  });
});

describe('candidateText', () => {
  it('puts role and name first and skips fields that repeat the name', () => {
    const t = { role: 'textbox', accessibleName: 'Search books', label: 'Search books', placeholder: 'Title or author', text: '', nearbyText: 'Welcome | Search books', tag: 'input', inputType: 'text', attrs: {}, cssCandidates: [], bbox: null, frameUrl: '' };
    expect(candidateText(t)).toBe('textbox: Search books. placeholder: Title or author. context: Welcome | Search books');
  });
});
