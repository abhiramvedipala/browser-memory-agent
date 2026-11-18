import type { Page } from 'playwright';
import { cosine, type Embedder } from '../embeddings/embedder.ts';
import type { Target } from '../memory/types.ts';
import { candidateLocator, contextText, identityText, type Candidate } from '../replay/candidates.ts';
import type { ResolverConfig } from './config.ts';
import type { ScoredCandidate } from './types.ts';

const sameName = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();

export interface Hit {
  candidate: Candidate;
  note: string;
}

/** css: a recorded selector that matches exactly one element, and that element has the recorded role. */
export async function resolveCss(page: Page, target: Target, cands: Candidate[]): Promise<Hit | { miss: string }> {
  for (const css of target.cssCandidates) {
    let count: number;
    let idxAttr: string | null = null;
    try {
      const loc = page.locator(css);
      count = await loc.count();
      if (count === 1) idxAttr = await loc.getAttribute('data-bma-cand');
    } catch {
      continue; // selector no longer valid on this page
    }
    if (count !== 1) continue;
    const cand = cands.find((c) => String(c.idx) === idxAttr);
    if (!cand || cand.disabled) continue;
    if (cand.role !== target.role) continue;
    return { candidate: cand, note: css };
  }
  return { miss: 'no recorded selector matched exactly one element with the right role' };
}

/** role: Playwright getByRole(role, {name, exact}) with exactly one match. <summary> has no Playwright role, so it is matched by tag. */
export async function resolveRole(page: Page, target: Target, cands: Candidate[]): Promise<Hit | { miss: string }> {
  if (!target.role || !target.accessibleName) return { miss: 'target has no role or accessible name' };
  if (target.tag === 'summary') {
    const m = cands.filter((c) => c.tag === 'summary' && !c.disabled && c.accessibleName === target.accessibleName);
    return m.length === 1 ? { candidate: m[0]!, note: 'summary by exact name' } : { miss: `${m.length} summaries with that name` };
  }
  const loc = page.getByRole(target.role as Parameters<Page['getByRole']>[0], { name: target.accessibleName, exact: true });
  const n = await loc.count();
  if (n !== 1) return { miss: `${n} elements match role+name` };
  const idxAttr = await loc.getAttribute('data-bma-cand');
  const cand = cands.find((c) => String(c.idx) === idxAttr);
  if (!cand || cand.disabled) return { miss: 'match is not an enabled visible candidate' };
  return { candidate: cand, note: `${target.role} "${target.accessibleName}"` };
}

/** Is a css/role hit still believable? Same name, same label, or close enough in embedding space. */
export async function verifyHit(target: Target, cand: Candidate, embedder: Embedder, cfg: ResolverConfig): Promise<boolean> {
  if (target.accessibleName && sameName(target.accessibleName, cand.accessibleName)) return true;
  if (target.label && sameName(target.label, cand.label)) return true;
  const [a, b] = await embedder.embed([identityText(target), identityText(cand)]);
  return cosine(a!, b!) >= cfg.verifyMin;
}

export interface SemanticOutcome {
  top: ScoredCandidate[];
  best?: Candidate;
  score: number | null;
  margin: number | null;
  accepted: boolean;
  reason: string;
}

/**
 * semantic: cosine similarity of the recorded description to each enabled candidate, plus bonuses for
 * matching role, exact accessible name, exact label and exact placeholder, normalised to 0..1.
 * Accepted only if the best score reaches minScore AND leads the runner-up by minMargin.
 */
export async function resolveSemantic(target: Target, cands: Candidate[], embedder: Embedder, cfg: ResolverConfig): Promise<SemanticOutcome> {
  const live = cands.filter((c) => !c.disabled);
  if (live.length === 0) return { top: [], score: null, margin: null, accepted: false, reason: 'no enabled candidates on the page' };
  const n = live.length;
  const vecs = await embedder.embed([identityText(target), contextText(target), ...live.map(identityText), ...live.map(contextText)]);
  const [tId, tCtx] = [vecs[0]!, vecs[1]!];
  const cw = cfg.contextWeight;
  const hasCtx = contextText(target) !== '';
  const w = cfg.weights;
  const denom = 1 + w.role + w.name + w.label + w.placeholder;
  const scored = live.map((c, i) => {
    const idCos = Math.max(0, cosine(tId, vecs[2 + i]!));
    const ctxCos = hasCtx ? Math.max(0, cosine(tCtx, vecs[2 + n + i]!)) : idCos;
    const cos = (1 - cw) * idCos + cw * ctxCos;
    const raw =
      cos +
      (c.role === target.role ? w.role : 0) +
      (target.accessibleName && sameName(target.accessibleName, c.accessibleName) ? w.name : 0) +
      (target.label && sameName(target.label, c.label) ? w.label : 0) +
      (target.placeholder && sameName(target.placeholder, c.placeholder) ? w.placeholder : 0);
    return { c, cos, score: raw / denom };
  });
  scored.sort((a, b) => b.score - a.score || a.c.idx - b.c.idx);
  const top: ScoredCandidate[] = scored.slice(0, 5).map((s) => ({ idx: s.c.idx, role: s.c.role, name: s.c.accessibleName, score: round(s.score), cosine: round(s.cos) }));
  const best = scored[0]!;
  const margin = best.score - (scored[1]?.score ?? 0);
  if (best.score < cfg.minScore) return { top, score: best.score, margin, accepted: false, reason: `best score ${best.score.toFixed(3)} below ${cfg.minScore}` };
  if (margin < cfg.minMargin) return { top, score: best.score, margin, accepted: false, reason: `margin ${margin.toFixed(3)} over runner-up below ${cfg.minMargin}` };
  return { top, best: best.c, score: best.score, margin, accepted: true, reason: 'accepted' };
}

const round = (x: number) => Math.round(x * 1000) / 1000;

export { candidateLocator };
