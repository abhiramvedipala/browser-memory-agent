// npm run tune: tunes the semantic thresholds on seeds 0-2 ONLY (never the benchmark seeds 100+).
// Oracle-driven pass: at every step the recorded ground-truth element is used to act, so the
// page always advances, while the semantic scorer is evaluated on the page as it is. Only "hard"
// steps (where neither an exact role match nor a name-confirmed css hit would resolve the step)
// reach the semantic strategy in the real chain, so only those are used for tuning.
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { chromium } from 'playwright';
import { allApps } from '../demo-apps/apps/index.ts';
import { mutate } from '../demo-apps/mutate.ts';
import { startDemoServer } from '../demo-apps/server.ts';
import { ROOT } from '../src/config.ts';
import { loadFlows } from '../src/bench/flows.ts';
import { benchLocator, runGoldenStep } from '../src/bench/golden.ts';
import { loadRecordings } from '../src/bench/recordings.ts';
import { BENCH_ATTR } from '../src/bench/scorer.ts';
import { range, tune, type TuneRow } from '../src/bench/tuning.ts';
import { Store } from '../src/memory/store.ts';
import { installPageScript } from '../src/recorder/page-script.ts';
import { rebase } from '../src/recorder/url.ts';
import { collectCandidates } from '../src/replay/candidates.ts';
import { makeEmbedder } from '../src/replay/strategies.ts';
import { CONFIG_PATH, loadResolverConfig } from '../src/resolver/config.ts';
import { resolveCss, resolveRole, resolveSemantic } from '../src/resolver/strategies.ts';
import { Allowlist } from '../src/safety/allowlist.ts';
import { newGuardedContext } from '../src/safety/guard.ts';

export const TUNING_SEEDS = [0, 1, 2];
const LEVELS = ['light', 'medium', 'heavy'];

const store = Store.open(':memory:');
const base = loadResolverConfig();
const permissive = { ...base, minScore: 0, minMargin: 0, perEmbedder: {} };
const embedders = { 'minilm-l6-v2-q8': makeEmbedder('minilm', store), 'hash-ngram-v1': makeEmbedder('hash', store) };
const rows: Record<string, TuneRow[]> = { 'minilm-l6-v2-q8': [], 'hash-ngram-v1': [] };
let easy = 0;
let total = 0;

const srv = await startDemoServer({ port: 0, apps: allApps, mutator: mutate });
const browser = await chromium.launch();
const flows = loadFlows();
const t0 = Date.now();
try {
  for (const rec of loadRecordings()) {
    const flow = flows.find((f) => f.id === rec.flowId)!;
    for (const level of LEVELS) {
      for (const seed of TUNING_SEEDS) {
        const { context } = await newGuardedContext(browser, new Allowlist({ ports: [srv.port] }));
        try {
          await context.addCookies([{ name: 'bma_sid', value: `tune-${rec.flowId}-${level}-${seed}`, url: srv.url }]);
          await installPageScript(context);
          const page = await context.newPage();
          for (let i = 0; i < rec.steps.length; i++) {
            const step = rec.steps[i]!;
            if (step.action === 'navigate') {
              await page.goto(`${rebase(step.valueTemplate ?? '', srv.url)}?mut=${level}&seed=${seed}`);
              continue;
            }
            const gt = rec.groundTruth[i]!;
            const g = flow.steps[i - 1]!;
            await benchLocator(page, gt).first().waitFor({ state: 'visible', timeout: 5000 });
            const cands = await collectCandidates(page);
            const target = step.target!;
            total++;
            const role = await resolveRole(page, target, cands);
            const css = await resolveCss(page, target, cands);
            const sameName = 'candidate' in css && css.candidate.accessibleName.toLowerCase() === target.accessibleName.toLowerCase();
            if ('candidate' in role || sameName) {
              easy++;
            } else {
              for (const [name, emb] of Object.entries(embedders)) {
                const out = await resolveSemantic(target, cands, emb, permissive);
                if (!out.best) continue;
                const id = await page.locator(`[data-bma-cand="${out.best.idx}"]`).getAttribute(BENCH_ATTR);
                rows[name]!.push({ score: out.score ?? 0, margin: out.margin ?? 0, correct: id === gt });
              }
            }
            await runGoldenStep(page, g, flow.params);
          }
        } finally {
          await context.close();
        }
      }
    }
    console.log(`tuned on ${rec.flowId} (${Math.round((Date.now() - t0) / 1000)} s)`);
  }
} finally {
  await browser.close();
  await srv.close();
}

const scores = range(0.2, 0.9, 0.01);
const margins = range(0, 0.2, 0.005);
const perEmbedder: Record<string, { minScore: number; minMargin: number }> = {};
const report: Record<string, unknown> = { seeds: TUNING_SEEDS, levels: LEVELS, stepsSeen: total, easyStepsSkipped: easy };
for (const [name, r] of Object.entries(rows)) {
  const best = tune(r, scores, margins);
  perEmbedder[name] = { minScore: best.minScore, minMargin: best.minMargin };
  report[name] = { hardSteps: r.length, top1Correct: r.filter((x) => x.correct).length, chosen: best };
  console.log(name, JSON.stringify(report[name]));
}
const frozen = { ...base, perEmbedder, tuned: true };
writeFileSync(CONFIG_PATH, `${JSON.stringify(frozen, null, 2)}\n`);
writeFileSync(join(ROOT, 'config', 'tuning-report.json'), `${JSON.stringify(report, null, 2)}\n`);
console.log('wrote config/resolver.json and config/tuning-report.json');
