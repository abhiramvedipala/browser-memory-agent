// The only module (with the golden runner and the tuning script) allowed to read the hidden
// ground-truth attribute. The resolver, recorder and page scripts never do.
import type { ElementHandle, Locator } from 'playwright';

export const BENCH_ATTR = ['data', 'bench', 'id'].join('-');

export async function benchIdOf(target: ElementHandle | Locator): Promise<string | null> {
  return 'first' in target ? target.first().getAttribute(BENCH_ATTR) : target.getAttribute(BENCH_ATTR);
}

export type StepKindName = 'correct' | 'wrong';

/** Compare what the resolver chose with the recorded ground truth. Decoys never equal a real id. */
export function judge(chosenId: string | null, groundTruth: string | null): StepKindName {
  return chosenId !== null && chosenId === groundTruth ? 'correct' : 'wrong';
}
