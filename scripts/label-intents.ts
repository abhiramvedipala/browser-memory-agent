// npm run label:intents: one LLM call per recorded workflow writes a one-line
// intent per step into bench/recordings/*.json.
//   LLM_MODE=replay (default): uses committed fixtures; fails if one is missing.
//   LLM_MODE=record: calls the API once per workflow (needs ANTHROPIC_API_KEY), capped at $2 total.
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { RECORDINGS_DIR, loadRecordings } from '../src/bench/recordings.ts';
import { LlmClient, llmMode, makeAnthropicTransport } from '../src/llm/client.ts';
import { labelWorkflow } from '../src/llm/intents.ts';
import { RecordingSchema } from '../src/recorder/golden.ts';

const mode = llmMode();
const llm = new LlmClient({ mode, transport: mode === 'record' ? await makeAnthropicTransport() : undefined });
let done = 0;
for (const rec of loadRecordings()) {
  const labels = await labelWorkflow(llm, { task: rec.task, steps: rec.steps });
  rec.intent = labels.intent;
  rec.steps.forEach((s, i) => {
    s.intent = labels.steps[i] ?? s.intent;
  });
  const file = join(RECORDINGS_DIR, `${rec.flowId}.json`);
  RecordingSchema.parse(JSON.parse(readFileSync(file, 'utf8')));
  writeFileSync(file, `${JSON.stringify(rec, null, 2)}\n`);
  done++;
  console.log(`${rec.flowId}: ${labels.source} labels`);
}
console.log(`labelled ${done} workflows (${mode} mode)`);
llm.budget.printRunning();
