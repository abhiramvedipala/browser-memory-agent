import type { Locator, Page } from 'playwright';
import { z } from 'zod';
import { TargetSchema, type Target } from '../memory/types.ts';
import { ensurePageScript } from '../recorder/page-script.ts';

export const CandidateSchema = TargetSchema.extend({
  idx: z.number().int(),
  disabled: z.boolean(),
  inViewport: z.boolean(),
});
export type Candidate = z.infer<typeof CandidateSchema>;

/** Collect the interactive elements currently on the page (see bma-page.js collect() for the policy). */
export async function collectCandidates(page: Page): Promise<Candidate[]> {
  await ensurePageScript(page);
  const raw = await page.evaluate(() => (window as unknown as { __bma: { collect(): unknown[] } }).__bma.collect());
  return z.array(CandidateSchema).parse(raw);
}

export function candidateLocator(page: Page, c: Pick<Candidate, 'idx'>): Locator {
  return page.locator(`[data-bma-cand="${c.idx}"]`);
}

/**
 * The text that gets embedded, the same for a recorded target and a live candidate so the two are
 * comparable. Order puts the strongest signals first.
 */
export function candidateText(t: Target): string {
  const parts = [`${t.role || t.tag}: ${t.accessibleName}`];
  if (t.label && t.label !== t.accessibleName) parts.push(`label: ${t.label}`);
  if (t.placeholder && t.placeholder !== t.accessibleName) parts.push(`placeholder: ${t.placeholder}`);
  if (t.text && t.text !== t.accessibleName) parts.push(`text: ${t.text}`);
  if (t.nearbyText) parts.push(`context: ${t.nearbyText}`);
  return parts.join('. ');
}
