import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { BrowserContext, ElementHandle, Page } from 'playwright';
import { TargetSchema, type Target } from '../memory/types.ts';

const here = dirname(fileURLToPath(import.meta.url));
export const PAGE_SCRIPT_PATH = join(here, '..', 'page', 'bma-page.js');
export const PAGE_SCRIPT: string = readFileSync(PAGE_SCRIPT_PATH, 'utf8');

/** Make window.__bma available in every page and frame of the context, before page scripts run. */
export async function installPageScript(context: BrowserContext): Promise<void> {
  await context.addInitScript({ content: PAGE_SCRIPT });
}

/** For pages created with setContent in tests (init scripts are context-level). */
export async function ensurePageScript(page: Page): Promise<void> {
  const has = await page.evaluate(() => Boolean((window as unknown as { __bma?: unknown }).__bma));
  if (!has) await page.evaluate(PAGE_SCRIPT);
}

type BmaWindow = { __bma: { describe(el: Element): unknown } };

/** Describe an element handle as a validated Target. */
export async function describeHandle(handle: ElementHandle): Promise<Target> {
  const raw = await handle.evaluate((el) => (window as unknown as BmaWindow).__bma.describe(el as unknown as Element));
  return TargetSchema.parse(raw);
}
