import { z } from 'zod';
import type { StepInput } from '../memory/types.ts';
import { DEFAULT_MODEL, type LlmClient } from './client.ts';
import { textOf, type LlmRequest } from './types.ts';

export interface LabelInput {
  task: string;
  steps: StepInput[];
}
export interface Labels {
  intent: string;
  steps: string[];
  source: 'llm' | 'fallback';
}

const ReplySchema = z.object({ intent: z.string().min(1), steps: z.array(z.string().min(1)) });

function describeStep(s: StepInput, i: number): string {
  const t = s.target;
  const what = t ? `${t.role || t.tag} "${t.accessibleName || t.placeholder || t.text}"` : '';
  return `${i + 1}. ${s.action}${what ? ` ${what}` : ''}${s.valueTemplate ? ` value=${s.valueTemplate}` : ''}`;
}

/** Deterministic label used when no LLM label exists, so replay never depends on one. */
export function fallbackIntent(s: StepInput): string {
  const name = s.target ? s.target.accessibleName || s.target.placeholder || s.target.text || s.target.tag : '';
  switch (s.action) {
    case 'navigate':
      return 'open the start page';
    case 'fill':
      return `type ${s.valueTemplate ?? 'text'} into "${name}"`;
    case 'select':
      return `choose ${s.valueTemplate ?? 'an option'} in "${name}"`;
    case 'check':
      return `${s.valueTemplate === 'false' ? 'untick' : 'tick'} "${name}"`;
    case 'press':
      return `press ${s.valueTemplate ?? 'a key'} in "${name}"`;
    case 'submit':
      return `submit the form via "${name}"`;
    case 'wait_for':
      return `wait for "${name}"`;
    default:
      return `click "${name}"`;
  }
}

export function buildLabelRequest(input: LabelInput, model = DEFAULT_MODEL): LlmRequest {
  return {
    model,
    max_tokens: 700,
    system:
      'You label the steps of a recorded web workflow. Reply with only a JSON object {"intent": string, "steps": string[]}. ' +
      '"intent" is one short sentence for the whole workflow. "steps" has exactly one imperative phrase of at most 8 words per input step, in order, with no numbering.',
    messages: [{ role: 'user', content: `Task: ${input.task}\n\nSteps:\n${input.steps.map(describeStep).join('\n')}` }],
  };
}

/** One LLM call per workflow. Throws MissingFixtureError in replay mode when the fixture is absent. */
export async function labelWorkflow(llm: LlmClient, input: LabelInput, model = DEFAULT_MODEL): Promise<Labels> {
  const res = await llm.complete('intent_labels', buildLabelRequest(input, model));
  const fallback: Labels = { intent: input.task, steps: input.steps.map(fallbackIntent), source: 'fallback' };
  const raw = textOf(res).trim();
  const json = raw.slice(raw.indexOf('{'), raw.lastIndexOf('}') + 1);
  try {
    const parsed = ReplySchema.parse(JSON.parse(json));
    if (parsed.steps.length !== input.steps.length) return fallback;
    return { intent: parsed.intent, steps: parsed.steps, source: 'llm' };
  } catch {
    return fallback;
  }
}
