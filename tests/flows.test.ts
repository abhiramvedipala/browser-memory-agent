import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { chromium, type Browser } from 'playwright';
import { startDemoServer, type DemoServer } from '../demo-apps/server.ts';
import { allApps } from '../demo-apps/apps/index.ts';
import { mutate } from '../demo-apps/mutate.ts';
import { evaluateSuccess, fetchState, interpolate, loadFlows, taskSentence } from '../src/bench/flows.ts';
import { runGolden } from '../src/bench/golden.ts';

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

describe('flow definitions', () => {
  it('has 20 flows over 6 apps with unique ids', () => {
    expect(flows).toHaveLength(20);
    expect(new Set(flows.map((f) => f.id)).size).toBe(20);
    expect(new Set(flows.map((f) => f.app)).size).toBe(6);
  });

  it('interpolates parameters into the task sentence', () => {
    expect(interpolate('find {{q}} in {{x}}', { q: 'rust' })).toBe('find rust in {{x}}');
    const f = flows.find((x) => x.id === 'bookshop-rust-paperback');
    expect(f && taskSentence(f)).toBe('Find a paperback book about rust under $40 and add it to the cart');
  });

  it('every flow has a success check and steps', () => {
    for (const f of flows) {
      expect(f.steps.length).toBeGreaterThan(1);
      expect(f.success.length).toBeGreaterThan(0);
    }
  });
});

describe('golden scripts on mut=none', () => {
  it.each(flows.map((f) => [f.id, f] as const))('%s passes its server-side success check', async (_id, flow) => {
    const sid = `golden-${flow.id}`;
    const ctx = await browser.newContext();
    try {
      await ctx.addCookies([{ name: 'bma_sid', value: sid, url: srv.url }]);
      const page = await ctx.newPage();
      await runGolden(page, flow, srv.url);
      const state = await fetchState(srv.url, sid);
      expect(evaluateSuccess(flow, state), JSON.stringify(state.events.slice(-4))).toBe(true);
    } finally {
      await ctx.close();
    }
  });

  it('does not report success before the flow runs', async () => {
    const f = flows[0]!;
    const state = await fetchState(srv.url, 'never-used');
    expect(evaluateSuccess(f, state)).toBe(false);
  });
});
