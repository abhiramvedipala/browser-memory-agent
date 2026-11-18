import { allApps } from '../demo-apps/apps/index.ts';
import { mutate } from '../demo-apps/mutate.ts';
import { DEFAULT_PORT, HOST, startDemoServer, type DemoServer } from '../demo-apps/server.ts';

/** Returns the base URL of a running demo server, starting one in this process if none answers. */
export async function ensureDemoServer(port = DEFAULT_PORT): Promise<{ base: string; server?: DemoServer }> {
  const base = `http://${HOST}:${port}`;
  try {
    const r = await fetch(`${base}/__health`, { signal: AbortSignal.timeout(800) });
    if (r.ok) return { base };
  } catch {
    /* not running: start one */
  }
  const server = await startDemoServer({ port, apps: allApps, mutator: mutate });
  return { base: server.url, server };
}
