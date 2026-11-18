import { h, type El } from '../dom.ts';
import type { AppRequest, DemoApp } from '../types.ts';
import { button, link, notice, options, selectField, shell, textArea, textField } from '../ui.ts';

const CATEGORIES = ['Billing', 'Technical', 'Account'];
const PRIORITIES = ['Low', 'Normal', 'High'];
const NAV = [
  { id: 'hd.nav.home', href: '/', text: 'Help desk' },
  { id: 'hd.nav.new', href: '/new', text: 'New ticket' },
];

function page(main: (El | string)[]): El {
  return shell({ title: 'Help Desk', base: '/helpdesk', navLinks: NAV, main });
}

function draft(req: AppRequest): Record<string, string> {
  return (req.session.draft.helpdesk ??= {});
}

function step1(d: Record<string, string>): El {
  return page([
    h('h1', {}, 'New ticket: your details'),
    h(
      'form',
      { method: 'post', action: '/helpdesk/new/1', id: 'step1' },
      h('div', { 'data-mut': 'reorder' }, textField('hd.name', 'name', 'Your name', { value: d.name }), textField('hd.email', 'email', 'Contact email', { value: d.email, type: 'email' })),
      h('div', { 'data-mut': 'movable' }, button('hd.next1', 'Continue')),
      h('div', { 'data-mut': 'slot' }),
    ),
  ]);
}

function step2(d: Record<string, string>): El {
  return page([
    h('h1', {}, 'New ticket: the problem'),
    h(
      'form',
      { method: 'post', action: '/helpdesk/new/2', id: 'step2' },
      h(
        'div',
        { 'data-mut': 'reorder' },
        selectField('hd.category', 'category', 'Category', options(CATEGORIES), d.category),
        selectField('hd.priority', 'priority', 'Priority', options(PRIORITIES), d.priority),
        textField('hd.subject', 'subject', 'Subject', { value: d.subject }),
        textArea('hd.description', 'description', 'Describe the problem'),
      ),
      h('div', { 'data-mut': 'movable' }, button('hd.next2', 'Continue')),
      h('div', { 'data-mut': 'slot' }),
    ),
    h('p', {}, link('hd.back2', '/helpdesk/new', 'Back')),
  ]);
}

function step3(d: Record<string, string>): El {
  const rows: [string, string][] = [
    ['Name', d.name ?? ''],
    ['Email', d.email ?? ''],
    ['Category', d.category ?? ''],
    ['Priority', d.priority ?? ''],
    ['Subject', d.subject ?? ''],
    ['Description', d.description ?? ''],
  ];
  return page([
    h('h1', {}, 'New ticket: review'),
    h('dl', {}, rows.flatMap(([k, v]) => [h('dt', {}, k), h('dd', {}, v)])),
    h(
      'form',
      { method: 'post', action: '/helpdesk/new/submit', id: 'review' },
      h('div', { 'data-mut': 'movable' }, button('hd.submit', 'Submit ticket')),
      h('div', { 'data-mut': 'slot' }),
    ),
    h('p', {}, link('hd.edit', '/helpdesk/new/2', 'Edit details')),
  ]);
}

export const helpdesk: DemoApp = {
  name: 'helpdesk',
  basePath: '/helpdesk',
  title: 'Help Desk',
  handle(req) {
    const d = draft(req);
    if (req.method === 'GET' && req.path === '/') {
      return { page: page([h('h1', {}, 'Help Desk'), h('p', {}, 'Open a support ticket with our fictional team.'), h('p', {}, link('hd.open', '/helpdesk/new', 'Open a new ticket'))]) };
    }
    if (req.method === 'GET' && req.path === '/new') return { page: step1(d) };
    if (req.method === 'POST' && req.path === '/new/1') {
      d.name = req.form.get('name') ?? '';
      d.email = req.form.get('email') ?? '';
      return { redirect: '/helpdesk/new/2' };
    }
    if (req.method === 'GET' && req.path === '/new/2') return { page: step2(d) };
    if (req.method === 'POST' && req.path === '/new/2') {
      for (const k of ['category', 'priority', 'subject', 'description']) d[k] = req.form.get(k) ?? '';
      return { redirect: '/helpdesk/new/3' };
    }
    if (req.method === 'GET' && req.path === '/new/3') return { page: step3(d) };
    if (req.method === 'POST' && req.path === '/new/submit') {
      req.session.submissions += 1;
      req.session.events.push({ type: 'ticket', data: { subject: d.subject ?? '', category: d.category ?? '', priority: d.priority ?? '', name: d.name ?? '' } });
      req.session.draft.helpdesk = {};
      return { redirect: '/helpdesk/done' };
    }
    if (req.method === 'GET' && req.path === '/done') return { page: page([h('h1', {}, 'Ticket received'), notice('Thanks, we will reply within one business day.')]) };
    return undefined;
  },
};
