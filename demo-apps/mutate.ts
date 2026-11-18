// Seeded DOM mutation engine. Pages are El trees; each operator edits the tree
// in place using its own PRNG stream derived from (seed, page path, operator),
// so the same request always yields the same DOM and operators can be run alone.
//
// Ground truth: operators never touch data-bench-id. Decoys carry their own
// `decoy.*` ids so the scorer can tell when a resolver picked one.
import { cloneEl, findAll, isEl, textOf, walk, type El } from './dom.ts';
import { DECOY_TEXT, LABELS, SYNONYMS, lookup } from './mutate-dict.ts';
import type { MutationLevel, MutationRequest, Mutator } from './mutate-api.ts';
import { makeRng, shortId, type Rng } from './rng.ts';

export interface OperatorCtx {
  rng: Rng;
  seedText: string;
}
export type Operator = (root: El, ctx: OperatorCtx) => number;

const SAFE_WRAP_PARENTS = new Set(['ul', 'ol', 'table', 'tbody', 'thead', 'tr', 'select', 'dl', 'details', 'head', 'html']);
const WRAPPABLE = new Set(['input', 'select', 'textarea', 'button', 'a']);

function parentMap(root: El): Map<El, El> {
  const m = new Map<El, El>();
  walk(root, (el, parent) => {
    if (parent) m.set(el, parent);
  });
  return m;
}

function textOnlyChild(el: El): boolean {
  return el.children.length === 1 && typeof el.children[0] === 'string';
}

// ---- cosmetic operators (light) ------------------------------------------

/** Rename every id and fix the attributes that point at one. */
export const ids: Operator = (root, { seedText }) => {
  const map = new Map<string, string>();
  walk(root, (el) => {
    const id = el.attrs.id;
    if (typeof id === 'string') map.set(id, shortId(`${seedText}:${id}`, 'i'));
  });
  walk(root, (el) => {
    const id = el.attrs.id;
    if (typeof id === 'string') el.attrs.id = map.get(id);
    for (const ref of ['for', 'form', 'aria-labelledby', 'aria-describedby', 'aria-controls', 'list']) {
      const v = el.attrs[ref];
      if (typeof v === 'string') el.attrs[ref] = v.split(/\s+/).map((t) => map.get(t) ?? t).join(' ');
    }
    const href = el.attrs.href;
    if (typeof href === 'string' && href.startsWith('#') && map.has(href.slice(1))) el.attrs.href = `#${map.get(href.slice(1))}`;
  });
  return map.size;
};

export const classes: Operator = (root, { seedText }) => {
  let n = 0;
  walk(root, (el) => {
    const c = el.attrs.class;
    if (typeof c === 'string' && c.trim()) {
      el.attrs.class = c.split(/\s+/).map((t) => shortId(`${seedText}:${t}`, 'c')).join(' ');
      n++;
    }
  });
  return n;
};

/** Wrap interactive elements (and some field blocks) in extra divs. */
export const wrap: Operator = (root, { rng, seedText }) => {
  const parents = parentMap(root);
  const targets = findAll(root, (el) => (WRAPPABLE.has(el.tag) || el.attrs.class === 'field') && !!parents.get(el) && !SAFE_WRAP_PARENTS.has(parents.get(el)!.tag));
  let n = 0;
  for (const el of targets) {
    if (!rng.chance(0.5)) continue;
    const parent = parents.get(el)!;
    const i = parent.children.indexOf(el);
    if (i < 0) continue;
    parent.children[i] = { tag: 'div', attrs: { class: shortId(`${seedText}:w${n}`, 'w') }, children: [el] };
    n++;
  }
  return n;
};

// ---- medium operators ----------------------------------------------------

export const testids: Operator = (root) => {
  let n = 0;
  walk(root, (el) => {
    if ('data-testid' in el.attrs) {
      delete el.attrs['data-testid'];
      n++;
    }
  });
  return n;
};

/** Shuffle the children of containers marked data-mut=reorder. */
export const reorder: Operator = (root, { rng }) => {
  let n = 0;
  for (const el of findAll(root, (e) => e.attrs['data-mut'] === 'reorder')) {
    const kids = el.children.filter(isEl);
    if (kids.length < 2 || kids.length !== el.children.length || !rng.chance(0.85)) continue;
    el.children = rng.shuffle(kids);
    n++;
  }
  return n;
};

/** Replace button/link/summary text with a synonym. */
export const synonyms: Operator = (root, { rng }) => {
  let n = 0;
  for (const el of findAll(root, (e) => ['button', 'a', 'summary'].includes(e.tag))) {
    if (!textOnlyChild(el)) continue;
    const rep = lookup(SYNONYMS, el.children[0] as string);
    if (rep && rng.chance(0.85)) {
      el.children = [rep];
      n++;
    }
  }
  return n;
};

// ---- heavy operators -----------------------------------------------------

/** Rewrite label, legend and placeholder text. */
export const labels: Operator = (root, { rng }) => {
  let n = 0;
  for (const el of findAll(root, (e) => e.tag === 'label' || e.tag === 'legend')) {
    if (!textOnlyChild(el)) continue;
    const rep = lookup(LABELS, el.children[0] as string);
    if (rep && rng.chance(0.85)) {
      el.children = [rep];
      n++;
    }
  }
  for (const el of findAll(root, (e) => typeof e.attrs.placeholder === 'string')) {
    const rep = lookup(LABELS, String(el.attrs.placeholder));
    if (rep && rng.chance(0.85)) {
      el.attrs.placeholder = rep;
      n++;
    }
  }
  return n;
};

function labelTextFor(root: El, input: El): string {
  const id = input.attrs.id;
  const label = typeof id === 'string' ? findAll(root, (e) => e.tag === 'label' && e.attrs.for === id)[0] : undefined;
  return label ? textOf(label).trim() : String(input.attrs.placeholder ?? 'field');
}

/** Insert a harmless look-alike next to primary controls. */
export const decoy: Operator = (root, { rng }) => {
  const parents = parentMap(root);
  let n = 0;
  for (const el of findAll(root, (e) => e.attrs['data-mut'] === 'decoyable')) {
    const parent = parents.get(el);
    if (!parent || !rng.chance(0.7)) continue;
    const copy = cloneEl(el);
    const origId = String(el.attrs['data-bench-id'] ?? 'x');
    copy.attrs['data-bench-id'] = `decoy.${origId}`;
    delete copy.attrs.id;
    delete copy.attrs.name;
    delete copy.attrs['data-testid'];
    delete copy.attrs['data-mut'];
    if (el.tag === 'button') {
      const text = textOf(el);
      copy.attrs.type = 'button';
      copy.children = [lookup(DECOY_TEXT, text) ?? `${text} later`];
    } else {
      const base = labelTextFor(root, el);
      copy.attrs['aria-label'] = `${base} (alternate)`;
      copy.attrs.placeholder = `${base} (alternate)`;
      delete copy.attrs.value;
    }
    const i = parent.children.indexOf(el);
    parent.children.splice(i + 1, 0, copy);
    n++;
  }
  return n;
};

/** Move submit areas out of their usual spot, to the top of the form. */
export const move: Operator = (root, { rng, seedText }) => {
  const parents = parentMap(root);
  let n = 0;
  for (const el of findAll(root, (e) => e.attrs['data-mut'] === 'movable')) {
    const parent = parents.get(el);
    if (!parent || parent.tag !== 'form' || !rng.chance(0.75)) continue;
    parent.children = parent.children.filter((c) => c !== el);
    const toolbar: El = { tag: 'div', attrs: { class: shortId(`${seedText}:tb${n}`, 'tb') }, children: [el] };
    parent.children.unshift(toolbar);
    n++;
  }
  return n;
};

/** Point internal links at an aliased path (`/app/v2/...`); the server strips it. */
export const urlpath: Operator = (root, { rng }) => {
  let n = 0;
  for (const el of findAll(root, (e) => e.tag === 'a')) {
    const href = el.attrs.href;
    if (typeof href !== 'string' || !/^\/[a-z]+\//.test(href) || !rng.chance(0.85)) continue;
    el.attrs.href = href.replace(/^(\/[a-z]+)\//, '$1/v2/');
    n++;
  }
  return n;
};

/** Hide movable control areas for 300-1500 ms after load. */
export const delay: Operator = (root, { rng }) => {
  const late: { key: string; ms: number }[] = [];
  for (const el of findAll(root, (e) => e.attrs['data-mut'] === 'movable' || e.attrs['data-mut'] === 'delayable')) {
    if (!rng.chance(0.4)) continue;
    const key = `d${late.length}`;
    el.attrs['data-late'] = key;
    el.attrs.style = `${String(el.attrs.style ?? '')};display:none`;
    late.push({ key, ms: rng.int(300, 1500) });
  }
  if (late.length) {
    const body = findAll(root, (e) => e.tag === 'body')[0];
    const js = late.map((l) => `setTimeout(function(){var e=document.querySelector('[data-late="${l.key}"]');if(e)e.style.display=''},${l.ms});`).join('');
    body?.children.push({ tag: 'script', attrs: {}, children: [{ raw: js }] });
  }
  return late.length;
};

/** Operator registry, in the order they are applied (ids last so references resolve). */
export const OPERATORS: [string, Operator][] = [
  ['synonyms', synonyms],
  ['labels', labels],
  ['decoy', decoy],
  ['move', move],
  ['reorder', reorder],
  ['wrap', wrap],
  ['delay', delay],
  ['urlpath', urlpath],
  ['testids', testids],
  ['classes', classes],
  ['ids', ids],
];

export const LEVEL_OPS: Record<MutationLevel, string[]> = {
  none: [],
  light: ['ids', 'classes', 'wrap'],
  medium: ['ids', 'classes', 'wrap', 'testids', 'reorder', 'synonyms'],
  heavy: ['ids', 'classes', 'wrap', 'testids', 'reorder', 'synonyms', 'move', 'decoy', 'labels', 'urlpath', 'delay'],
};

export interface MutationReport {
  /** Operator name to number of edits it made. */
  applied: Record<string, number>;
}

export function stripMarkers(root: El): void {
  walk(root, (el) => {
    delete el.attrs['data-mut'];
  });
}

export function mutateWithReport(root: El, req: MutationRequest): MutationReport {
  const active = new Set(req.only && req.only.length ? req.only : LEVEL_OPS[req.level]);
  const applied: Record<string, number> = {};
  for (const [name, op] of OPERATORS) {
    if (!active.has(name)) continue;
    const seedText = `${req.seed}|${req.path}|${name}`;
    applied[name] = op(root, { rng: makeRng(seedText), seedText });
  }
  stripMarkers(root);
  return { applied };
}

export const mutate: Mutator = (root, req) => {
  mutateWithReport(root, req);
  return root;
};
