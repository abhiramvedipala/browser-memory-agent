import type { Page } from 'playwright';
import { interpolate, type Flow, type GoldenStep } from './flows.ts';

/** Locator for the ground-truth element. Only golden scripts and the scorer may use this. */
export function benchLocator(page: Page, id: string) {
  return page.locator(`[data-bench-id="${id}"]`);
}

export async function runGoldenStep(page: Page, step: GoldenStep, params: Record<string, string>): Promise<void> {
  const loc = benchLocator(page, step.id).first();
  const value = step.value === undefined ? undefined : interpolate(step.value, params);
  switch (step.op) {
    case 'click':
      await loc.click();
      break;
    case 'fill':
      await loc.fill(value ?? '');
      break;
    case 'select':
      await loc.selectOption(value ?? '');
      break;
    case 'check':
      await loc.check();
      break;
  }
}

/** Drive a whole flow the way a careful human would, using ground-truth ids. */
export async function runGolden(
  page: Page,
  flow: Flow,
  base: string,
  params: Record<string, string> = flow.params,
  startQuery = '',
): Promise<void> {
  await page.goto(`${base}${flow.startUrl}${startQuery}`);
  for (const step of flow.steps) await runGoldenStep(page, step, params);
  await page.waitForLoadState('load');
}
