// Prices in USD per million tokens. Edit here only; the budget guard and the
// ledger both read this table.
export interface Price {
  inPerMTok: number;
  outPerMTok: number;
}

export const PRICES_CHECKED_ON = '2026-11-18';

export const PRICES: Record<string, Price> = {
  // Assumption to verify against the provider's price list before the first live call.
  'claude-haiku-5-5': { inPerMTok: 1.0, outPerMTok: 5.0 },
};

/** Unknown models are priced at the most expensive entry so the cap errs on the safe side. */
export function priceFor(model: string): Price {
  const known = PRICES[model];
  if (known) return known;
  const all = Object.values(PRICES);
  return { inPerMTok: Math.max(...all.map((p) => p.inPerMTok)), outPerMTok: Math.max(...all.map((p) => p.outPerMTok)) };
}

export function costUsd(model: string, inputTokens: number, outputTokens: number): number {
  const p = priceFor(model);
  return (inputTokens * p.inPerMTok + outputTokens * p.outPerMTok) / 1_000_000;
}
