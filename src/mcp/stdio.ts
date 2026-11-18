import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { ensureDemoServer } from '../demo-server-util.ts';
import { importRecording } from '../recorder/golden.ts';
import { loadRecordings } from '../bench/recordings.ts';
import { Store } from '../memory/store.ts';
import { createMcpServer } from './server.ts';

/** `bma mcp`: stdio MCP server. Logs go to stderr because stdout carries the protocol. */
export async function runStdioServer(dbPath: string, opts: { seedGolden?: boolean } = {}): Promise<void> {
  const store = Store.open(dbPath);
  if (opts.seedGolden && store.listWorkflows().length === 0) for (const r of loadRecordings()) importRecording(store, r);
  const { base, server: demo } = await ensureDemoServer();
  const mcp = createMcpServer({ store, base });
  await mcp.server.connect(new StdioServerTransport());
  console.error(`browser-memory-agent MCP server on stdio; demo apps at ${base}; db ${dbPath}`);
  const stop = async () => {
    await mcp.close();
    await demo?.close();
    store.close();
    process.exit(0);
  };
  process.on('SIGINT', () => void stop());
  process.on('SIGTERM', () => void stop());
  process.stdin.on('close', () => void stop());
}
