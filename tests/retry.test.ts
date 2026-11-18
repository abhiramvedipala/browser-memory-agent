import { existsSync, mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { chromium, type Browser, type Page } from 'playwright';
import { HashEmbedder } from '../src/embeddings/embedder.ts';
import { describeHandle, installPageScript } from '../src/recorder/page-script.ts';
import { resolveWithRetry } from '../src/replay/retry.ts';
import { loadResolverConfig } from '../src/resolver/config.ts';

let browser: Browser;
let page: Page;
const cfg = { ...loadResolverConfig(), retry: { attempts: 3, delaysMs: [500, 1000] } };
const deps = { embedder: new HashEmbedder(), cfg };
let n = 0;

beforeAll(async () => {
  browser = await chromium.launch();
  const ctx = await browser.newContext();
  await installPageScript(ctx);
  page = await ctx.newPage();
});
afterAll(async () => {
  await browser?.close();
});

async function load(body: string) {
  const url = `http://127.0.0.1:1/r${n++}`;
  await page.route(url, (r) => r.fulfill({ contentType: 'text/html', body: `<!doctype html><body>${body}</body>` }));
  await page.goto(url);
}

describe('resolveWithRetry', () => {
  it('finds the element on the first attempt with zero retries', async () => {
    await load('<button>Place hold</button>');
    const t = await describeHandle((await page.$('button'))!);
    const r = await resolveWithRetry(page, t, ['role'], deps, { runDir: mkdtempSync(join(tmpdir(), 'run-')), stepIdx: 1 });
    expect(r.retries).toBe(0);
    expect(r.resolution.ok).toBe(true);
    expect(r.screenshotPath).toBeUndefined();
  });

  it('retries until a late element appears (delay mutation) and reports the retry count', async () => {
    await load('<button>Place hold</button>');
    const t = await describeHandle((await page.$('button'))!);
    await load(`<button id="b" style="display:none">Place hold</button><script>setTimeout(function(){document.getElementById('b').style.display=''},900)</script>`);
    const sleeps: number[] = [];
    const r = await resolveWithRetry(page, t, ['role'], deps, {
      runDir: mkdtempSync(join(tmpdir(), 'run-')),
      stepIdx: 2,
      sleep: async (ms) => {
        sleeps.push(ms);
        await new Promise((res) => setTimeout(res, ms));
      },
    });
    expect(r.resolution.ok).toBe(true);
    expect(r.retries).toBeGreaterThan(0);
    expect(sleeps[0]).toBe(500);
  });

  it('after the last attempt writes a screenshot and the scored candidates, and refuses', async () => {
    await load('<button>Place hold</button>');
    const t = await describeHandle((await page.$('button'))!);
    await load('<h1>Other</h1><a href="/x">Somewhere else</a><button>Unrelated thing</button>');
    const dir = join(mkdtempSync(join(tmpdir(), 'run-')), 'runid');
    let slept = 0;
    const r = await resolveWithRetry(page, t, ['role', 'semantic'], deps, { runDir: dir, stepIdx: 3, sleep: async () => void slept++ });
    expect(r.resolution.ok).toBe(false);
    expect(r.retries).toBe(2);
    expect(slept).toBe(2);
    expect(existsSync(r.screenshotPath!)).toBe(true);
    const dump = JSON.parse(readFileSync(r.dumpPath!, 'utf8')) as { reason: string; topCandidates: unknown[]; trace: string[] };
    expect(dump.reason).toContain('refused');
    expect(dump.topCandidates.length).toBeGreaterThan(0);
    expect(dump.trace.length).toBeGreaterThan(0);
  });
});
