import { h, type El } from '../dom.ts';
import type { AppRequest, AppResponse, DemoApp } from '../types.ts';
import { button, checkField, link, notice, options, selectField, shell, textField } from '../ui.ts';

export interface Item {
  id: number;
  title: string;
  author: string;
  year: number;
  language: string;
  available: boolean;
  topic: string;
}

export const ITEMS: Item[] = [
  { id: 1, title: 'The Guns of August', author: 'Barbara Tuchman', year: 1962, language: 'English', available: true, topic: 'history' },
  { id: 2, title: 'A Distant Mirror', author: 'Barbara Tuchman', year: 1978, language: 'English', available: false, topic: 'history' },
  { id: 3, title: 'Empire of the Summer Moon', author: 'S. C. Gwynne', year: 2010, language: 'English', available: true, topic: 'history' },
  { id: 4, title: 'The Uninhabitable Earth', author: 'David Wallace-Wells', year: 2019, language: 'English', available: true, topic: 'climate' },
  { id: 5, title: 'Silent Spring', author: 'Rachel Carson', year: 1962, language: 'English', available: false, topic: 'climate' },
  { id: 6, title: 'Cambio climatico y sociedad', author: 'Maria Ortega', year: 2015, language: 'Spanish', available: true, topic: 'climate' },
  { id: 7, title: 'The Sixth Extinction', author: 'Elizabeth Kolbert', year: 2014, language: 'English', available: true, topic: 'climate' },
  { id: 8, title: 'Leaves of Grass', author: 'Walt Whitman', year: 1855, language: 'English', available: true, topic: 'poetry' },
  { id: 9, title: 'Ariel', author: 'Sylvia Plath', year: 1965, language: 'English', available: false, topic: 'poetry' },
  { id: 10, title: 'Poemas selectos', author: 'Pablo Neruda', year: 1970, language: 'Spanish', available: true, topic: 'poetry' },
  { id: 11, title: 'Milk and Honey', author: 'Rupi Kaur', year: 2014, language: 'English', available: true, topic: 'poetry' },
  { id: 12, title: 'The Garden Book', author: 'Penelope Hobhouse', year: 2003, language: 'English', available: true, topic: 'garden' },
  { id: 13, title: 'Le jardin potager', author: 'Claire Dubois', year: 1998, language: 'French', available: true, topic: 'garden' },
];

const BRANCHES = ['Main', 'East', 'West'];
const NAV = [
  { id: 'lb.nav.home', href: '/', text: 'Home' },
  { id: 'lb.nav.catalog', href: '/catalog', text: 'Catalog' },
];

function page(main: (El | string)[]): El {
  return shell({ title: 'City Library', base: '/library', navLinks: NAV, main });
}

function searchForm(q: URLSearchParams): El {
  return h(
    'form',
    { method: 'get', action: '/library/catalog', id: 'catalog-search' },
    h('div', { 'data-mut': 'reorder' }, textField('lb.kw', 'keywords', 'Keywords', { value: q.get('keywords') ?? '', placeholder: 'Title, topic or subject' })),
    h(
      'details',
      { id: 'adv' },
      h('summary', { 'data-bench-id': 'lb.adv' }, 'Advanced filters'),
      h(
        'div',
        { 'data-mut': 'reorder' },
        textField('lb.author', 'author', 'Author', { value: q.get('author') ?? '' }),
        textField('lb.yfrom', 'yearFrom', 'Published after', { value: q.get('yearFrom') ?? '', placeholder: 'year' }),
        selectField('lb.lang', 'language', 'Language', options(['English', 'Spanish', 'French'], 'Any language'), q.get('language') ?? ''),
        checkField('lb.avail', 'available', 'yes', 'Available now only', q.get('available') === 'yes'),
      ),
    ),
    h('div', { 'data-mut': 'movable' }, button('lb.search', 'Search catalog')),
    h('div', { 'data-mut': 'slot' }),
  );
}

function catalog(req: AppRequest): AppResponse {
  const q = req.query;
  const kw = (q.get('keywords') ?? '').toLowerCase().trim();
  const author = (q.get('author') ?? '').toLowerCase().trim();
  const yearFrom = Number(q.get('yearFrom') ?? '') || 0;
  const language = (q.get('language') ?? '').toLowerCase();
  const avail = q.get('available') === 'yes';
  req.session.events.push({ type: 'catalog_search', data: { keywords: kw, author, language, available: avail } });
  const hits = ITEMS.filter(
    (i) =>
      (!kw || `${i.title} ${i.topic} ${i.author}`.toLowerCase().includes(kw)) &&
      (!author || i.author.toLowerCase().includes(author)) &&
      i.year >= yearFrom &&
      (!language || i.language.toLowerCase() === language) &&
      (!avail || i.available),
  );
  return {
    page: page([
      h('h1', {}, 'Catalog'),
      searchForm(q),
      h('p', {}, `${hits.length} result${hits.length === 1 ? '' : 's'}`),
      h(
        'ul',
        { class: 'list', 'data-mut': 'reorder' },
        hits.map((i) =>
          h(
            'li',
            {},
            h('h3', {}, link(`lb.res.${i.id}`, `/library/item/${i.id}`, i.title)),
            h('p', {}, `${i.author}, ${i.year}, ${i.language}, ${i.available ? 'Available' : 'Checked out'}`),
          ),
        ),
      ),
    ]),
  };
}

export const library: DemoApp = {
  name: 'library',
  basePath: '/library',
  title: 'City Library',
  handle(req) {
    const item = /^\/item\/(\d+)$/.exec(req.path);
    const hold = /^\/hold\/(\d+)(\/done)?$/.exec(req.path);
    if (req.method === 'GET' && req.path === '/') {
      return { page: page([h('h1', {}, 'City Library'), h('p', {}, 'Search the catalog and place holds.'), searchForm(new URLSearchParams())]) };
    }
    if (req.method === 'GET' && req.path === '/catalog') return catalog(req);
    if (req.method === 'GET' && item) {
      const i = ITEMS.find((x) => x.id === Number(item[1]));
      if (!i) return undefined;
      req.session.events.push({ type: 'view_item', data: { itemId: i.id } });
      return {
        page: page([
          h('h1', {}, i.title),
          h('p', {}, `${i.author}, ${i.year}. ${i.available ? 'Available' : 'Checked out'}.`),
          h('p', {}, link('lb.hold.link', `/library/hold/${i.id}`, 'Place a hold')),
        ]),
      };
    }
    if (hold) {
      const i = ITEMS.find((x) => x.id === Number(hold[1]));
      if (!i) return undefined;
      if (req.method === 'GET' && hold[2]) return { page: page([h('h1', {}, 'Hold placed'), notice(`Hold placed for ${i.title}.`)]) };
      if (req.method === 'GET') {
        return {
          page: page([
            h('h1', {}, `Place a hold: ${i.title}`),
            h(
              'form',
              { method: 'post', action: `/library/hold/${i.id}`, id: 'hold-form' },
              h(
                'div',
                { 'data-mut': 'reorder' },
                textField('lb.h.name', 'fullName', 'Full name'),
                textField('lb.h.email', 'email', 'Email address', { type: 'email' }),
                selectField('lb.h.branch', 'branch', 'Pickup branch', options(BRANCHES)),
                checkField('lb.h.notify', 'notify', 'yes', 'Email me when it is ready'),
              ),
              h('div', { 'data-mut': 'movable' }, button('lb.h.submit', 'Place hold')),
              h('div', { 'data-mut': 'slot' }),
            ),
          ]),
        };
      }
      // POST: the final submission for this app.
      req.session.submissions += 1;
      req.session.events.push({
        type: 'hold',
        data: { itemId: i.id, name: req.form.get('fullName') ?? '', branch: req.form.get('branch') ?? '', notify: req.form.get('notify') === 'yes' },
      });
      return { redirect: `/library/hold/${i.id}/done` };
    }
    return undefined;
  },
};
