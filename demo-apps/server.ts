import http from 'node:http';
import { randomUUID } from 'node:crypto';
import type { AddressInfo } from 'node:net';
import { serializeDocument } from './dom.ts';
import type { AppRequest, AppResponse, DemoApp, RequestLogEntry, SessionState } from './types.ts';
import type { MutationLevel, Mutator } from './mutate-api.ts';

export const DEFAULT_PORT = Number(process.env.DEMO_PORT ?? 4173);
export const HOST = '127.0.0.1';
const LEVELS = new Set(['none', 'light', 'medium', 'heavy']);

export interface DemoServerOptions {
  port?: number;
  apps?: DemoApp[];
  mutator?: Mutator;
  /** Print one line per request. Off in tests. */
  verbose?: boolean;
}

export interface DemoServer {
  url: string;
  port: number;
  sessions: Map<string, SessionState>;
  log: RequestLogEntry[];
  close(): Promise<void>;
}

function newSession(sid: string): SessionState {
  return { sid, submissions: 0, events: [], draft: {}, createdAt: Date.now() };
}

function parseCookies(header: string | undefined): Record<string, string> {
  const out: Record<string, string> = {};
  for (const part of (header ?? '').split(';')) {
    const i = part.indexOf('=');
    if (i > 0) out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim());
  }
  return out;
}

async function readBody(req: http.IncomingMessage): Promise<string> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const c of req) {
    const b = c as Buffer;
    size += b.length;
    if (size > 64 * 1024) throw new Error('body too large');
    chunks.push(b);
  }
  return Buffer.concat(chunks).toString('utf8');
}

/** The mutation engine may insert a `/v2` segment into link paths; strip it. */
export function stripAlias(path: string): string {
  return path.replace(/\/v2(?=\/|$)/g, '') || '/';
}

/** Parse `?mut=` into a level plus an optional single-operator filter (`op:synonyms`). */
export function parseMut(value: string): { level: MutationLevel; only?: string[] } | undefined {
  if (LEVELS.has(value)) return { level: value as MutationLevel };
  if (value.startsWith('op:') && /^[a-zA-Z]+$/.test(value.slice(3))) return { level: 'heavy', only: [value.slice(3)] };
  return undefined;
}

export async function startDemoServer(opts: DemoServerOptions = {}): Promise<DemoServer> {
  const apps = opts.apps ?? [];
  const sessions = new Map<string, SessionState>();
  const log: RequestLogEntry[] = [];

  const sessionFor = (sid: string): SessionState => {
    let s = sessions.get(sid);
    if (!s) {
      s = newSession(sid);
      sessions.set(sid, s);
    }
    return s;
  };

  const server = http.createServer(async (req, res) => {
    const started = Date.now();
    const url = new URL(req.url ?? '/', `http://${HOST}`);
    const cookies = parseCookies(req.headers.cookie);
    const sid = url.searchParams.get('sid') ?? cookies.bma_sid ?? randomUUID();
    const setCookies: string[] = [];
    if (cookies.bma_sid !== sid) setCookies.push(`bma_sid=${sid}; Path=/; SameSite=Lax`);

    // Mutation settings: query parameters win, then they stick in a cookie.
    const qMut = url.searchParams.get('mut');
    const qSeed = url.searchParams.get('seed');
    let mut = parseMut(cookies.bma_mut ?? 'none') ?? { level: 'none' as MutationLevel };
    let seed = Number(cookies.bma_seed ?? 0);
    if (qMut !== null && parseMut(qMut)) {
      mut = parseMut(qMut)!;
      setCookies.push(`bma_mut=${qMut}; Path=/; SameSite=Lax`);
    }
    if (qSeed !== null && Number.isFinite(Number(qSeed))) {
      seed = Number(qSeed);
      setCookies.push(`bma_seed=${seed}; Path=/; SameSite=Lax`);
    }

    let status = 200;
    const finish = (code: number, body: string, type = 'text/html; charset=utf-8', extra: Record<string, string> = {}) => {
      status = code;
      res.writeHead(code, { 'content-type': type, 'cache-control': 'no-store', ...extra, ...(setCookies.length ? { 'set-cookie': setCookies } : {}) });
      res.end(body);
    };

    try {
      const path = url.pathname;
      if (path === '/__health') return finish(200, 'ok', 'text/plain');
      if (path === '/__bench/state') {
        const s = sessions.get(sid);
        return finish(200, JSON.stringify(s ?? newSession(sid)), 'application/json');
      }
      if (path === '/__bench/reset') {
        if (url.searchParams.get('all') === '1') sessions.clear();
        else sessions.delete(sid);
        return finish(200, JSON.stringify({ ok: true }), 'application/json');
      }
      if (path === '/' || path === '') {
        const items = apps.map((a) => `<li><a href="${a.basePath}/">${a.title}</a></li>`).join('');
        return finish(200, `<!doctype html><title>Demo apps</title><h1>Demo apps</h1><ul>${items}</ul>`);
      }

      const norm = stripAlias(path);
      const app = apps.find((a) => norm === a.basePath || norm.startsWith(`${a.basePath}/`));
      if (!app) return finish(404, 'not found', 'text/plain');
      if (req.method !== 'GET' && req.method !== 'POST') return finish(405, 'method not allowed', 'text/plain');

      const form = new URLSearchParams(req.method === 'POST' ? await readBody(req) : '');
      const areq: AppRequest = {
        method: req.method,
        path: norm.slice(app.basePath.length) || '/',
        query: url.searchParams,
        form,
        session: sessionFor(sid),
      };
      const out: AppResponse | undefined = app.handle(areq);
      if (!out) return finish(404, 'not found', 'text/plain');
      if (out.redirect) return finish(303, '', 'text/plain', { location: out.redirect });
      if (!out.page) return finish(500, 'app returned nothing', 'text/plain');
      const page =
        opts.mutator ? opts.mutator(out.page, { level: mut.level, seed, path: norm, only: mut.only }) : out.page;
      return finish(out.status ?? 200, serializeDocument(page));
    } catch (err) {
      return finish(500, `error: ${(err as Error).message}`, 'text/plain');
    } finally {
      const entry = { ts: started, method: req.method ?? 'GET', url: req.url ?? '/', sid, status };
      log.push(entry);
      if (log.length > 20000) log.splice(0, 10000);
      if (opts.verbose) console.log(`${entry.method} ${entry.url} ${entry.status} ${Date.now() - started}ms`);
    }
  });

  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(opts.port ?? DEFAULT_PORT, HOST, resolve);
  });
  const port = (server.address() as AddressInfo).port;
  return {
    url: `http://${HOST}:${port}`,
    port,
    sessions,
    log,
    close: () =>
      new Promise<void>((resolve) => {
        server.closeAllConnections();
        server.close(() => resolve());
      }),
  };
}
