// Prints the raw SQLite rows (workflows + steps) for one golden recording, as
// stored. Used to produce the example in docs/recording-format.md.
//   npx tsx scripts/export-example.ts helpdesk-billing 4
import { loadRecordings } from '../src/bench/recordings.ts';
import { importRecording } from '../src/recorder/golden.ts';
import { Store } from '../src/memory/store.ts';

const [flowId = 'bookshop-rust-paperback', limit = '3'] = process.argv.slice(2);
const rec = loadRecordings().find((r) => r.flowId === flowId);
if (!rec) throw new Error(`no recording ${flowId}`);
const store = Store.open(':memory:');
const wf = importRecording(store, rec);
const wfRow = store.db.prepare('SELECT * FROM workflows WHERE id = ?').get(wf.id);
const stepRows = (store.db.prepare('SELECT * FROM steps WHERE workflow_id = ? ORDER BY idx LIMIT ?').all(wf.id, Number(limit)) as Record<string, unknown>[]).map((r) => ({
  ...r,
  target_json: r.target_json ? JSON.parse(r.target_json as string) : null,
}));
console.log(JSON.stringify({ workflows: wfRow, steps: stepRows }, null, 2));
