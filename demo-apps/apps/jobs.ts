import { h, type El } from '../dom.ts';
import type { DemoApp } from '../types.ts';
import { button, link, notice, shell, textField } from '../ui.ts';

export interface Job {
  id: number;
  title: string;
  company: string;
  location: string;
  salary: string;
}

const RAW: [string, string, string, string][] = [
  ['Software Engineer', 'Northwind Labs', 'Boston', '$120k'],
  ['Backend Engineer', 'Harbor Systems', 'Boston', '$130k'],
  ['Data Engineer', 'Tidepool', 'Boston', '$125k'],
  ['Frontend Developer', 'Brightside', 'Remote', '$110k'],
  ['Backend Developer', 'Ledgerly', 'Remote', '$118k'],
  ['Mobile Developer', 'Pocketwise', 'Remote', '$115k'],
  ['Full Stack Developer', 'Orchard', 'Remote', '$122k'],
  ['QA Developer', 'Sparrow', 'Remote', '$98k'],
  ['Platform Developer', 'Cobalt', 'Remote', '$135k'],
  ['Developer Advocate', 'Relay', 'Remote', '$105k'],
  ['Data Analyst', 'Maple Health', 'Chicago', '$85k'],
  ['Business Analyst', 'Corner Bank', 'Chicago', '$90k'],
  ['Financial Analyst', 'Summit Capital', 'New York', '$100k'],
  ['Security Engineer', 'Bastion', 'Austin', '$140k'],
];

export const JOBS: Job[] = RAW.map(([title, company, location, salary], i) => ({ id: i + 1, title, company, location, salary }));
export const PAGE_SIZE = 5;

const NAV = [
  { id: 'jb.nav.home', href: '/', text: 'Home' },
  { id: 'jb.nav.saved', href: '/saved', text: 'Saved jobs' },
];

function page(main: (El | string)[]): El {
  return shell({ title: 'Jobs Board', base: '/jobs', navLinks: NAV, main });
}

function searchForm(kw = '', loc = ''): El {
  return h(
    'form',
    { method: 'get', action: '/jobs/search', id: 'job-search' },
    h(
      'div',
      { 'data-mut': 'reorder' },
      textField('jb.kw', 'kw', 'Job title or keyword', { value: kw, placeholder: 'e.g. engineer' }),
      textField('jb.loc', 'loc', 'Location', { value: loc, placeholder: 'City or Remote' }),
    ),
    h('div', { 'data-mut': 'movable' }, button('jb.find', 'Find jobs')),
    h('div', { 'data-mut': 'slot' }),
  );
}

export const jobs: DemoApp = {
  name: 'jobs',
  basePath: '/jobs',
  title: 'Jobs Board',
  handle(req) {
    const posting = /^\/posting\/(\d+)$/.exec(req.path);
    if (req.method === 'GET' && req.path === '/') {
      return { page: page([h('h1', {}, 'Jobs Board'), h('p', {}, 'Search fictional openings.'), searchForm()]) };
    }
    if (req.method === 'GET' && req.path === '/search') {
      const kw = (req.query.get('kw') ?? '').trim();
      const loc = (req.query.get('loc') ?? '').trim();
      const pg = Math.max(1, Number(req.query.get('page') ?? '1') || 1);
      req.session.events.push({ type: 'job_search', data: { kw: kw.toLowerCase(), loc: loc.toLowerCase(), page: pg } });
      const hits = JOBS.filter((j) => (!kw || `${j.title} ${j.company}`.toLowerCase().includes(kw.toLowerCase())) && (!loc || j.location.toLowerCase() === loc.toLowerCase()));
      const pages = Math.max(1, Math.ceil(hits.length / PAGE_SIZE));
      const slice = hits.slice((pg - 1) * PAGE_SIZE, pg * PAGE_SIZE);
      const q = (p: number) => `/jobs/search?kw=${encodeURIComponent(kw)}&loc=${encodeURIComponent(loc)}&page=${p}`;
      return {
        page: page([
          h('h1', {}, 'Search results'),
          searchForm(kw, loc),
          h('p', {}, `${hits.length} job${hits.length === 1 ? '' : 's'}, page ${pg} of ${pages}`),
          h(
            'ul',
            { class: 'list', 'data-mut': 'reorder' },
            slice.map((j) =>
              h('li', {}, h('h3', {}, link(`jb.res.${j.id}`, `/jobs/posting/${j.id}`, j.title)), h('p', {}, `${j.company} | ${j.location} | ${j.salary}`)),
            ),
          ),
          h(
            'nav',
            { 'aria-label': 'Pagination' },
            pg > 1 ? link('jb.prev', q(pg - 1), 'Previous') : '',
            ' ',
            pg < pages ? link('jb.next', q(pg + 1), 'Next') : '',
          ),
        ]),
      };
    }
    if (req.method === 'GET' && posting) {
      const j = JOBS.find((x) => x.id === Number(posting[1]));
      if (!j) return undefined;
      req.session.events.push({ type: 'job_view', data: { jobId: j.id } });
      return {
        page: page([
          req.query.get('saved') ? notice('Job saved') : '',
          h('h1', {}, j.title),
          h('p', {}, `${j.company}, ${j.location}. Salary ${j.salary}.`),
          h(
            'form',
            { method: 'post', action: '/jobs/save', id: 'save-form' },
            h('input', { type: 'hidden', name: 'id', value: String(j.id) }),
            h('div', { 'data-mut': 'movable' }, button('jb.save', 'Save job')),
            h('div', { 'data-mut': 'slot' }),
          ),
          h('p', {}, link('jb.back', '/jobs/search?kw=&loc=', 'Back to search')),
        ]),
      };
    }
    if (req.method === 'POST' && req.path === '/save') {
      const id = Number(req.form.get('id'));
      if (!JOBS.some((j) => j.id === id)) return undefined;
      req.session.events.push({ type: 'job_saved', data: { jobId: id } });
      return { redirect: `/jobs/posting/${id}?saved=1` };
    }
    if (req.method === 'GET' && req.path === '/saved') {
      const ids = req.session.events.filter((e) => e.type === 'job_saved').map((e) => Number(e.data.jobId));
      return {
        page: page([
          h('h1', {}, 'Saved jobs'),
          ids.length ? h('ul', { class: 'list' }, ids.map((id) => h('li', {}, JOBS.find((j) => j.id === id)?.title ?? ''))) : h('p', {}, 'No saved jobs yet.'),
        ]),
      };
    }
    return undefined;
  },
};
