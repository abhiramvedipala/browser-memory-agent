// npm run record:golden: records all 20 flows from their golden scripts (no LLM)
// and writes bench/recordings/<flow id>.json. Intent labels already present in
// an existing file are kept, so re-recording does not discard them.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { chromium } from 'playwright';
import { allApps } from '../demo-apps/apps/index.ts';
import { mutate } from '../demo-apps/mutate.ts';
import { startDemoServer } from '../demo-apps/server.ts';
import { loadFlows } from '../src/bench/flows.ts';
import { RECORDINGS_DIR } from '../src/bench/recordings.ts';
import { RecordingSchema, recordFlow } from '../src/recorder/golden.ts';

const srv = await startDemoServer({ port: 0, apps: allApps, mutator: mutate });
const browser = await chromium.launch();
try {
  mkdirSync(RECORDINGS_DIR, { recursive: true });
  for (const flow of loadFlows()) {
    const rec = await recordFlow(browser, srv.url, flow, srv.port);
    const file = join(RECORDINGS_DIR, `${flow.id}.json`);
    if (existsSync(file)) {
      const old = RecordingSchema.parse(JSON.parse(readFileSync(file, 'utf8')));
      rec.intent = old.intent;
      rec.steps.forEach((s, i) => {
        s.intent = old.steps[i]?.intent ?? '';
      });
    }
    writeFileSync(file, `${JSON.stringify(rec, null, 2)}\n`);
    console.log(`recorded ${flow.id}: ${rec.steps.length} steps`);
  }
} finally {
  await browser.close();
  await srv.close();
}
