import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { chromium, type Browser } from 'playwright';
import { allApps } from '../demo-apps/apps/index.ts';
import { mutate } from '../demo-apps/mutate.ts';
import { startDemoServer, type DemoServer } from '../demo-apps/server.ts';
import { main, parseParams } from '../src/cli.ts';
import { Store } from '../src/memory/store.ts';
import { recordSession } from '../src/recorder/session.ts';
import { Allowlist, BlockedUrlError } from '../src/safety/allowlist.ts';

let browser: Browser;
let srv: DemoServer;
beforeAll(async () => {
  browser = await chromium.launch();
  srv = await startDemoServer({ port: 0, apps: allApps, mutator: mutate });
});
afterAll(async () => {
  await browser?.close();
  await srv?.close();
});

describe('recordSession', () => {
  it('records a scripted human session into SQLite', async () => {
    const store = Store.open(':memory:');
    const logs: string[] = [];
    const res = await recordSession({
      browser,
      store,
      url: `${srv.url}/recipes/`,
      name: 'soup-search',
      task: 'Search soup recipes',
      params: { q: 'soup' },
      allowlist: new Allowlist({ ports: [srv.port] }),
      log: (l) => logs.push(l),
      until: async (page) => {
        await page.getByLabel('Search recipes').fill('soup');
        await page.getByRole('button', { name: 'Search', exact: true }).click();
        await page.waitForURL(/search/);
      },
    });
    expect(res.workflow.name).toBe('soup-search');
    expect(res.workflow.steps.map((s) => s.action)).toEqual(['navigate', 'fill', 'click']);
    expect(res.workflow.steps[1]?.valueTemplate).toBe('{{q}}');
    expect(res.workflow.params).toEqual({ q: 'soup' });
    expect(res.blockedRequests).toEqual([]);
    expect(store.getWorkflowByName('soup-search')?.steps).toHaveLength(3);
    expect(logs.some((l) => l.includes('step 2: fill'))).toBe(true);
  });

  it('refuses non-local URLs before launching anything', async () => {
    const store = Store.open(':memory:');
    const fakeBrowser = { newContext: vi.fn() } as unknown as Browser;
    await expect(recordSession({ browser: fakeBrowser, store, url: 'https://example.com/', name: 'x', until: async () => undefined })).rejects.toThrow(BlockedUrlError);
    expect((fakeBrowser.newContext as ReturnType<typeof vi.fn>)).not.toHaveBeenCalled();
    expect(store.listWorkflows()).toEqual([]);
  });

  it('reports refused sensitive fields and stores no value from them', async () => {
    const store = Store.open(':memory:');
    const res = await recordSession({
      browser,
      store,
      url: `${srv.url}/bookshop/`,
      name: 'with-secret',
      allowlist: new Allowlist({ ports: [srv.port] }),
      until: async (page) => {
        await page.evaluate(() => {
          const i = document.createElement('input');
          i.type = 'password';
          i.id = 'pw';
          i.setAttribute('aria-label', 'Secret');
          document.body.append(i);
        });
        await page.fill('#pw', 'topsecret-value');
        await page.getByLabel('Search books').fill('rust');
      },
    });
    expect(res.refusals).toHaveLength(1);
    expect(JSON.stringify(res.workflow)).not.toContain('topsecret');
  });

  it('counts the opening navigation as a step, so even a bare visit saves a workflow', async () => {
    const store = Store.open(':memory:');
    const res = await recordSession({ browser, store, url: `${srv.url}/bookshop/`, name: 'visit', allowlist: new Allowlist({ ports: [srv.port] }), until: async () => undefined });
    expect(res.workflow.steps.map((s) => s.action)).toEqual(['navigate']);
  });
});

describe('cli', () => {
  it('parses --param pairs', () => {
    expect(parseParams(['a=1', 'b=x=y'])).toEqual({ a: '1', b: 'x=y' });
    expect(() => parseParams(['oops'])).toThrow(/name=value/);
  });

  it('bma record exits 3 for an external URL without starting a browser', async () => {
    const err = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    expect(await main(['record', '--url', 'https://example.com', '--name', 'x'])).toBe(3);
    expect(err.mock.calls[0]?.[0]).toContain('only drives the local demo apps');
    err.mockRestore();
  });

  it('bma record without required flags prints usage and exits 2', async () => {
    const err = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    expect(await main(['record'])).toBe(2);
    err.mockRestore();
  });

  it('bma list works on an empty database and unknown commands exit 2', async () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => undefined);
    const err = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    expect(await main(['list', '--db', ':memory:'])).toBe(0);
    expect(await main(['wat'])).toBe(2);
    log.mockRestore();
    err.mockRestore();
  });
});
