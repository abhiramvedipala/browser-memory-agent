import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { chromium, type Browser } from 'playwright';
import { startDemoServer, type DemoServer } from '../demo-apps/server.ts';
import { allApps } from '../demo-apps/apps/index.ts';
import { mutate } from '../demo-apps/mutate.ts';
import { evaluateSuccess, fetchState, loadFlows } from '../src/bench/flows.ts';
import { runGolden } from '../src/bench/golden.ts';

// The apps must still work under mutation (decoys inert, aliased links routed,
// delayed controls eventually clickable), otherwise the benchmark is invalid.
const flows = loadFlows();
let srv: DemoServer;
let browser: Browser;

beforeAll(async () => {
  srv = await startDemoServer({ port: 0, apps: allApps, mutator: mutate });
  browser = await chromium.launch();
});
afterAll(async () => {
  await browser?.close();
  await srv?.close();
});

describe('golden scripts under heavy mutation (seed 1)', () => {
  it.each(flows.map((f) => [f.id, f] as const))('%s still succeeds', async (_id, flow) => {
    const sid = `mut-${flow.id}`;
    const ctx = await browser.newContext();
    try {
      await ctx.addCookies([{ name: 'bma_sid', value: sid, url: srv.url }]);
      const page = await ctx.newPage();
      await runGolden(page, flow, srv.url, flow.params, '?mut=heavy&seed=1');
      expect(evaluateSuccess(flow, await fetchState(srv.url, sid))).toBe(true);
    } finally {
      await ctx.close();
    }
  });
});
