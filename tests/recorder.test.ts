import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { chromium, type Browser, type Page } from 'playwright';
import { allApps } from '../demo-apps/apps/index.ts';
import { mutate } from '../demo-apps/mutate.ts';
import { startDemoServer, type DemoServer } from '../demo-apps/server.ts';
import { loadFlows } from '../src/bench/flows.ts';
import { runGolden } from '../src/bench/golden.ts';
import { Recorder } from '../src/recorder/recorder.ts';
import { RefusedFieldError } from '../src/safety/sensitive.ts';
import { parameterize, rebase, recordedUrl, urlMatches, urlPattern } from '../src/recorder/url.ts';

let browser: Browser;
let srv: DemoServer;
const flows = loadFlows();

beforeAll(async () => {
  browser = await chromium.launch();
  srv = await startDemoServer({ port: 0, apps: allApps, mutator: mutate });
});
afterAll(async () => {
  await browser?.close();
  await srv?.close();
});

/** document.write (setContent) drops listeners, so serve fixtures through a real navigation. */
async function servePage(page: Page, body: string): Promise<void> {
  await page.route('**/fixture', (r) => r.fulfill({ contentType: 'text/html', body: `<!doctype html><title>f</title>${body}` }));
  await page.goto(`${srv.url}/fixture`);
}

async function recordFlow(id: string) {
  const flow = flows.find((f) => f.id === id)!;
  const ctx = await browser.newContext();
  try {
    await ctx.addCookies([{ name: 'bma_sid', value: `rec-${id}`, url: srv.url }]);
    const rec = await Recorder.attach(ctx, { params: flow.params });
    const page = await ctx.newPage();
    await runGolden(page, flow, srv.url);
    const out = await rec.finish();
    return { flow, ...out };
  } finally {
    await ctx.close();
  }
}

describe('url helpers', () => {
  it('builds patterns with wildcard port, :id segments and no alias or query', () => {
    expect(urlPattern('http://127.0.0.1:4173/bookshop/book/4?added=1')).toBe('http://127.0.0.1:*/bookshop/book/:id');
    expect(urlPattern('http://127.0.0.1:4173/bookshop/v2/book/4')).toBe('http://127.0.0.1:*/bookshop/book/:id');
  });
  it('matches ignoring ids, query, ports and alias segments, but not other paths or hosts', () => {
    const p = urlPattern('http://127.0.0.1:4173/bookshop/book/4');
    expect(urlMatches(p, 'http://127.0.0.1:5000/bookshop/v2/book/17?x=1')).toBe(true);
    expect(urlMatches(p, 'http://127.0.0.1:4173/bookshop/cart')).toBe(false);
    expect(urlMatches(p, 'http://localhost:4173/bookshop/book/4')).toBe(false);
    expect(urlMatches('', 'http://anything')).toBe(true);
  });
  it('strips mutation params, rebases origins and parameterizes values', () => {
    expect(recordedUrl('http://127.0.0.1:4173/bookshop/?mut=heavy&seed=3&q=a')).toBe('http://127.0.0.1:4173/bookshop/?q=a');
    expect(rebase('http://127.0.0.1:4173/docs/?q=a', 'http://127.0.0.1:9')).toBe('http://127.0.0.1:9/docs/?q=a');
    expect(parameterize('Rust', { query: 'rust' })).toBe('{{query}}');
    expect(parameterize('other', { query: 'rust' })).toBe('other');
    expect(parameterize('', { empty: '' })).toBe('');
  });
});

describe('recording golden flows', () => {
  it('records the bookshop rust flow as navigate + fill/click/select/click steps with parameters', async () => {
    const { steps } = await recordFlow('bookshop-rust-paperback');
    expect(steps.map((s) => s.action)).toEqual(['navigate', 'fill', 'click', 'select', 'fill', 'click', 'click', 'click']);
    expect(steps[0]).toMatchObject({ valueTemplate: expect.stringContaining('/bookshop/') });
    expect(steps[1]).toMatchObject({ valueTemplate: '{{query}}', target: { role: 'textbox', accessibleName: 'Search books' } });
    expect(steps[2]?.target).toMatchObject({ role: 'button', accessibleName: 'Search' });
    expect(steps[3]).toMatchObject({ valueTemplate: '{{format}}', target: { role: 'combobox', accessibleName: 'Format' } });
    expect(steps[4]?.valueTemplate).toBe('{{maxPrice}}');
    expect(steps[6]?.target?.accessibleName).toBe('Rust for Rustaceans');
    expect(steps[7]?.target?.accessibleName).toBe('Add to cart');
    expect(steps[1]?.urlPattern).toBe('http://127.0.0.1:*/bookshop');
  });

  it('records checkbox, details summary and select actions', async () => {
    const { steps } = await recordFlow('library-spanish-available');
    expect(steps.map((s) => s.action)).toEqual(['navigate', 'fill', 'click', 'select', 'check', 'click', 'click']);
    expect(steps[2]?.target?.tag).toBe('summary');
    expect(steps[4]).toMatchObject({ valueTemplate: 'true', target: { role: 'checkbox' } });
  });

  it('records one step per golden step for all 20 flows (plus the opening navigate)', async () => {
    for (const f of flows) {
      const { steps } = await recordFlow(f.id);
      expect(steps.length, f.id).toBe(f.steps.length + 1);
      expect(steps.every((s) => s.target === null || s.target !== undefined)).toBe(true);
    }
  }, 120_000);

  it('never stores the ground-truth attribute in any recorded target', async () => {
    const { steps } = await recordFlow('helpdesk-technical');
    expect(JSON.stringify(steps)).not.toContain('bench');
  });
});

describe('typing, Enter and sensitive fields', () => {
  it('merges typed characters into one debounced fill', async () => {
    const ctx = await browser.newContext();
    try {
      const rec = await Recorder.attach(ctx);
      const page = await ctx.newPage();
      await page.goto(`${srv.url}/bookshop/`);
      await page.getByLabel('Search books').pressSequentially('rust', { delay: 30 });
      const { steps } = await rec.finish();
      expect(steps.map((s) => s.action)).toEqual(['navigate', 'fill']);
      expect(steps[1]?.valueTemplate).toBe('rust');
    } finally {
      await ctx.close();
    }
  });

  it('records Enter in a form field as press and does not duplicate the form submit', async () => {
    const ctx = await browser.newContext();
    try {
      const rec = await Recorder.attach(ctx, { params: { query: 'dune' } });
      const page = await ctx.newPage();
      await page.goto(`${srv.url}/bookshop/`);
      await page.getByLabel('Search books').fill('dune');
      await page.getByLabel('Search books').press('Enter');
      await page.waitForURL(/search/);
      const { steps } = await rec.finish();
      expect(steps.map((s) => s.action)).toEqual(['navigate', 'fill', 'press']);
      expect(steps[1]?.valueTemplate).toBe('{{query}}');
      expect(steps[2]?.valueTemplate).toBe('Enter');
    } finally {
      await ctx.close();
    }
  });

  it('refuses a password field: nothing is stored, the refusal is reported, strict mode throws', async () => {
    const ctx = await browser.newContext();
    try {
      const refused: string[] = [];
      const rec = await Recorder.attach(ctx, { onRefused: (w) => refused.push(w) });
      const page = await ctx.newPage();
      await servePage(page, '<form><label for="u">User</label><input id="u" name="u"><label for="p">Secret</label><input id="p" type="password" name="p"></form>');
      await page.fill('#p', 'hunter2-should-never-be-stored');
      await page.fill('#u', 'visible-user');
      const out = await rec.finish();
      expect(JSON.stringify(out)).not.toContain('hunter2');
      expect(out.steps.map((s) => s.action)).toEqual(['navigate', 'fill']);
      expect(out.refusals[0]).toContain('password');
      expect(refused.length).toBe(1);
      await expect(rec.finish({ strict: true })).rejects.toThrow(RefusedFieldError);
    } finally {
      await ctx.close();
    }
  });

  it('refuses credit-card style fields by autocomplete', async () => {
    const ctx = await browser.newContext();
    try {
      const rec = await Recorder.attach(ctx);
      const page = await ctx.newPage();
      await servePage(page, '<input id="c" autocomplete="cc-number" aria-label="Number">');
      await page.fill('#c', '4111111111111111');
      const out = await rec.finish();
      expect(out.steps.map((s) => s.action)).toEqual(['navigate']);
      expect(out.refusals).toHaveLength(1);
    } finally {
      await ctx.close();
    }
  });
});
