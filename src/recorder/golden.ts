import type { Browser } from 'playwright';
import { z } from 'zod';
import { runGolden } from '../bench/golden.ts';
import type { Flow } from '../bench/flows.ts';
import { Allowlist } from '../safety/allowlist.ts';
import { newGuardedContext } from '../safety/guard.ts';
import { Store } from '../memory/store.ts';
import { TargetSchema, ACTIONS, type StepInput, type Workflow } from '../memory/types.ts';
import { Recorder } from './recorder.ts';
import { urlPattern } from './url.ts';

/** Origin written into committed recordings; replays rebase onto the real origin. */
export const CANONICAL_ORIGIN = 'http://127.0.0.1:4173';

export const RecordingSchema = z.object({
  schema: z.literal(1),
  flowId: z.string(),
  app: z.string(),
  name: z.string(),
  task: z.string(),
  intent: z.string(),
  startUrlPattern: z.string(),
  params: z.record(z.string(), z.string()),
  steps: z.array(
    z.object({
      action: z.enum(ACTIONS),
      intent: z.string(),
      urlPattern: z.string(),
      valueTemplate: z.string().nullable(),
      target: TargetSchema.nullable(),
    }),
  ),
  /**
   * Scorer-only sidecar: the ground-truth element id for each step (null for navigate).
   * It is never stored in SQLite and never reaches the resolver.
   */
  groundTruth: z.array(z.string().nullable()),
});
export type Recording = z.infer<typeof RecordingSchema>;

function canonicalize(value: string | null, base: string): string | null {
  return value === null ? null : value.split(base).join(CANONICAL_ORIGIN);
}

/** Drive a flow's golden script through the real recorder, in a guarded context. */
export async function recordFlow(browser: Browser, base: string, flow: Flow, port: number): Promise<Recording> {
  const { context, stats } = await newGuardedContext(browser, new Allowlist({ ports: [port] }));
  try {
    await context.addCookies([{ name: 'bma_sid', value: `record-${flow.id}`, url: base }]);
    const rec = await Recorder.attach(context, { params: flow.params });
    const page = await context.newPage();
    await runGolden(page, flow, base);
    const { steps, refusals } = await rec.finish({ strict: true });
    if (stats.blocked.length) throw new Error(`blocked requests while recording ${flow.id}: ${stats.blocked.join(', ')}`);
    if (refusals.length) throw new Error(`refused fields while recording ${flow.id}`);
    if (steps.length !== flow.steps.length + 1) {
      throw new Error(`${flow.id}: expected ${flow.steps.length + 1} recorded steps, got ${steps.length}`);
    }
    return {
      schema: 1,
      flowId: flow.id,
      app: flow.app,
      name: flow.id,
      task: flow.task,
      intent: '',
      startUrlPattern: urlPattern(`${CANONICAL_ORIGIN}${flow.startUrl}`),
      params: flow.params,
      steps: steps.map((s: StepInput) => ({
        action: s.action,
        intent: s.intent ?? '',
        urlPattern: s.urlPattern ?? '',
        valueTemplate: canonicalize(s.valueTemplate ?? null, base),
        target: s.target ? { ...s.target, frameUrl: canonicalize(s.target.frameUrl, base) ?? '' } : null,
      })),
      groundTruth: [null, ...flow.steps.map((g) => g.id)],
    };
  } finally {
    await context.close();
  }
}

/** Save a recording into the store as a new workflow version. The ground-truth sidecar is not stored. */
export function importRecording(store: Store, rec: Recording): Workflow {
  return store.createWorkflow({
    name: rec.name,
    task: rec.task,
    intent: rec.intent,
    startUrlPattern: rec.startUrlPattern,
    params: rec.params,
    steps: rec.steps,
  });
}
