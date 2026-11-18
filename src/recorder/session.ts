import type { Browser, Page } from 'playwright';
import { Allowlist } from '../safety/allowlist.ts';
import { newGuardedContext } from '../safety/guard.ts';
import type { Store } from '../memory/store.ts';
import type { Workflow } from '../memory/types.ts';
import { Recorder } from './recorder.ts';
import { urlPattern } from './url.ts';

export interface RecordSessionOptions {
  browser: Browser;
  store: Store;
  url: string;
  name: string;
  task?: string;
  params?: Record<string, string>;
  allowlist?: Allowlist;
  /** Resolves when the person is done (window closed, Enter pressed) or the scripted driver finished. */
  until: (page: Page) => Promise<void>;
  log?: (line: string) => void;
}

export interface RecordSessionResult {
  workflow: Workflow;
  refusals: string[];
  blockedRequests: string[];
}

/** Record one workflow in a guarded context and save it to the store. Refuses non-local URLs before any browser work. */
export async function recordSession(o: RecordSessionOptions): Promise<RecordSessionResult> {
  const allowlist = o.allowlist ?? new Allowlist();
  allowlist.assert(o.url);
  const log = o.log ?? (() => undefined);
  const { context, stats } = await newGuardedContext(o.browser, allowlist);
  try {
    const rec = await Recorder.attach(context, {
      params: o.params,
      allowlist,
      onStep: (s, i) => log(`  step ${i + 1}: ${s.action}${s.target ? ` "${s.target.accessibleName || s.target.text || s.target.tag}"` : ''}${s.valueTemplate ? ` = ${s.valueTemplate}` : ''}`),
      onRefused: (why) => log(`  refused to record: ${why}`),
    });
    const page = await context.newPage();
    await page.goto(o.url);
    await o.until(page);
    const { steps, refusals } = await rec.finish().catch(() => ({ steps: rec.steps, refusals: rec.refusals }));
    if (steps.length === 0) throw new Error('Nothing was recorded: no steps captured.');
    const workflow = o.store.createWorkflow({
      name: o.name,
      task: o.task ?? o.name,
      startUrlPattern: urlPattern(o.url),
      params: o.params ?? {},
      steps,
    });
    return { workflow, refusals, blockedRequests: stats.blocked };
  } finally {
    await context.close().catch(() => undefined);
  }
}
