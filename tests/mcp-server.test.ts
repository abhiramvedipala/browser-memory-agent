import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { allApps } from '../demo-apps/apps/index.ts';
import { mutate } from '../demo-apps/mutate.ts';
import { startDemoServer, type DemoServer } from '../demo-apps/server.ts';
import { Store } from '../src/memory/store.ts';
import { createMcpServer } from '../src/mcp/server.ts';

let srv: DemoServer;
let client: Client;
let close: () => Promise<void>;

beforeAll(async () => {
  srv = await startDemoServer({ port: 0, apps: allApps, mutator: mutate });
  const mcp = createMcpServer({ store: Store.open(':memory:'), base: srv.url });
  const [a, b] = InMemoryTransport.createLinkedPair();
  await mcp.server.connect(a);
  client = new Client({ name: 'test', version: '1' });
  await client.connect(b);
  close = mcp.close;
});
afterAll(async () => {
  await client?.close();
  await close?.();
  await srv?.close();
});

describe('MCP server', () => {
  it('exposes the six tools with input schemas', async () => {
    const { tools } = await client.listTools();
    expect(tools.map((t) => t.name).sort()).toEqual(['approve_submission', 'get_run', 'get_workflow', 'list_workflows', 'record_workflow', 'replay_workflow']);
    expect(tools.find((t) => t.name === 'replay_workflow')?.inputSchema.properties).toHaveProperty('name');
  });

  it('list_workflows works on an empty store', async () => {
    const r = await client.callTool({ name: 'list_workflows', arguments: {} });
    expect(r.structuredContent).toEqual({ workflows: [] });
  });

  it('refuses to build a server for a non-local demo origin', () => {
    expect(() => createMcpServer({ store: Store.open(':memory:'), base: 'https://example.com' })).toThrow(/only drives the local demo apps/);
  });
});
