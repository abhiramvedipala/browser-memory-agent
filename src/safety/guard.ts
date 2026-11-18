import type { Browser, BrowserContext, BrowserContextOptions } from 'playwright';
import type { Allowlist } from './allowlist.ts';

export interface GuardStats {
  allowed: number;
  /** URLs of requests the guard aborted. The benchmark expects this to stay empty. */
  blocked: string[];
}

/** Abort every request whose origin is not the local demo server (fonts, CDNs, analytics included). */
export async function installRouteGuard(context: BrowserContext, allowlist: Allowlist): Promise<GuardStats> {
  const stats: GuardStats = { allowed: 0, blocked: [] };
  await context.route('**/*', async (route) => {
    const url = route.request().url();
    if (allowlist.isAllowed(url)) {
      stats.allowed += 1;
      await route.continue();
    } else {
      stats.blocked.push(url);
      await route.abort('blockedbyclient');
    }
  });
  return stats;
}

/** The only way the agent creates a browser context: guarded, no service workers, no downloads. */
export async function newGuardedContext(
  browser: Browser,
  allowlist: Allowlist,
  options: BrowserContextOptions = {},
): Promise<{ context: BrowserContext; stats: GuardStats }> {
  const context = await browser.newContext({ serviceWorkers: 'block', acceptDownloads: false, ...options });
  const stats = await installRouteGuard(context, allowlist);
  return { context, stats };
}
