import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { chromium, type Browser } from 'playwright';
import { allApps } from '../demo-apps/apps/index.ts';
import { mutate } from '../demo-apps/mutate.ts';
import { startDemoServer, type DemoServer } from '../demo-apps/server.ts';
import { loadFlows } from '../src/bench/flows.ts';
import { loadRecordings } from '../src/bench/recordings.ts';
import { Store } from '../src/memory/store.ts';
import { importRecording, recordFlow, type Recording } from '../src/recorder/golden.ts';

let browser: Browser;
let srv: DemoServer;
const flows = loadFlows();
const committed = loadRecordings();

beforeAll(async () => {
  browser = await chromium.launch();
  srv = await startDemoServer({ port: 0, apps: allApps, mutator: mutate });
});
afterAll(async () => {
  await browser?.close();
  await srv?.close();
});

/** Layout boxes depend on fonts and OS, and intents are written by the labelling pass; neither is part of the diff. */
function comparable(r: Recording): unknown {
  return {
    ...r,
    intent: '',
    steps: r.steps.map((s) => ({ ...s, intent: '', target: s.target ? { ...s.target, bbox: null } : null })),
  };
}

describe('committed golden recordings', () => {
  it('has one recording per flow with matching ground-truth sidecars', () => {
    expect(committed.map((r) => r.flowId).sort()).toEqual(flows.map((f) => f.id).sort());
    for (const r of committed) {
      const flow = flows.find((f) => f.id === r.flowId)!;
      expect(r.steps).toHaveLength(flow.steps.length + 1);
      expect(r.groundTruth).toEqual([null, ...flow.steps.map((s) => s.id)]);
    }
  });

  it('keeps ground truth out of the steps the resolver sees', () => {
    for (const r of committed) {
      const text = JSON.stringify(r.steps);
      expect(text).not.toContain('bench');
      for (const gt of r.groundTruth) if (gt) expect(text).not.toContain(`"${gt}"`);
    }
  });

  it('imports into SQLite as a replayable workflow without the sidecar', () => {
    const store = Store.open(':memory:');
    const wf = importRecording(store, committed[0]!);
    expect(wf.steps).toHaveLength(committed[0]!.steps.length);
    expect(wf.steps[0]?.action).toBe('navigate');
    expect(JSON.stringify(wf)).not.toContain('groundTruth');
  });

  it('re-recording all 20 flows reproduces the committed files exactly (ignoring bbox and intent)', async () => {
    for (const flow of flows) {
      const again = await recordFlow(browser, srv.url, flow, srv.port);
      const old = committed.find((r) => r.flowId === flow.id)!;
      expect(comparable(again), flow.id).toEqual(comparable(old));
    }
  }, 120_000);
});
