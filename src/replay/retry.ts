import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Page } from 'playwright';
import type { Target } from '../memory/types.ts';
import { resolveOnce, type ResolveDeps } from '../resolver/chain.ts';
import type { Resolution, StrategyName } from '../resolver/types.ts';

export interface RetryResult {
  resolution: Resolution;
  /** Attempts made after the first one. */
  retries: number;
  screenshotPath?: string;
  dumpPath?: string;
}

export interface RetryOptions {
  /** Folder for failure artifacts: runs/<run_id>/. */
  runDir: string;
  stepIdx: number;
  sleep?: (ms: number) => Promise<void>;
}

const realSleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/**
 * Resolve a step, retrying with backoff for elements that appear late (the delay mutation shows
 * controls up to 1.5 s after load). Default schedule: attempts at 0 s, 1 s and 3 s. If every attempt
 * is refused, a full-page screenshot and the scored candidates are written to runDir.
 */
export async function resolveWithRetry(page: Page, target: Target, strategies: StrategyName[], deps: ResolveDeps, o: RetryOptions): Promise<RetryResult> {
  const sleep = o.sleep ?? realSleep;
  const { attempts, delaysMs } = deps.cfg.retry;
  let last: Resolution | undefined;
  for (let a = 0; a < attempts; a++) {
    if (a > 0) {
      await sleep(delaysMs[a - 1] ?? delaysMs.at(-1) ?? 1000);
      await page.waitForLoadState('domcontentloaded').catch(() => undefined);
    }
    last = await resolveOnce(page, target, strategies, deps);
    if (last.ok) return { resolution: last, retries: a };
  }
  const res = last!;
  mkdirSync(o.runDir, { recursive: true });
  const screenshotPath = join(o.runDir, `step-${o.stepIdx}.png`);
  const dumpPath = join(o.runDir, `step-${o.stepIdx}.json`);
  await page.screenshot({ path: screenshotPath, fullPage: true }).catch(() => undefined);
  writeFileSync(
    dumpPath,
    JSON.stringify({ stepIdx: o.stepIdx, url: page.url(), target: { role: target.role, accessibleName: target.accessibleName, label: target.label, nearbyText: target.nearbyText }, reason: res.reason, trace: res.trace, score: res.score, margin: res.margin, topCandidates: res.top }, null, 2),
  );
  return { resolution: res, retries: attempts - 1, screenshotPath, dumpPath };
}
