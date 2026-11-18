import { h, type El } from '../dom.ts';
import type { AppRequest, AppResponse, DemoApp } from '../types.ts';
import { button, link, money, options, selectField, shell, textField, notice } from '../ui.ts';

export interface Book {
  id: number;
  title: string;
  author: string;
  category: string;
  format: string;
  price: number;
}

export const BOOKS: Book[] = [
  { id: 1, title: 'The Rust Programming Language', author: 'Steve Klabnik', category: 'Programming', format: 'Paperback', price: 39.95 },
  { id: 2, title: 'Rust in Action', author: 'Tim McNamara', category: 'Programming', format: 'Paperback', price: 44.99 },
  { id: 3, title: 'Programming Rust', author: 'Jim Blandy', category: 'Programming', format: 'Hardcover', price: 49.99 },
  { id: 4, title: 'Rust for Rustaceans', author: 'Jon Gjengset', category: 'Programming', format: 'Paperback', price: 34.5 },
  { id: 5, title: 'Learning SQL', author: 'Alan Beaulieu', category: 'Programming', format: 'Paperback', price: 32.0 },
  { id: 6, title: 'SQL Performance Explained', author: 'Markus Winand', category: 'Programming', format: 'Paperback', price: 29.0 },
  { id: 7, title: 'Designing Data-Intensive Applications', author: 'Martin Kleppmann', category: 'Programming', format: 'Hardcover', price: 54.0 },
  { id: 8, title: 'Dune', author: 'Frank Herbert', category: 'Fiction', format: 'Paperback', price: 9.99 },
  { id: 9, title: 'Dune Messiah', author: 'Frank Herbert', category: 'Fiction', format: 'Paperback', price: 8.99 },
  { id: 10, title: 'The Left Hand of Darkness', author: 'Ursula K. Le Guin', category: 'Fiction', format: 'Paperback', price: 10.5 },
  { id: 11, title: 'Piranesi', author: 'Susanna Clarke', category: 'Fiction', format: 'Hardcover', price: 24.0 },
  { id: 12, title: 'A Brief History of Time', author: 'Stephen Hawking', category: 'Science', format: 'Paperback', price: 15.0 },
  { id: 13, title: 'The Selfish Gene', author: 'Richard Dawkins', category: 'Science', format: 'Paperback', price: 18.0 },
  { id: 14, title: 'Cosmos', author: 'Carl Sagan', category: 'Science', format: 'Hardcover', price: 28.0 },
  { id: 15, title: 'Sapiens', author: 'Yuval Noah Harari', category: 'History', format: 'Hardcover', price: 27.0 },
  { id: 16, title: 'Guns, Germs, and Steel', author: 'Jared Diamond', category: 'History', format: 'Paperback', price: 17.0 },
  { id: 17, title: 'The Silk Roads', author: 'Peter Frankopan', category: 'History', format: 'Hardcover', price: 30.0 },
  { id: 18, title: 'SPQR', author: 'Mary Beard', category: 'History', format: 'Paperback', price: 19.0 },
];

const CATEGORIES = ['Programming', 'Fiction', 'Science', 'History'];
const FORMATS = ['Paperback', 'Hardcover'];
const NAV = [
  { id: 'bk.nav.home', href: '/', text: 'Home' },
  { id: 'bk.nav.cart', href: '/cart', text: 'Cart' },
];

function page(main: (El | string)[]): El {
  return shell({ title: 'Bookshop', base: '/bookshop', navLinks: NAV, main });
}

function bookItem(b: Book): El {
  return h(
    'li',
    {},
    h(
      'article',
      { class: 'book', 'data-testid': `book-${b.id}` },
      h('h3', {}, link(`bk.res.${b.id}`, `/bookshop/book/${b.id}`, b.title)),
      h('p', {}, `${b.author} | ${b.category} | ${b.format} | ${money(b.price)}`),
    ),
  );
}

function search(req: AppRequest): AppResponse {
  const q = (req.query.get('q') ?? '').trim();
  const category = req.query.get('category') ?? '';
  const format = req.query.get('format') ?? '';
  const max = Number(req.query.get('maxPrice') ?? '');
  req.session.events.push({ type: 'search', data: { q, category, format, maxPrice: Number.isFinite(max) ? max : 0 } });
  const hits = BOOKS.filter(
    (b) =>
      (!q || `${b.title} ${b.author}`.toLowerCase().includes(q.toLowerCase())) &&
      (!category || b.category.toLowerCase() === category) &&
      (!format || b.format.toLowerCase() === format) &&
      (!req.query.get('maxPrice') || b.price <= max),
  );
  const filters = h(
    'form',
    { method: 'get', action: '/bookshop/search', id: 'filters', 'aria-label': 'Filters' },
    h(
      'div',
      { 'data-mut': 'reorder' },
      textField('bk.f.q', 'q', 'Search books', { value: q }),
      selectField('bk.f.category', 'category', 'Category', options(CATEGORIES, 'All categories'), category),
      selectField('bk.f.format', 'format', 'Format', options(FORMATS, 'Any format'), format),
      textField('bk.f.max', 'maxPrice', 'Maximum price', { value: req.query.get('maxPrice') ?? '', placeholder: 'e.g. 40' }),
    ),
    h('div', { 'data-mut': 'movable' }, button('bk.f.apply', 'Apply filters')),
    h('div', { 'data-mut': 'slot' }),
  );
  return {
    page: page([
      h('h1', {}, 'Search results'),
      filters,
      h('p', {}, `${hits.length} book${hits.length === 1 ? '' : 's'} found`),
      h('ul', { class: 'list', 'data-mut': 'reorder' }, hits.map(bookItem)),
    ]),
  };
}

export const bookshop: DemoApp = {
  name: 'bookshop',
  basePath: '/bookshop',
  title: 'Bookshop',
  handle(req) {
    const m = /^\/book\/(\d+)$/.exec(req.path);
    if (req.method === 'GET' && req.path === '/') {
      const form = h(
        'form',
        { method: 'get', action: '/bookshop/search', id: 'search-form' },
        h(
          'div',
          { 'data-mut': 'reorder' },
          textField('bk.q', 'q', 'Search books', { placeholder: 'Title or author' }),
          selectField('bk.cat', 'category', 'Category', options(CATEGORIES, 'All categories')),
        ),
        h('div', { 'data-mut': 'movable' }, button('bk.search', 'Search')),
        h('div', { 'data-mut': 'slot' }),
      );
      return { page: page([h('h1', {}, 'Welcome to the Bookshop'), h('p', {}, 'Find your next read.'), form]) };
    }
    if (req.method === 'GET' && req.path === '/search') return search(req);
    if (req.method === 'GET' && m) {
      const b = BOOKS.find((x) => x.id === Number(m[1]));
      if (!b) return undefined;
      req.session.events.push({ type: 'view', data: { bookId: b.id } });
      return {
        page: page([
          req.query.get('added') ? notice('Added to cart') : '',
          h('h1', {}, b.title),
          h('p', {}, `by ${b.author}`),
          h('p', {}, `${b.category} | ${b.format} | ${money(b.price)}`),
          h(
            'form',
            { method: 'post', action: '/bookshop/cart/add', id: 'add-form' },
            h('input', { type: 'hidden', name: 'id', value: String(b.id) }),
            h('div', { 'data-mut': 'movable' }, button('bk.add', 'Add to cart')),
            h('div', { 'data-mut': 'slot' }),
          ),
          h('p', {}, link('bk.back', '/bookshop/search?q=', 'Back to results')),
        ]),
      };
    }
    if (req.method === 'POST' && req.path === '/cart/add') {
      const id = Number(req.form.get('id'));
      if (!BOOKS.some((b) => b.id === id)) return undefined;
      req.session.events.push({ type: 'cart_add', data: { bookId: id } });
      return { redirect: `/bookshop/book/${id}?added=1` };
    }
    if (req.method === 'GET' && req.path === '/cart') {
      req.session.events.push({ type: 'cart_view', data: {} });
      const ids = req.session.events.filter((e) => e.type === 'cart_add').map((e) => Number(e.data.bookId));
      const items = ids.map((id) => BOOKS.find((b) => b.id === id)).filter((b): b is Book => !!b);
      return {
        page: page([
          h('h1', {}, 'Your cart'),
          items.length ? h('ul', { class: 'list' }, items.map((b) => h('li', {}, `${b.title} - ${money(b.price)}`))) : h('p', {}, 'Your cart is empty.'),
          h('p', {}, link('bk.continue', '/bookshop/', 'Continue shopping')),
        ]),
      };
    }
    return undefined;
  },
};
