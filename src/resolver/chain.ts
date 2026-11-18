import type { Page } from 'playwright';
import type { Embedder } from '../embeddings/embedder.ts';
import type { Target } from '../memory/types.ts';
import { candidateLocator, collectCandidates, type Candidate } from '../replay/candidates.ts';
import type { ResolverConfig } from './config.ts';
import { resolveCss, resolveRole, resolveSemantic, verifyHit } from './strategies.ts';
import type { Resolution, ScoredCandidate, StrategyName } from './types.ts';

/** Optional last resort: given the top semantic candidates, return the index to use or null for "none". */
export type LlmPick = (target: Target, top: Candidate[], scored: ScoredCandidate[]) => Promise<number | null>;

export interface ResolveDeps {
  embedder: Embedder;
  cfg: ResolverConfig;
  llmPick?: LlmPick;
}

/**
 * One attempt: collect the page's candidates, then try each strategy in order and stop at the first
 * that resolves. In the full chain (semantic present) css and role hits are verified before being
 * trusted; a single-strategy baseline (css-only, role-only) is not, so it behaves as a naive tool would.
 * A step nothing resolves is refused: the best weak match is never used.
 */
export async function resolveOnce(page: Page, target: Target, strategies: StrategyName[], deps: ResolveDeps): Promise<Resolution> {
  const cands = await collectCandidates(page);
  const trace: string[] = [];
  const fullChain = strategies.includes('semantic');
  let top: ScoredCandidate[] = [];
  let score: number | null = null;
  let margin: number | null = null;

  const done = (strategy: StrategyName, cand: Candidate, note: string): Resolution => ({
    ok: true,
    strategy,
    locator: candidateLocator(page, cand),
    candidate: cand,
    score,
    margin,
    top,
    reason: note,
    trace,
  });

  for (const s of strategies) {
    if (s === 'css' || s === 'role') {
      const hit = s === 'css' ? await resolveCss(page, target, cands) : await resolveRole(page, target, cands);
      if ('miss' in hit) {
        trace.push(`${s}: ${hit.miss}`);
        continue;
      }
      if (fullChain && s === 'css' && !(await verifyHit(target, hit.candidate, deps.embedder, deps.cfg))) {
        trace.push(`css: matched ${hit.note} but the element does not look like the recorded one`);
        continue;
      }
      trace.push(`${s}: ${hit.note}`);
      return done(s, hit.candidate, hit.note);
    }
    if (s === 'semantic') {
      const out = await resolveSemantic(target, cands, deps.embedder, deps.cfg);
      top = out.top;
      score = out.score;
      margin = out.margin;
      trace.push(`semantic: ${out.reason}`);
      if (out.accepted && out.best) return done('semantic', out.best, out.reason);
      continue;
    }
    if (s === 'llm') {
      if (!deps.llmPick || top.length === 0) {
        trace.push('llm: not available');
        continue;
      }
      const shortlist = top.slice(0, 3).map((t) => cands.find((c) => c.idx === t.idx)!).filter(Boolean);
      const pick = await deps.llmPick(target, shortlist, top.slice(0, 3));
      if (pick === null || !shortlist.some((c) => c.idx === pick)) {
        trace.push('llm: answered none');
        continue;
      }
      trace.push(`llm: picked candidate ${pick}`);
      return done('llm', shortlist.find((c) => c.idx === pick)!, 'llm tie-break');
    }
  }
  return { ok: false, strategy: 'none', score, margin, top, reason: `refused: ${trace.join('; ')}`, trace };
}
