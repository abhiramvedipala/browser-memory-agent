import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { h } from '../demo-apps/dom.ts';
import { startDemoServer, stripAlias, parseMut, type DemoServer } from '../demo-apps/server.ts';
import type { DemoApp } from '../demo-apps/types.ts';

const toy: DemoApp = {
  name: 'toy',
  basePath: '/toy',
  title: 'Toy',
  handle(req) {
    if (req.method === 'POST' && req.path === '/submit') {
      req.session.submissions += 1;
      req.session.events.push({ type: 'submit', data: { v: req.form.get('v') ?? '' } });
      return { redirect: '/toy/' };
    }
    if (req.path === '/') return { page: h('html', {}, h('body', {}, h('h1', {}, `hello ${req.session.submissions}`))) };
    return undefined;
  },
};

let srv: DemoServer;
beforeAll(async () => {
  srv = await startDemoServer({ port: 0, apps: [toy] });
});
afterAll(async () => {
  await srv.close();
});

describe('demo server', () => {
  it('binds to 127.0.0.1 only', () => {
    expect(srv.url.startsWith('http://127.0.0.1:')).toBe(true);
  });

  it('serves app pages and 404s unknown paths', async () => {
    expect((await fetch(`${srv.url}/toy/`)).status).toBe(200);
    expect((await fetch(`${srv.url}/nope`)).status).toBe(404);
    expect((await fetch(`${srv.url}/toy/missing`)).status).toBe(404);
  });

  it('counts submissions per session and exposes them on /__bench/state', async () => {
    const post = (sid: string) =>
      fetch(`${srv.url}/toy/submit?sid=${sid}`, { method: 'POST', body: 'v=1', headers: { 'content-type': 'application/x-www-form-urlencoded' }, redirect: 'manual' });
    expect((await post('a')).status).toBe(303);
    await post('a');
    await post('b');
    const a = (await (await fetch(`${srv.url}/__bench/state?sid=a`)).json()) as { submissions: number; events: unknown[] };
    const b = (await (await fetch(`${srv.url}/__bench/state?sid=b`)).json()) as { submissions: number };
    expect(a.submissions).toBe(2);
    expect(a.events).toHaveLength(2);
    expect(b.submissions).toBe(1);
  });

  it('resets one session without touching others', async () => {
    await fetch(`${srv.url}/__bench/reset?sid=a`);
    const a = (await (await fetch(`${srv.url}/__bench/state?sid=a`)).json()) as { submissions: number };
    const b = (await (await fetch(`${srv.url}/__bench/state?sid=b`)).json()) as { submissions: number };
    expect(a.submissions).toBe(0);
    expect(b.submissions).toBe(1);
  });

  it('sets a session cookie and logs requests', async () => {
    const before = srv.log.length;
    const r = await fetch(`${srv.url}/toy/`);
    expect(r.headers.get('set-cookie')).toContain('bma_sid=');
    expect(srv.log.length).toBe(before + 1);
    expect(srv.log.at(-1)?.status).toBe(200);
  });

  it('strips the /v2 alias segment and parses mutation settings', () => {
    expect(stripAlias('/toy/v2/page/3')).toBe('/toy/page/3');
    expect(stripAlias('/toy/page')).toBe('/toy/page');
    expect(parseMut('medium')).toEqual({ level: 'medium' });
    expect(parseMut('op:synonyms')).toEqual({ level: 'heavy', only: ['synonyms'] });
    expect(parseMut('evil')).toBeUndefined();
  });
});
