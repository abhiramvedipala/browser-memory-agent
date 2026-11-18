import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { z } from 'zod';
import { ROOT } from '../config.ts';

export const ResolverConfigSchema = z.object({
  /** Semantic score (0..1) a best candidate must reach. */
  minScore: z.number(),
  /** Lead the best candidate must have over the runner-up. */
  minMargin: z.number(),
  /** Share of the cosine taken from nearby text; the rest comes from the element's own identity. */
  contextWeight: z.number(),
  weights: z.object({ role: z.number(), name: z.number(), label: z.number(), placeholder: z.number() }),
  /** A css or role hit is only trusted in the full chain if its name matches or cosine reaches this. */
  verifyMin: z.number(),
  retry: z.object({ attempts: z.number().int().min(1), delaysMs: z.array(z.number()) }),
  /** True once thresholds were tuned on seeds 0-2 and frozen. */
  tuned: z.boolean(),
});
export type ResolverConfig = z.infer<typeof ResolverConfigSchema>;

export const CONFIG_PATH = join(ROOT, 'config', 'resolver.json');

export function loadResolverConfig(path = CONFIG_PATH): ResolverConfig {
  return ResolverConfigSchema.parse(JSON.parse(readFileSync(path, 'utf8')));
}
