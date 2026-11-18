// The agent may only ever talk to the demo web apps this repo ships, served on
// loopback. This module is the single place that decides what "allowed" means;
// the browser route guard and the MCP tools both call it.

export const LOOPBACK_HOSTS = new Set(['127.0.0.1', 'localhost', '[::1]']);

export class BlockedUrlError extends Error {
  constructor(
    public readonly url: string,
    public readonly reason: string,
  ) {
    super(`Blocked URL ${url}: ${reason}. This agent only drives the local demo apps on 127.0.0.1.`);
    this.name = 'BlockedUrlError';
  }
}

export interface AllowlistCheck {
  ok: boolean;
  reason?: string;
}

export interface AllowlistOptions {
  /** Loopback ports that may be contacted. Defaults to DEMO_PORT (4173). */
  ports?: number[];
}

export class Allowlist {
  readonly ports: Set<number>;

  constructor(opts: AllowlistOptions = {}) {
    this.ports = new Set(opts.ports ?? [Number(process.env.DEMO_PORT ?? 4173)]);
  }

  check(raw: string): AllowlistCheck {
    if (raw === 'about:blank') return { ok: true };
    let u: URL;
    try {
      u = new URL(raw);
    } catch {
      return { ok: false, reason: 'not a valid absolute URL' };
    }
    if (u.protocol !== 'http:') return { ok: false, reason: `scheme ${u.protocol} is not allowed (only http on loopback)` };
    if (u.username || u.password) return { ok: false, reason: 'URLs with embedded credentials are not allowed' };
    if (!LOOPBACK_HOSTS.has(u.hostname)) return { ok: false, reason: `host ${u.hostname} is not a loopback address` };
    const port = Number(u.port || 80);
    if (!this.ports.has(port)) return { ok: false, reason: `port ${port} is not the demo server port (${[...this.ports].join(', ')})` };
    return { ok: true };
  }

  isAllowed(raw: string): boolean {
    return this.check(raw).ok;
  }

  /** Throws BlockedUrlError with a clear message when the URL is not allowed. */
  assert(raw: string): void {
    const r = this.check(raw);
    if (!r.ok) throw new BlockedUrlError(raw, r.reason ?? 'not allowed');
  }
}
