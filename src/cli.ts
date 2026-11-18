import { parseArgs } from 'node:util';
import { chromium } from 'playwright';
import { Store } from './memory/store.ts';
import { DEFAULT_DB_PATH, ensureParentDir } from './config.ts';
import { ensureDemoServer } from './demo-server-util.ts';
import { recordSession } from './recorder/session.ts';
import { CliApprovalProvider, benchmarkApproval } from './replay/approval.ts';
import { replayWorkflow } from './replay/engine.ts';
import { Allowlist, BlockedUrlError } from './safety/allowlist.ts';

const USAGE = `bma: browser workflow memory agent (local demo apps only)

  bma record --url <local url> --name <name> [--task "..."] [--param k=v]... [--db file]
  bma list [--db file]
  bma export --name <name> [--db file]
  bma mcp [--db file] [--seed-golden]   stdio MCP server for other assistants
  bma replay --name <name> [--param k=v]... [--strategy semantic-minilm] [--mutation medium] [--seed 100]
             [--approve-all-for-benchmark] [--headed] [--db file]

Only http://127.0.0.1:<DEMO_PORT>/... is accepted. Logins, passwords, payments and CAPTCHAs are never recorded.`;

export function parseParams(list: string[] | undefined): Record<string, string> {
  const out: Record<string, string> = {};
  for (const kv of list ?? []) {
    const i = kv.indexOf('=');
    if (i <= 0) throw new Error(`--param expects name=value, got "${kv}"`);
    out[kv.slice(0, i)] = kv.slice(i + 1);
  }
  return out;
}

function waitForEnterOrClose(page: import('playwright').Page): Promise<void> {
  return new Promise((resolve) => {
    const done = () => resolve();
    page.on('close', done);
    process.stdin.once('data', done);
    console.log('Recording. Use the browser window. Close it or press Enter here to finish.');
  });
}

export async function main(argv: string[]): Promise<number> {
  const [cmd, ...rest] = argv;
  if (!cmd || cmd === 'help' || cmd === '--help') {
    console.log(USAGE);
    return 0;
  }
  const { values } = parseArgs({
    args: rest,
    options: {
      url: { type: 'string' },
      name: { type: 'string' },
      task: { type: 'string' },
      param: { type: 'string', multiple: true },
      db: { type: 'string' },
      headless: { type: 'boolean', default: false },
      headed: { type: 'boolean', default: false },
      strategy: { type: 'string' },
      mutation: { type: 'string' },
      seed: { type: 'string' },
      'approve-all-for-benchmark': { type: 'boolean', default: false },
      'seed-golden': { type: 'boolean', default: false },
    },
    allowPositionals: true,
  });
  const dbPath = ensureParentDir(values.db ?? DEFAULT_DB_PATH);

  if (cmd === 'list') {
    const store = Store.open(dbPath);
    const rows = store.listWorkflows();
    if (!rows.length) console.log('No workflows yet. Record one with: bma record --url http://127.0.0.1:4173/bookshop/ --name my-flow');
    for (const w of rows) console.log(`${w.name}  v${w.version}  ${w.stepCount} steps  ${w.task}`);
    store.close();
    return 0;
  }

  if (cmd === 'export') {
    if (!values.name) {
      console.error('bma export needs --name\n\n' + USAGE);
      return 2;
    }
    const store = Store.open(dbPath);
    const wf = store.getWorkflowByName(values.name);
    store.close();
    if (!wf) {
      console.error(`No workflow named "${values.name}"`);
      return 1;
    }
    console.log(JSON.stringify(wf, null, 2));
    return 0;
  }

  if (cmd === 'mcp') {
    const { runStdioServer } = await import('./mcp/stdio.ts');
    await runStdioServer(dbPath, { seedGolden: values['seed-golden'] });
    return new Promise<number>(() => undefined); // runs until stdin closes
  }

  if (cmd === 'replay') {
    if (!values.name) {
      console.error('bma replay needs --name\n\n' + USAGE);
      return 2;
    }
    const store = Store.open(dbPath);
    const wf = store.getWorkflowByName(values.name);
    if (!wf) {
      console.error(`No workflow named "${values.name}". Run: bma list`);
      store.close();
      return 1;
    }
    const { server, base } = await ensureDemoServer();
    const browser = await chromium.launch({ headless: !values.headed });
    try {
      const approval = values['approve-all-for-benchmark'] ? benchmarkApproval(base) : new CliApprovalProvider();
      const res = await replayWorkflow(wf, {
        store,
        browser,
        base,
        strategy: values.strategy,
        mutationLevel: values.mutation,
        seed: values.seed ? Number(values.seed) : undefined,
        params: parseParams(values.param),
        approval,
        log: console.log,
      });
      console.log(`${res.status}: run ${res.runId} in ${res.durationMs} ms`);
      return res.status === 'success' ? 0 : 1;
    } catch (e) {
      console.error((e as Error).message);
      return e instanceof BlockedUrlError ? 3 : 1;
    } finally {
      await browser.close();
      await server?.close();
      store.close();
    }
  }

  if (cmd === 'record') {
    if (!values.url || !values.name) {
      console.error('bma record needs --url and --name\n\n' + USAGE);
      return 2;
    }
    try {
      new Allowlist().assert(values.url); // refuse before any browser or server work
    } catch (e) {
      if (e instanceof BlockedUrlError) {
        console.error(e.message);
        return 3;
      }
      throw e;
    }
    const { server } = await ensureDemoServer();
    const browser = await chromium.launch({ headless: values.headless ?? false });
    const store = Store.open(dbPath);
    try {
      const res = await recordSession({
        browser,
        store,
        url: values.url,
        name: values.name,
        task: values.task,
        params: parseParams(values.param),
        until: waitForEnterOrClose,
        log: console.log,
      });
      console.log(`Saved workflow "${res.workflow.name}" v${res.workflow.version} with ${res.workflow.steps.length} steps to ${dbPath}`);
      if (res.refusals.length) console.log(`Refused ${res.refusals.length} sensitive field(s); nothing from them was stored.`);
      return 0;
    } finally {
      await browser.close();
      await server?.close();
      store.close();
    }
  }

  console.error(`Unknown command "${cmd}"\n\n${USAGE}`);
  return 2;
}
