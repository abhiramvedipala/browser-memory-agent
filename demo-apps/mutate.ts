// Placeholder: the mutation engine lands in phase-1/mutation-engine. Until then
// the only job is to strip the data-mut markers the templates leave behind.
import { walk, type El } from './dom.ts';
import type { Mutator } from './mutate-api.ts';

export const mutate: Mutator = (root: El) => {
  walk(root, (el) => {
    delete el.attrs['data-mut'];
  });
  return root;
};
