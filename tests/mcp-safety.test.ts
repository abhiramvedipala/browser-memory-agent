import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { allApps } from '../demo-apps/apps/index.ts';
import { mutate } from '../demo-apps/mutate.ts';
import { startDemoServer, type DemoServer } from '../demo-apps/server.ts';
import { Store } from '../src/memory/store.ts';
import { createMcpServer, SAFETY_NOTE } from '../src/mcp/server.ts';

let srv: DemoServer;
let client: Client;
let store: Store;
let close: () => Promise<void>;
let browserLaunches = 0;

beforeAll(async () => {
  srv = await startDemoServer({ port: 0, apps: allApps, mutator: mutate });
  store = Store.open(':memory:');
  store.createWorkflow({ name: 'w', task: 't', startUrlPattern: 'p', steps: [{ action: 'navigate', valueTemplate: `${srv.url}/recipes/` }] });
  const mcp = createMcpServer({
    store,
    base: srv.url,
    getBrowser: async () => {
      browserLaunches++;
      throw new Error('no browser in this test');
    },
  });
  const [a, b] = InMemoryTransport.createLinkedPair();
  await mcp.server.connect(a);
  client = new Client({ name: 'safety-test', version: '1' });
  await client.connect(b);
  close = mcp.close;
});
afterAll(async () => {
  await client?.close();
  await close?.();
  await srv?.close();
});

const BAD_URLS = ['https://example.com/', 'http://example.com/', 'https://accounts.google.com/login', 'http://127.0.0.1:1/', 'file:///etc/passwd', 'javascript:alert(1)', 'http://127.0.0.1.evil.test/'];

describe('MCP URL validation', () => {
  it.each(BAD_URLS)('record_workflow rejects %s before launching a browser', async (url) => {
    const r = await client.callTool({ name: 'record_workflow', arguments: { start_url: url, name: 'x' } });
    expect(r.isError).toBe(true);
    expect((r.content as { text: string }[])[0]?.text).toContain('only drives the local demo apps');
  });

  it.each(BAD_URLS)('replay_workflow rejects start_url %s before launching a browser', async (url) => {
    const r = await client.callTool({ name: 'replay_workflow', arguments: { name: 'w', start_url: url } });
    expect(r.isError).toBe(true);
    expect((r.content as { text: string }[])[0]?.text).toContain('Blocked URL');
  });

  it('never launched a browser for any rejected call', () => {
    expect(browserLaunches).toBe(0);
    expect(store.listRuns()).toHaveLength(0);
  });

  it('rejects malformed arguments through the zod schemas', async () => {
    const r = await client.callTool({ name: 'approve_submission', arguments: { approval_id: 'one', approve: 'yes' } });
    expect(r.isError).toBe(true);
  });
});

describe('MCP tool descriptions state the boundary', () => {
  it('URL-taking and listing tools carry the safety note', async () => {
    const { tools } = await client.listTools();
    for (const name of ['record_workflow', 'replay_workflow', 'list_workflows']) {
      expect(tools.find((t) => t.name === name)?.description).toContain(SAFETY_NOTE);
    }
    expect(SAFETY_NOTE).toMatch(/local demo apps/);
    expect(SAFETY_NOTE).toMatch(/Logins, passwords, payments and CAPTCHAs are never automated/);
  });
});
