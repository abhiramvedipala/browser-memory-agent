// npm run mcp:transcript: starts the real stdio server (`bma mcp --seed-golden`) as a child process,
// talks to it with the MCP SDK client exactly as an assistant would, and writes docs/mcp-transcript.md.
// Needs no API key: no tool calls the LLM.
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { ROOT } from '../src/config.ts';

const db = join(mkdtempSync(join(tmpdir(), 'bma-mcp-')), 'session.db');
const transport = new StdioClientTransport({ command: process.execPath, args: [join(ROOT, 'bin', 'bma.js'), 'mcp', '--seed-golden', '--db', db], stderr: 'ignore' });
const client = new Client({ name: 'transcript', version: '1' });
await client.connect(transport);

const out: string[] = ['# MCP session transcript', '', 'Produced by `npm run mcp:transcript` against `bma mcp --seed-golden` over stdio. Long JSON is trimmed with `...`; run ids and paths vary per run.', ''];
const clip = (s: string, n = 1400) => (s.length > n ? `${s.slice(0, n)}\n...` : s);
const scrub = (s: string) => s.split(tmpdir()).join('<tmp>').replace(/"\/[^"]*\/runs\//g, '"runs/');

async function step(title: string, name: string, args: Record<string, unknown>) {
  const r = await client.callTool({ name, arguments: args });
  const text = (r.content as { text: string }[])[0]?.text ?? '';
  out.push(`## ${title}`, '', `Call \`${name}\` with \`${JSON.stringify(args)}\`${r.isError ? ' (error)' : ''}:`, '', '```json', clip(scrub(text)), '```', '');
  return (r.structuredContent ?? {}) as Record<string, unknown>;
}

const tools = await client.listTools();
out.push('## Tools offered', '', ...tools.tools.map((t) => `- \`${t.name}\`: ${t.description}`), '');
await step('List workflows', 'list_workflows', {});
await step('Inspect one workflow', 'get_workflow', { name: 'library-place-hold' });
await step('Replay a search-only flow on a medium-mutated page', 'replay_workflow', { name: 'recipes-vegan-pasta', mutation_level: 'medium', seed: 100 });
const pending = await step('Replay a flow that submits a form: it pauses for approval', 'replay_workflow', { name: 'library-place-hold' });
await step('Deny the submission: nothing reaches the server', 'approve_submission', { approval_id: pending.approval_id, approve: false });
await step('Try a real website: refused', 'replay_workflow', { name: 'recipes-soup', start_url: 'https://example.com' });
await client.close();

writeFileSync(join(ROOT, 'docs', 'mcp-transcript.md'), `${out.join('\n')}\n`);
console.log(`wrote docs/mcp-transcript.md (${out.length} lines)`);
