import { h, type Child, type El } from '../dom.ts';
import type { DemoApp } from '../types.ts';
import { button, link, shell, textField } from '../ui.ts';

export interface DocPage {
  slug: string;
  title: string;
  /** Sidebar path of section titles above this page (three levels in total). */
  trail: string[];
  summary: string;
}

export const PAGES: DocPage[] = [
  { slug: 'install', title: 'Install the CLI', trail: ['Guide', 'Getting started'], summary: 'Install the command line tool with your package manager.' },
  { slug: 'quickstart', title: 'Quick start', trail: ['Guide', 'Getting started'], summary: 'Create your first project in five minutes.' },
  { slug: 'proxy', title: 'Configure the proxy', trail: ['Guide', 'Configuration'], summary: 'Route requests through a corporate proxy.' },
  { slug: 'env', title: 'Environment variables', trail: ['Guide', 'Configuration'], summary: 'Every environment variable the tool reads.' },
  { slug: 'client', title: 'Client API', trail: ['Reference', 'API'], summary: 'Methods exposed by the client library.' },
  { slug: 'server', title: 'Server API', trail: ['Reference', 'API'], summary: 'Endpoints and payloads of the server.' },
  { slug: 'errors', title: 'Error codes', trail: ['Reference', 'Errors'], summary: 'What each error code means and how to fix it.' },
];

export const TABS = ['Overview', 'Examples', 'Notes'];

const NAV = [{ id: 'dc.nav.home', href: '/', text: 'Docs home' }];

function sidebar(current?: DocPage): El[] {
  const tops = [...new Set(PAGES.map((p) => p.trail[0] ?? ''))];
  return tops.map((top) => {
    const inTop = PAGES.filter((p) => p.trail[0] === top);
    const subs = [...new Set(inTop.map((p) => p.trail[1] ?? ''))];
    return h(
      'details',
      { open: current?.trail[0] === top },
      h('summary', { 'data-bench-id': `dc.sec.${top.toLowerCase()}` }, top),
      subs.map((sub) =>
        h(
          'details',
          { open: current?.trail[0] === top && current.trail[1] === sub },
          h('summary', { 'data-bench-id': `dc.sub.${sub.toLowerCase().replace(/\s+/g, '-')}` }, sub),
          h('ul', { style: 'list-style:none;padding-left:.8rem' }, inTop.filter((p) => p.trail[1] === sub).map((p) => h('li', {}, link(`dc.leaf.${p.slug}`, `/docs/page/${p.slug}`, p.title)))),
        ),
      ),
    );
  });
}

function searchBox(q = ''): El {
  return h(
    'form',
    { method: 'get', action: '/docs/search', id: 'doc-search', role: 'search' },
    h('div', { 'data-mut': 'reorder' }, textField('dc.q', 'q', 'Search the docs', { value: q, placeholder: 'keyword' })),
    h('div', { 'data-mut': 'movable' }, button('dc.search', 'Search docs')),
    h('div', { 'data-mut': 'slot' }),
  );
}

function page(main: Child[], current?: DocPage): El {
  return shell({ title: 'Product Docs', base: '/docs', navLinks: NAV, main, side: sidebar(current) });
}

export const docs: DemoApp = {
  name: 'docs',
  basePath: '/docs',
  title: 'Product Docs',
  handle(req) {
    const one = /^\/page\/([a-z]+)$/.exec(req.path);
    if (req.method === 'GET' && req.path === '/') {
      return { page: page([h('h1', {}, 'Product Docs'), h('p', {}, 'Guides and reference for the fictional tool.'), searchBox()]) };
    }
    if (req.method === 'GET' && req.path === '/search') {
      const q = (req.query.get('q') ?? '').trim().toLowerCase();
      req.session.events.push({ type: 'doc_search', data: { q } });
      const hits = PAGES.filter((p) => !q || `${p.title} ${p.summary}`.toLowerCase().includes(q));
      return {
        page: page([
          h('h1', {}, 'Search results'),
          searchBox(q),
          h('p', {}, `${hits.length} page${hits.length === 1 ? '' : 's'}`),
          h('ul', { class: 'list', 'data-mut': 'reorder' }, hits.map((p) => h('li', {}, h('h3', {}, link(`dc.res.${p.slug}`, `/docs/page/${p.slug}`, p.title)), h('p', {}, p.summary)))),
        ]),
      };
    }
    if (req.method === 'GET' && one) {
      const p = PAGES.find((x) => x.slug === one[1]);
      if (!p) return undefined;
      const tab = (req.query.get('tab') ?? 'overview').toLowerCase();
      req.session.events.push({ type: 'doc_view', data: { slug: p.slug, tab } });
      return {
        page: page(
          [
            h('h1', {}, p.title),
            searchBox(),
            h(
              'nav',
              { class: 'tabs', 'aria-label': 'Page sections' },
              h('div', { 'data-mut': 'reorder', style: 'display:flex;gap:1rem' }, TABS.map((t) => h('span', {}, link(`dc.tab.${t.toLowerCase()}`, `/docs/page/${p.slug}?tab=${t.toLowerCase()}`, t, { role: 'tab', 'aria-selected': t.toLowerCase() === tab ? 'true' : 'false' })))),
            ),
            h('section', {}, h('h2', {}, TABS.find((t) => t.toLowerCase() === tab) ?? 'Overview'), h('p', {}, p.summary)),
          ],
          p,
        ),
      };
    }
    return undefined;
  },
};
