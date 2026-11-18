import { readdirSync, readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import type { Store } from '../memory/store.ts';

/** Hard project cap is $2.00; calls that would pass this soft line are refused. */
export const REFUSE_ABOVE_USD = 1.8;
export const HARD_CAP_USD = 2.0;

export class BudgetExceededError extends Error {
  constructor(
    public readonly spent: number,
    public readonly estimate: number,
  ) {
    super(`LLM budget guard: spent $${spent.toFixed(4)} + estimated $${estimate.toFixed(4)} would pass the $${REFUSE_ABOVE_USD.toFixed(2)} limit (hard cap $${HARD_CAP_USD.toFixed(2)}). Call refused.`);
    this.name = 'BudgetExceededError';
  }
}

/** Sum of the cost recorded in every committed fixture: each fixture is one real, paid call. */
export function fixtureSpendUsd(dir: string): number {
  if (!existsSync(dir)) return 0;
  let total = 0;
  for (const f of readdirSync(dir)) {
    if (!f.endsWith('.json')) continue;
    const j = JSON.parse(readFileSync(join(dir, f), 'utf8')) as { response?: { costUsd?: number } };
    total += j.response?.costUsd ?? 0;
  }
  return total;
}

export class Budget {
  constructor(
    private readonly fixtureDir: string,
    private readonly store?: Store,
    private readonly log: (line: string) => void = (l) => console.log(l),
  ) {}

  /** Total spent so far: the larger of the fixture sum and the SQLite ledger, so neither can hide spend. */
  spentUsd(): number {
    return Math.max(fixtureSpendUsd(this.fixtureDir), this.store?.totalLlmCostUsd() ?? 0);
  }

  /** Throws BudgetExceededError if a call costing `estimateUsd` would pass the refuse line. */
  assertCanSpend(estimateUsd: number): void {
    const spent = this.spentUsd();
    if (spent + estimateUsd > REFUSE_ABOVE_USD) throw new BudgetExceededError(spent, estimateUsd);
  }

  printRunning(): void {
    this.log(`LLM spend so far: $${this.spentUsd().toFixed(4)} of $${HARD_CAP_USD.toFixed(2)} cap`);
  }
}
