import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { chromium, type Browser, type Page } from 'playwright';
import { Store } from '../src/memory/store.ts';
import { installPageScript } from '../src/recorder/page-script.ts';
import { BlockedUrlError, Allowlist } from '../src/safety/allowlist.ts';
import {
  CliApprovalProvider,
  DenyAllProvider,
  ManualApprovalProvider,
  benchmarkApproval,
  gateStep,
  needsApproval,
  readFormInfo,
  type ApprovalProvider,
} from '../src/replay/approval.ts';

let browser: Browser;
let page: Page;
let n = 0;
beforeAll(async () => {
  browser = await chromium.launch();
  const ctx = await browser.newContext();
  await installPageScript(ctx);
  page = await ctx.newPage();
});
afterAll(async () => {
  await browser?.close();
});
async function load(body: string) {
  const url = `http://127.0.0.1:1/a${n++}`;
  await page.route(url, (r) => r.fulfill({ contentType: 'text/html', body: `<!doctype html><body>${body}</body>` }));
  await page.goto(url);
}

const FORM = (method: string, btn: string) =>
  `<form method="${method}" action="/x"><label for="n">Full name</label><input id="n" name="n" value="Alex"><label for="p">Secret</label><input id="p" type="password" value="hunter2"><label for="c">Tick</label><input id="c" type="checkbox" checked><button id="b" type="submit">${btn}</button></form>`;

describe('needsApproval', () => {
  const info = (over = {}) => ({ tag: 'button', type: 'submit', name: 'Go', inForm: true, method: 'get', ...over });
  it('always gates submit steps', () => {
    expect(needsApproval('submit', null, null)).toBe(true);
  });
  it('gates Enter in a form field only', () => {
    expect(needsApproval('press', 'Enter', info({ tag: 'input', type: 'text' }))).toBe(true);
    expect(needsApproval('press', 'Tab', info({ tag: 'input', type: 'text' }))).toBe(false);
    expect(needsApproval('press', 'Enter', info({ inForm: false }))).toBe(false);
  });
  it('gates POST submit clicks and submit-named buttons but not a GET search', () => {
    expect(needsApproval('click', null, info({ method: 'post', name: 'Add to cart' }))).toBe(true);
    expect(needsApproval('click', null, info({ method: 'get', name: 'Send ticket' }))).toBe(true);
    expect(needsApproval('click', null, info({ method: 'get', name: 'Search' }))).toBe(false);
    expect(needsApproval('click', null, info({ method: 'post', type: 'button' }))).toBe(false);
    expect(needsApproval('click', null, info({ method: 'post', inForm: false }))).toBe(false);
    expect(needsApproval('fill', null, info({ method: 'post' }))).toBe(false);
  });
});

describe('form facts from a real page', () => {
  it('reads method, type and name', async () => {
    await load(FORM('post', 'Place hold'));
    const h = (await page.$('#b'))!;
    expect(await readFormInfo(h)).toMatchObject({ tag: 'button', type: 'submit', name: 'Place hold', inForm: true, method: 'post' });
  });
});

function setup() {
  const store = Store.open(':memory:');
  const wf = store.createWorkflow({ name: 'w', task: 't', startUrlPattern: 'p', steps: [{ action: 'click' }] });
  const run = store.startRun({ workflowId: wf.id, strategy: 's' });
  return { store, run, runDir: join(mkdtempSync(join(tmpdir(), 'gate-')), run.id) };
}

describe('gateStep', () => {
  it('records the approval with field summary (password hidden) and a screenshot, then applies the decision', async () => {
    await load(FORM('post', 'Place hold'));
    const { store, run, runDir } = setup();
    const seen: string[] = [];
    const provider: ApprovalProvider = {
      name: 'test',
      async decide(req) {
        seen.push(store.getRun(run.id)!.status);
        expect(req.summary.fields).toEqual([
          { label: 'Full name', value: 'Alex' },
          { label: 'Secret', value: '(hidden)' },
          { label: 'Tick', value: 'checked' },
        ]);
        return { decision: 'approved', decidedBy: 'test' };
      },
    };
    const r = await gateStep({ page, store, runId: run.id, stepIdx: 0, action: 'click', handle: (await page.$('#b'))!, provider, runDir });
    expect(r.decision).toBe('approved');
    expect(seen).toEqual(['pending_approval']);
    expect(store.getRun(run.id)!.status).toBe('running');
    const a = store.getApproval(r.approvalId)!;
    expect(a).toMatchObject({ decision: 'approved', decidedBy: 'test' });
    expect(a.screenshotPath).toContain('approval-0.png');
    expect(JSON.stringify(a.summary)).not.toContain('hunter2');
  });

  it('a denying provider leaves the run pending for the caller to stop, and records the denial', async () => {
    await load(FORM('post', 'Place hold'));
    const { store, run, runDir } = setup();
    const r = await gateStep({ page, store, runId: run.id, stepIdx: 1, action: 'click', handle: (await page.$('#b'))!, provider: new DenyAllProvider(), runDir });
    expect(r.decision).toBe('denied');
    expect(store.getApproval(r.approvalId)).toMatchObject({ decision: 'denied', decidedBy: 'deny-all' });
  });

  it('a provider that never answers times out and counts as a decision of timeout', async () => {
    await load(FORM('post', 'Place hold'));
    const { store, run, runDir } = setup();
    const never: ApprovalProvider = { name: 'never', decide: () => new Promise(() => undefined) };
    const r = await gateStep({ page, store, runId: run.id, stepIdx: 2, action: 'click', handle: (await page.$('#b'))!, provider: never, runDir, timeoutMs: 150 });
    expect(r.decision).toBe('timeout');
    expect(store.getApproval(r.approvalId)).toMatchObject({ decision: 'timeout', decidedBy: 'timeout' });
  });

  it('a provider that throws is treated as a denial', async () => {
    await load(FORM('post', 'Place hold'));
    const { store, run, runDir } = setup();
    const bad: ApprovalProvider = { name: 'bad', decide: () => Promise.reject(new Error('boom')) };
    const r = await gateStep({ page, store, runId: run.id, stepIdx: 3, action: 'click', handle: (await page.$('#b'))!, provider: bad, runDir });
    expect(r.decision).toBe('denied');
  });
});

describe('providers', () => {
  const req = { approvalId: 1, runId: 'r', stepIdx: 0, screenshotPath: null, summary: { action: 'click' as const, control: 'Place hold', formMethod: 'post', fields: [{ label: 'Name', value: 'Alex' }], url: 'http://127.0.0.1:4173/x' } };

  it('CLI prompt defaults to No and only y or yes approves', async () => {
    const answers: [string, string][] = [['', 'denied'], ['n', 'denied'], ['maybe', 'denied'], ['y', 'approved'], ['YES', 'approved'], [' y ', 'approved']];
    for (const [a, want] of answers) {
      let prompt = '';
      const p = new CliApprovalProvider(async (q) => {
        prompt = q;
        return a;
      });
      expect((await p.decide(req)).decision).toBe(want);
      expect(prompt).toContain('[y/N]');
      expect(prompt).toContain('Name: Alex');
    }
  });

  it('manual provider waits for resolve() by approval id', async () => {
    const m = new ManualApprovalProvider();
    const pending = m.decide(req);
    expect(m.resolve(99, true)).toBe(false);
    expect(m.resolve(1, false)).toBe(true);
    expect(await pending).toEqual({ decision: 'denied', decidedBy: 'mcp' });
    expect(m.resolve(1, true)).toBe(false);
  });

  it('the benchmark flag only works for the local demo server', async () => {
    const p = benchmarkApproval('http://127.0.0.1:4173/bookshop/', new Allowlist({ ports: [4173] }));
    expect(await p.decide(req)).toEqual({ decision: 'approved', decidedBy: 'benchmark-flag' });
    expect(() => benchmarkApproval('https://example.com/', new Allowlist({ ports: [4173] }))).toThrow(BlockedUrlError);
    expect(() => benchmarkApproval('http://127.0.0.1:9999/', new Allowlist({ ports: [4173] }))).toThrow(BlockedUrlError);
  });
});
