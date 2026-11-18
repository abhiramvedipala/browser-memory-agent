// A tiny DOM tree used by the demo apps. Pages are built as trees (not strings)
// so the mutation engine can transform them exactly, then serialized once.

export type AttrValue = string | number | boolean | undefined | null;
export type Attrs = Record<string, AttrValue>;

export interface El {
  tag: string;
  attrs: Attrs;
  children: Child[];
}
export interface Raw {
  raw: string;
}
export type Child = El | Raw | string;

export function isEl(c: Child): c is El {
  return typeof c === 'object' && 'tag' in c;
}
export function isRaw(c: Child): c is Raw {
  return typeof c === 'object' && 'raw' in c;
}

type Kid = Child | false | null | undefined | Kid[];

function flatten(kids: Kid[], out: Child[] = []): Child[] {
  for (const k of kids) {
    if (k === false || k === null || k === undefined) continue;
    if (Array.isArray(k)) flatten(k, out);
    else out.push(k);
  }
  return out;
}

/** Build an element: h('button', { type: 'submit' }, 'Search'). */
export function h(tag: string, attrs: Attrs = {}, ...kids: Kid[]): El {
  return { tag, attrs: { ...attrs }, children: flatten(kids) };
}

export function raw(html: string): Raw {
  return { raw: html };
}

const VOID = new Set(['area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link', 'meta', 'source', 'wbr']);

export function escapeText(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
export function escapeAttr(s: string): string {
  return escapeText(s).replace(/"/g, '&quot;');
}

export function serialize(node: Child): string {
  if (typeof node === 'string') return escapeText(node);
  if (isRaw(node)) return node.raw;
  let out = `<${node.tag}`;
  for (const [k, v] of Object.entries(node.attrs)) {
    if (v === undefined || v === null || v === false) continue;
    out += v === true ? ` ${k}` : ` ${k}="${escapeAttr(String(v))}"`;
  }
  out += '>';
  if (VOID.has(node.tag)) return out;
  for (const c of node.children) out += serialize(c);
  return `${out}</${node.tag}>`;
}

export function serializeDocument(root: El): string {
  return `<!doctype html>\n${serialize(root)}`;
}

/** Depth-first walk (pre-order). Callbacks may read but must not restructure. */
export function walk(root: El, fn: (el: El, parent: El | null, index: number) => void, parent: El | null = null, index = 0): void {
  fn(root, parent, index);
  for (let i = 0; i < root.children.length; i++) {
    const c = root.children[i];
    if (c !== undefined && isEl(c)) walk(c, fn, root, i);
  }
}

export function findAll(root: El, pred: (el: El) => boolean): El[] {
  const out: El[] = [];
  walk(root, (el) => {
    if (pred(el)) out.push(el);
  });
  return out;
}

export function textOf(node: Child): string {
  if (typeof node === 'string') return node;
  if (isRaw(node)) return '';
  return node.children.map(textOf).join('');
}

export function cloneEl(el: El): El {
  return {
    tag: el.tag,
    attrs: { ...el.attrs },
    children: el.children.map((c) => (isEl(c) ? cloneEl(c) : c)),
  };
}

/** Tags the benchmark treats as interactive for ground-truth labelling. */
export const INTERACTIVE_TAGS = new Set(['a', 'button', 'input', 'select', 'textarea', 'summary']);
