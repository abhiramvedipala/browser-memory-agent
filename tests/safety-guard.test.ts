import http from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { chromium, type Browser } from 'playwright';
import { allApps } from '../demo-apps/apps/index.ts';
import { mutate } from '../demo-apps/mutate.ts';
import { startDemoServer, type DemoServer } from '../demo-apps/server.ts';
import { evaluateSuccess, fetchState, loadFlows } from '../src/bench/flows.ts';
import { runGolden } from '../src/bench/golden.ts';
import { Allowlist } from '../src/safety/allowlist.ts';
import { newGuardedContext } from '../src/safety/guard.ts';
import { assertRecordable, RefusedFieldError, sensitiveReason } from '../src/safety/sensitive.ts';

let srv: DemoServer;
let browser: Browser;
let other: http.Server; // a second loopback server on a port that is NOT allowed
let otherPort = 0;
let al: Allowlist;

beforeAll(async () => {
  srv = await startDemoServer({ port: 0, apps: allApps, mutator: mutate });
  other = http.createServer((_req, res) => {
    res.writeHead(200, { 'content-type': 'text/html' });
    res.end('<h1>not the demo</h1><img src="http://example.com/pixel.png"><script src="https://cdn.example.net/x.js"></script>');
  });
  await new Promise<void>((r) => other.listen(0, '127.0.0.1', r));
  otherPort = (other.address() as AddressInfo).port;
  al = new Allowlist({ ports: [srv.port] });
  browser = await chromium.launch();
});
afterAll(async () => {
  await browser?.close();
  other?.closeAllConnections();
  other?.close();
  await srv?.close();
});

describe('route guard', () => {
  it('blocks navigation to an external site and records it', async () => {
    const { context, stats } = await newGuardedContext(browser, al);
    try {
      const page = await context.newPage();
      await expect(page.goto('https://example.com/')).rejects.toThrow();
      expect(stats.blocked).toContain('https://example.com/');
      expect(stats.allowed).toBe(0);
    } finally {
      await context.close();
    }
  });

  it('blocks a loopback server on a non-demo port and the external assets it references', async () => {
    const { context, stats } = await newGuardedContext(browser, al);
    try {
      const page = await context.newPage();
      await expect(page.goto(`http://127.0.0.1:${otherPort}/`)).rejects.toThrow();
      expect(stats.blocked.some((u) => u.includes(`:${otherPort}`))).toBe(true);
    } finally {
      await context.close();
    }
  });

  it('aborts external subresources of an allowed page (fonts, CDNs, analytics)', async () => {
    const { context, stats } = await newGuardedContext(browser, al);
    try {
      const page = await context.newPage();
      await page.goto(`${srv.url}/bookshop/`);
      await page.evaluate(() => {
        const img = document.createElement('img');
        img.src = 'https://cdn.example.net/pixel.png';
        document.body.append(img);
      });
      await page.waitForTimeout(200);
      expect(stats.blocked).toContain('https://cdn.example.net/pixel.png');
    } finally {
      await context.close();
    }
  });

  it('makes zero non-local requests while a full demo flow runs', async () => {
    const flow = loadFlows().find((f) => f.id === 'bookshop-rust-paperback')!;
    const { context, stats } = await newGuardedContext(browser, al);
    try {
      await context.addCookies([{ name: 'bma_sid', value: 'guard-run', url: srv.url }]);
      const page = await context.newPage();
      await runGolden(page, flow, srv.url, flow.params, '?mut=heavy&seed=2');
      expect(stats.blocked).toEqual([]);
      expect(stats.allowed).toBeGreaterThan(3);
      expect(evaluateSuccess(flow, await fetchState(srv.url, 'guard-run'))).toBe(true);
    } finally {
      await context.close();
    }
  });
});

describe('sensitive fields are refused at record time', () => {
  it('refuses type=password', () => {
    expect(() => assertRecordable({ tag: 'input', inputType: 'password' })).toThrow(RefusedFieldError);
    expect(() => assertRecordable({ tag: 'input', inputType: 'PASSWORD' })).toThrow(/password/);
  });

  it('refuses credential and payment autocomplete values and names', () => {
    expect(sensitiveReason({ autocomplete: 'current-password' })).toBeDefined();
    expect(sensitiveReason({ autocomplete: 'cc-number' })).toBeDefined();
    expect(sensitiveReason({ autocomplete: 'one-time-code' })).toBeDefined();
    expect(sensitiveReason({ name: 'user_password' })).toBeDefined();
    expect(sensitiveReason({ label: 'Credit card number' })).toBeDefined();
    expect(sensitiveReason({ label: 'Solve the CAPTCHA' })).toBeDefined();
  });

  it('allows ordinary fields', () => {
    expect(sensitiveReason({ inputType: 'text', name: 'q', label: 'Search books' })).toBeUndefined();
    expect(sensitiveReason({ inputType: 'email', name: 'email', label: 'Email address' })).toBeUndefined();
    expect(sensitiveReason({ label: 'Your passport to better reading' })).toBeUndefined();
  });
});
