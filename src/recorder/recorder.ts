import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { BrowserContext, Frame, Page } from 'playwright';
import { Allowlist } from '../safety/allowlist.ts';
import { RefusedFieldError, sensitiveReason } from '../safety/sensitive.ts';
import { TargetSchema, type StepInput, type Target } from '../memory/types.ts';
import { PAGE_SCRIPT } from './page-script.ts';
import { parameterize, recordedUrl, urlPattern } from './url.ts';

const here = dirname(fileURLToPath(import.meta.url));
export const RECORD_SCRIPT: string = readFileSync(join(here, '..', 'page', 'bma-record.js'), 'utf8');

type PageEvent =
  | { kind: 'click'; target: unknown; url: string }
  | { kind: 'fill'; target: unknown; value: string; url: string }
  | { kind: 'select'; target: unknown; value: string; url: string }
  | { kind: 'check'; target: unknown; checked: boolean; url: string }
  | { kind: 'press'; key: string; target: unknown; url: string }
  | { kind: 'submit'; target: unknown; url: string }
  | { kind: 'refused'; why: string; url: string };

export interface RecorderOptions {
  /** Default parameter values: a typed value equal to one becomes {{name}}. */
  params?: Record<string, string>;
  allowlist?: Allowlist;
  /** Called for every recorded step (the CLI prints them as they happen). */
  onStep?: (step: StepInput, index: number) => void;
  /** Called when a sensitive field is refused. */
  onRefused?: (why: string) => void;
}

/** Window in which a navigation is treated as the consequence of the last interaction. */
const NAV_AFTER_INTERACTION_MS = 3000;
/** A form submit event right after a click or Enter on the same page is the same user action. */
const SUBMIT_DEDUPE_MS = 1000;

/**
 * Records what a person (or a golden script) does in a browser context as workflow steps.
 * Attach it before opening any page.
 */
export class Recorder {
  readonly steps: StepInput[] = [];
  readonly refusals: string[] = [];
  private lastInteraction = 0;
  private lastSubmitLike = 0;
  private pages = new Set<Page>();
  private stopped = false;

  private constructor(
    private readonly context: BrowserContext,
    private readonly opts: RecorderOptions,
  ) {}

  static async attach(context: BrowserContext, opts: RecorderOptions = {}): Promise<Recorder> {
    const rec = new Recorder(context, opts);
    await context.exposeBinding('__bmaEvent', (_source, msg: PageEvent) => rec.onEvent(msg));
    await context.addInitScript({ content: PAGE_SCRIPT });
    await context.addInitScript({ content: RECORD_SCRIPT });
    const watch = (page: Page) => {
      rec.pages.add(page);
      page.on('framenavigated', (frame) => rec.onNavigated(page, frame));
    };
    context.pages().forEach(watch);
    context.on('page', watch);
    return rec;
  }

  private push(step: StepInput): void {
    if (this.stopped) return;
    this.steps.push(step);
    this.opts.onStep?.(step, this.steps.length - 1);
  }

  private onNavigated(page: Page, frame: Frame): void {
    if (frame !== page.mainFrame() || this.stopped) return;
    const url = frame.url();
    if (!url || url === 'about:blank') return;
    if (this.opts.allowlist && !this.opts.allowlist.isAllowed(url)) return;
    const first = this.steps.length === 0;
    const caused = Date.now() - this.lastInteraction < NAV_AFTER_INTERACTION_MS;
    if (!first && caused) return;
    const last = this.steps[this.steps.length - 1];
    if (last?.action === 'navigate' && last.valueTemplate === recordedUrl(url)) return;
    this.push({ action: 'navigate', urlPattern: urlPattern(url), valueTemplate: recordedUrl(url), target: null });
  }

  private target(raw: unknown): Target {
    return TargetSchema.parse(raw);
  }

  private interaction(): void {
    this.lastInteraction = Date.now();
  }

  private onEvent(msg: PageEvent): void {
    if (this.stopped) return;
    if (msg.kind === 'refused') {
      this.refusals.push(msg.why);
      this.opts.onRefused?.(msg.why);
      return;
    }
    const url = (() => {
      try {
        return urlPattern(msg.url);
      } catch {
        return '';
      }
    })();
    const params = this.opts.params ?? {};
    let target: Target;
    try {
      target = this.target(msg.target);
    } catch {
      return; // malformed message from the page: drop it
    }
    // Second line of defence on the Node side: never store a sensitive field.
    const why = sensitiveReason({ tag: target.tag, inputType: target.inputType, name: target.attrs.name, label: target.label, autocomplete: target.attrs.autocomplete });
    if (why) {
      this.refusals.push(why);
      this.opts.onRefused?.(why);
      return;
    }
    this.interaction();
    switch (msg.kind) {
      case 'click':
        if (target.inputType === 'submit' || (target.tag === 'button' && (target.attrs.type ?? 'submit') === 'submit')) this.lastSubmitLike = Date.now();
        this.push({ action: 'click', urlPattern: url, target });
        break;
      case 'fill':
        this.push({ action: 'fill', urlPattern: url, valueTemplate: parameterize(msg.value, params), target });
        break;
      case 'select':
        this.push({ action: 'select', urlPattern: url, valueTemplate: parameterize(msg.value, params), target });
        break;
      case 'check':
        this.push({ action: 'check', urlPattern: url, valueTemplate: msg.checked ? 'true' : 'false', target });
        break;
      case 'press':
        this.lastSubmitLike = Date.now();
        this.push({ action: 'press', urlPattern: url, valueTemplate: msg.key, target });
        break;
      case 'submit':
        if (Date.now() - this.lastSubmitLike < SUBMIT_DEDUPE_MS) break;
        this.push({ action: 'submit', urlPattern: url, target });
        break;
    }
  }

  /** Flush debounced fills in every open page, then stop recording. */
  async finish(opts: { strict?: boolean } = {}): Promise<{ steps: StepInput[]; refusals: string[] }> {
    for (const page of this.pages) {
      if (page.isClosed()) continue;
      await page.evaluate(() => (window as unknown as { __bmaFlush?: () => void }).__bmaFlush?.()).catch(() => undefined);
    }
    // give the binding calls a moment to arrive
    await new Promise((r) => setTimeout(r, 50));
    this.stopped = true;
    if (opts.strict && this.refusals.length) throw new RefusedFieldError(this.refusals[0]!);
    return { steps: this.steps, refusals: this.refusals };
  }
}
