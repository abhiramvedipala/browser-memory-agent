import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { Budget } from '../src/llm/budget.ts';
import { LlmClient, MissingFixtureError } from '../src/llm/client.ts';
import { buildTiebreakRequest, makeLlmPick } from '../src/llm/tiebreak.ts';
import type { Transport } from '../src/llm/types.ts';
import type { Candidate } from '../src/replay/candidates.ts';
import { STRATEGIES } from '../src/replay/strategies.ts';

const cand = (idx: number, name: string): Candidate => ({ idx, disabled: false, inViewport: true, role: 'button', accessibleName: name, label: '', placeholder: '', text: name, nearbyText: 'Book page', tag: 'button', inputType: '', attrs: {}, cssCandidates: [], bbox: null, frameUrl: '' });
const target = cand(-1, 'Add to cart');
const shortlist = [cand(4, 'Add to wishlist'), cand(7, 'Add to basket'), cand(9, 'Reset')];

function client(reply: string) {
  const dir = mkdtempSync(join(tmpdir(), 'tb-'));
  const transport: Transport = vi.fn(async () => ({ content: [{ type: 'text' as const, text: reply }], stopReason: 'end_turn', inputTokens: 200, outputTokens: 8 }));
  return { llm: new LlmClient({ mode: 'record', fixtureDir: dir, transport, budget: new Budget(dir, undefined, () => undefined) }), transport, dir };
}

describe('llm tie-break', () => {
  it('maps a 1-based choice to the candidate index', async () => {
    const { llm } = client('{"choice": 2}');
    expect(await makeLlmPick(llm)(target, shortlist, [])).toBe(7);
  });

  it('returns null for "none", for out-of-range and for unparseable answers', async () => {
    for (const r of ['{"choice": "none"}', '{"choice": 3}x', 'I think the second', '{"choice": 5}']) {
      const { llm } = client(r);
      const got = await makeLlmPick(llm)(target, shortlist, []);
      if (r.startsWith('{"choice": 3}')) expect(got).toBe(9);
      else expect(got).toBeNull();
    }
  });

  it('does not call the model with an empty shortlist', async () => {
    const { llm, transport } = client('{"choice": 1}');
    expect(await makeLlmPick(llm)(target, [], [])).toBeNull();
    expect(transport).not.toHaveBeenCalled();
  });

  it('builds a small, deterministic request listing at most the 3 candidates', () => {
    const a = buildTiebreakRequest(target, 'add the book to the cart', shortlist);
    expect(a).toEqual(buildTiebreakRequest(target, 'add the book to the cart', shortlist));
    expect(a.max_tokens).toBeLessThanOrEqual(60);
    expect(String(a.messages[0]?.content)).toContain('3. button: Reset');
  });

  it('in replay mode a missing fixture is an error, never a network call', async () => {
    const llm = new LlmClient({ mode: 'replay', fixtureDir: mkdtempSync(join(tmpdir(), 'tb-')) });
    await expect(makeLlmPick(llm)(target, shortlist, [])).rejects.toThrow(MissingFixtureError);
  });

  it('is off by default: only the +llm strategy includes it', () => {
    const withLlm = Object.entries(STRATEGIES).filter(([, d]) => d.chain.includes('llm')).map(([n]) => n);
    expect(withLlm).toEqual(['semantic-minilm+llm']);
  });
});
