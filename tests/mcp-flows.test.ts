import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { allApps } from '../demo-apps/apps/index.ts';
import { mutate } from '../demo-apps/mutate.ts';
import { startDemoServer, type DemoServer } from '../demo-apps/server.ts';
import { loadRecordings } from '../src/bench/recordings.ts';
import { Store } from '../src/memory/store.ts';
import { createMcpServer } from '../src/mcp/server.ts';
import { importRecording } from '../src/recorder/golden.ts';

let srv: DemoServer;
let client: Client;
let store: Store;
let close: () => Promise<void>;

beforeAll(async () => {
  srv = await startDemoServer({ port: 0, apps: allApps, mutator: mutate });
  store = Store.open(':memory:');
  for (const r of loadRecordings()) importRecording(store, r);
  const mcp = createMcpServer({ store, base: srv.url, waitMs: 60_000 });
  const [a, b] = InMemoryTransport.createLinkedPair();
  await mcp.server.connect(a);
  client = new Client({ name: 'flow-test', version: '1' });
  await client.connect(b);
  close = mcp.close;
});
afterAll(async () => {
  await client?.close();
  await close?.();
  await srv?.close();
});

type R = Record<string, unknown>;
async function call(name: string, args: R) {
  const r = await client.callTool({ name, arguments: args });
  return { data: r.structuredContent as R, isError: r.isError === true, text: (r.content as { text: string }[])[0]?.text ?? '' };
}
const submissions = () => [...srv.sessions.values()].reduce((n, s) => n + s.submissions, 0);

describe('MCP flows against the demo apps', () => {
  it('lists the 20 golden workflows and returns one with its steps', async () => {
    expect(((await call('list_workflows', {})).data.workflows as unknown[]).length).toBe(20);
    const wf = await call('get_workflow', { name: 'recipes-soup' });
    expect((wf.data.steps as R[]).map((s) => s.action)).toEqual(['navigate', 'fill', 'click', 'click']);
  });

  it('replays a flow with no submissions straight to success and get_run reports its steps', async () => {
    const r = await call('replay_workflow', { name: 'recipes-soup', strategy: 'semantic-hash' });
    expect(r.data.status).toBe('success');
    expect(((await call('get_run', { run_id: r.data.run_id as string })).data.steps as unknown[]).length).toBe(4);
  });

  it('pauses at a submission with the field summary and screenshot; denying submits nothing', async () => {
    const before = submissions();
    const r = await call('replay_workflow', { name: 'library-place-hold', strategy: 'semantic-hash' });
    expect(r.data.status).toBe('pending_approval');
    expect(r.data.control).toBe('Place hold');
    expect((r.data.fields as R[]).some((f) => f.label === 'Full name' && f.value === 'Alex Demo')).toBe(true);
    expect(String(r.data.screenshot_path)).toContain('approval-');
    const d = await call('approve_submission', { approval_id: r.data.approval_id as number, approve: false });
    expect(d.data.status).toBe('denied');
    expect(submissions()).toBe(before);
  });

  it('approving each gate completes the ticket flow with exactly one server submission', async () => {
    const before = submissions();
    let r = await call('replay_workflow', { name: 'helpdesk-account', strategy: 'semantic-hash' });
    let gates = 0;
    while (r.data.status === 'pending_approval') {
      gates++;
      r = await call('approve_submission', { approval_id: r.data.approval_id as number, approve: true });
    }
    expect(r.data.status).toBe('success');
    expect(gates).toBeGreaterThanOrEqual(3);
    expect((r.data.approvals as R[]).every((a) => a.decision === 'approved' && a.decided_by === 'mcp')).toBe(true);
    expect(submissions()).toBe(before + 1);
  });

  it('rejects an external URL and unknown names or approvals with clear errors', async () => {
    const ext = await call('replay_workflow', { name: 'recipes-soup', start_url: 'https://example.com' });
    expect(ext.isError).toBe(true);
    expect(ext.text).toContain('only drives the local demo apps');
    expect((await call('get_workflow', { name: 'nope' })).isError).toBe(true);
    expect((await call('replay_workflow', { name: 'nope' })).isError).toBe(true);
    expect((await call('approve_submission', { approval_id: 9999, approve: true })).isError).toBe(true);
    expect((await call('get_run', { run_id: 'nope' })).data.status).toBe('unknown_run');
  });
});
