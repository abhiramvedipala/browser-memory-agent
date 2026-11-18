import { z } from 'zod';
import type { Target } from '../memory/types.ts';
import type { Candidate } from '../replay/candidates.ts';
import { identityText, contextText } from '../replay/candidates.ts';
import type { LlmPick } from '../resolver/chain.ts';
import { DEFAULT_MODEL, type LlmClient } from './client.ts';
import { fallbackIntent } from './intents.ts';
import { textOf, type LlmRequest } from './types.ts';

const Reply = z.object({ choice: z.union([z.number().int().min(1).max(3), z.literal('none')]) });

export function buildTiebreakRequest(target: Target, intent: string, shortlist: Candidate[], model = DEFAULT_MODEL): LlmRequest {
  const lines = shortlist.map((c, i) => `${i + 1}. ${identityText(c)}${contextText(c) ? `. ${contextText(c)}` : ''}`);
  return {
    model,
    max_tokens: 60,
    system:
      'You pick which on-page element a recorded browser step meant. Reply with only JSON {"choice": 1, 2, 3 or "none"}. ' +
      'Answer "none" unless one candidate clearly does the same job as the recorded element; a similar-looking but different action (wishlist vs cart, reset vs apply) is "none".',
    messages: [
      {
        role: 'user',
        content: `Step intent: ${intent}\nRecorded element: ${identityText(target)}. ${contextText(target)}\n\nCandidates:\n${lines.join('\n')}`,
      },
    ],
  };
}

/** The `llm` strategy: only consulted after semantic refused, only over its top 3, and "none" is a valid answer. */
export function makeLlmPick(llm: LlmClient, intentFor: (t: Target) => string = (t) => fallbackIntent({ action: 'click', target: t }), model = DEFAULT_MODEL): LlmPick {
  return async (target, shortlist) => {
    if (shortlist.length === 0) return null;
    const res = await llm.complete('tiebreak', buildTiebreakRequest(target, intentFor(target), shortlist, model));
    const raw = textOf(res);
    try {
      const parsed = Reply.parse(JSON.parse(raw.slice(raw.indexOf('{'), raw.lastIndexOf('}') + 1)));
      if (parsed.choice === 'none') return null;
      return shortlist[parsed.choice - 1]?.idx ?? null;
    } catch {
      return null; // unparseable answer: refuse rather than guess
    }
  };
}
