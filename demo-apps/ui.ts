// Shared building blocks for the demo apps. Every interactive element gets a
// data-bench-id (ground truth for the scorer; the resolver never reads it) and
// optional data-mut markers that tell the mutation engine where it may act.
import { h, type Attrs, type Child, type El } from './dom.ts';

export const CSS = `
body{font:15px/1.45 system-ui,sans-serif;margin:0;color:#1d2330;background:#fafafa}
header,footer{background:#1d2330;color:#fff;padding:.6rem 1rem}
header a,footer a{color:#cfe3ff;margin-right:1rem}
main{max-width:60rem;margin:1rem auto;padding:0 1rem;display:block}
.layout{display:flex;gap:1.5rem}.side{width:14rem}.content{flex:1}
.field{margin:.5rem 0}.field label{display:block;font-weight:600}
input,select,textarea,button{font:inherit;padding:.3rem .5rem}
button{cursor:pointer}ul.list{list-style:none;padding:0}ul.list li{border:1px solid #ddd;padding:.6rem;margin:.4rem 0;background:#fff}
.notice{background:#e6f6e6;border:1px solid #9c9;padding:.4rem}.tabs a{margin-right:.8rem}
details{margin:.2rem 0 .2rem .6rem}summary{cursor:pointer}
`;

export interface ShellOpts {
  title: string;
  base: string;
  navLinks: { id: string; href: string; text: string }[];
  main: Child[];
  /** Optional sidebar (docs). */
  side?: Child[];
}

export function shell(o: ShellOpts): El {
  const nav = h(
    'nav',
    { 'aria-label': 'Main', id: 'main-nav' },
    h(
      'ul',
      { class: 'navlist', 'data-mut': 'reorder', style: 'list-style:none;margin:0;padding:0;display:flex' },
      o.navLinks.map((l) => h('li', {}, link(l.id, `${o.base}${l.href}`, l.text, { class: 'nav-link' }))),
    ),
  );
  const content = o.side
    ? h('div', { class: 'layout' }, h('aside', { class: 'side', 'aria-label': 'Sidebar' }, o.side), h('div', { class: 'content' }, o.main))
    : h('div', { class: 'content' }, o.main);
  return h(
    'html',
    { lang: 'en' },
    h('head', {}, h('meta', { charset: 'utf-8' }), h('title', {}, o.title), h('style', {}, CSS)),
    h(
      'body',
      {},
      h('header', { id: 'site-header' }, nav),
      h('main', { id: 'content' }, content),
      h('footer', { id: 'site-footer' }, h('span', {}, `${o.title} demo app. Fictional data, runs on localhost only.`)),
    ),
  );
}

export function link(id: string, href: string, text: string, extra: Attrs = {}): El {
  return h('a', { href, 'data-bench-id': id, ...extra }, text);
}

export function slug(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

export function button(id: string, text: string, extra: Attrs = {}): El {
  return h('button', { type: 'submit', 'data-bench-id': id, 'data-testid': `${slug(text)}-btn`, 'data-mut': 'decoyable', ...extra }, text);
}

export function textField(id: string, name: string, label: string, opts: { value?: string; placeholder?: string; type?: string; delay?: boolean } = {}): El {
  return h(
    'div',
    { class: 'field', 'data-mut': opts.delay ? 'delayable' : undefined },
    h('label', { for: `f-${name}` }, label),
    h('input', {
      type: opts.type ?? 'text',
      id: `f-${name}`,
      name,
      value: opts.value,
      placeholder: opts.placeholder,
      'data-testid': `${name}-input`,
      'data-bench-id': id,
      'data-mut': 'decoyable',
    }),
  );
}

export function selectField(id: string, name: string, label: string, options: [string, string][], selected?: string): El {
  return h(
    'div',
    { class: 'field' },
    h('label', { for: `f-${name}` }, label),
    h(
      'select',
      { id: `f-${name}`, name, 'data-testid': `${name}-select`, 'data-bench-id': id },
      options.map(([value, text]) => h('option', { value, selected: value === selected }, text)),
    ),
  );
}

export function checkField(id: string, name: string, value: string, label: string, checked = false): El {
  return h(
    'div',
    { class: 'field' },
    h('input', { type: 'checkbox', id: `f-${name}-${value}`, name, value, checked, 'data-testid': `${name}-${value}`, 'data-bench-id': id }),
    h('label', { for: `f-${name}-${value}`, style: 'display:inline;font-weight:400' }, label),
  );
}

export function textArea(id: string, name: string, label: string): El {
  return h(
    'div',
    { class: 'field' },
    h('label', { for: `f-${name}` }, label),
    h('textarea', { id: `f-${name}`, name, rows: 4, 'data-testid': `${name}-text`, 'data-bench-id': id }),
  );
}

export function notice(text: string): El {
  return h('p', { class: 'notice', role: 'status' }, text);
}

export function options(values: string[], anyLabel?: string): [string, string][] {
  const o: [string, string][] = values.map((v) => [v.toLowerCase(), v]);
  return anyLabel ? [['', anyLabel], ...o] : o;
}

export function money(n: number): string {
  return `$${n.toFixed(2)}`;
}
