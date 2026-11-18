/* global window, document, getComputedStyle, Node, Element, CSS, URL, location */
// Injected into every page the agent drives. Describes elements for the recorder
// and the replayer's candidate extractor. Plain JS on purpose: it is serialized
// into the page, so it cannot depend on a bundler or on TypeScript helpers.
//
// This file must never read the hidden ground-truth attribute that only the
// scorer is allowed to use; tests/extractor.test.ts greps the source for it.
(() => {
  if (window.__bma) return;

  const norm = (s) => (s || '').replace(/\s+/g, ' ').trim();
  const clip = (s, n) => (s.length > n ? s.slice(0, n) : s);

  const INTERACTIVE_SELECTOR =
    'a[href],button,input:not([type=hidden]),select,textarea,summary,[role=button],[role=tab],[role=link],[role=checkbox],[role=menuitem],[role=option]';

  function isVisible(el) {
    if (!(el instanceof Element)) return false;
    if (typeof el.checkVisibility === 'function' && !el.checkVisibility({ visibilityProperty: true })) return false;
    const r = el.getBoundingClientRect();
    if (r.width <= 0 || r.height <= 0) return false;
    const st = getComputedStyle(el);
    return st.visibility !== 'hidden' && st.display !== 'none';
  }

  function isDisabled(el) {
    return el.matches(':disabled') || el.getAttribute('aria-disabled') === 'true';
  }

  function inputType(el) {
    return el.tagName === 'INPUT' ? (el.getAttribute('type') || 'text').toLowerCase() : '';
  }

  function roleOf(el) {
    const explicit = norm(el.getAttribute('role')).split(' ')[0];
    if (explicit) return explicit;
    const tag = el.tagName.toLowerCase();
    if (tag === 'a') return el.hasAttribute('href') ? 'link' : '';
    if (tag === 'button' || tag === 'summary') return 'button';
    if (tag === 'select') return el.multiple || el.size > 1 ? 'listbox' : 'combobox';
    if (tag === 'textarea') return 'textbox';
    if (tag === 'option') return 'option';
    if (/^h[1-6]$/.test(tag)) return 'heading';
    if (tag === 'input') {
      const t = inputType(el);
      if (['button', 'submit', 'reset', 'image'].includes(t)) return 'button';
      if (t === 'checkbox') return 'checkbox';
      if (t === 'radio') return 'radio';
      if (t === 'range') return 'slider';
      if (t === 'search') return 'searchbox';
      return 'textbox';
    }
    return '';
  }

  function textContentOf(el) {
    // visible text only: skip display:none descendants (e.g. closed details content)
    let out = '';
    const walk = (n) => {
      if (n.nodeType === Node.TEXT_NODE) {
        out += n.nodeValue + ' ';
        return;
      }
      if (n.nodeType !== Node.ELEMENT_NODE) return;
      const tag = n.tagName;
      if (tag === 'SCRIPT' || tag === 'STYLE') return;
      if (n !== el && getComputedStyle(n).display === 'none') return;
      for (const c of n.childNodes) walk(c);
    };
    walk(el);
    return norm(out);
  }

  function labelledByText(el) {
    const ids = norm(el.getAttribute('aria-labelledby'));
    if (!ids) return '';
    return norm(
      ids
        .split(' ')
        .map((id) => document.getElementById(id))
        .filter(Boolean)
        .map((n) => textContentOf(n))
        .join(' '),
    );
  }

  /** Text of the <label> elements associated with a form control. */
  function labelText(el) {
    if (el.labels && el.labels.length) return norm(Array.from(el.labels).map((l) => textContentOf(l)).join(' '));
    return '';
  }

  const NAME_FROM_CONTENT = new Set(['button', 'link', 'tab', 'menuitem', 'option', 'heading', 'checkbox', 'radio']);

  /** A pragmatic subset of the accessible name computation (aria-labelledby, aria-label, native labels, content, title). */
  function accessibleName(el) {
    const by = labelledByText(el);
    if (by) return by;
    const aria = norm(el.getAttribute('aria-label'));
    if (aria) return aria;
    const tag = el.tagName.toLowerCase();
    if (tag === 'input') {
      const t = inputType(el);
      if (t === 'submit') return norm(el.getAttribute('value')) || 'Submit';
      if (t === 'button' || t === 'reset') return norm(el.getAttribute('value'));
      if (t === 'image') return norm(el.getAttribute('alt'));
    }
    if (tag === 'input' || tag === 'select' || tag === 'textarea') {
      const l = labelText(el);
      if (l) return l;
    }
    const role = roleOf(el);
    if (tag === 'button' || tag === 'summary' || tag === 'a' || NAME_FROM_CONTENT.has(role)) {
      const c = textContentOf(el);
      if (c) return c;
    }
    const title = norm(el.getAttribute('title'));
    if (title) return title;
    if (tag === 'input' || tag === 'textarea') return norm(el.getAttribute('placeholder'));
    return '';
  }

  function ownText(el) {
    const tag = el.tagName.toLowerCase();
    if (tag === 'input') return '';
    if (tag === 'select') {
      // option labels are stable across state changes, the selected one is not
      return clip(Array.from(el.options).map((o) => norm(o.textContent)).join(' '), 160);
    }
    return clip(textContentOf(el), 160);
  }

  /** Heading, legend and form context around an element, nearest first. */
  function nearbyText(el) {
    const parts = [];
    const add = (s) => {
      s = norm(s);
      if (s && !parts.includes(s)) parts.push(clip(s, 80));
    };
    const legend = el.closest('fieldset') && el.closest('fieldset').querySelector(':scope > legend');
    if (legend) add(legend.textContent);
    // the item card this element sits in (result lists): its heading
    const card = el.closest('li, article');
    if (card) {
      const hd = card.querySelector('h1,h2,h3,h4');
      if (hd && !hd.contains(el)) add(hd.textContent);
    }
    const form = el.closest('form');
    if (form) add(form.getAttribute('aria-label') || '');
    // nearest preceding heading in document order within the page
    const headings = Array.from(document.querySelectorAll('h1,h2,h3,h4'));
    let best = null;
    for (const hd of headings) {
      if (hd.compareDocumentPosition(el) & Node.DOCUMENT_POSITION_FOLLOWING && !hd.contains(el)) best = hd;
    }
    if (best) add(best.textContent);
    // sibling labels inside the same small container (field group)
    const group = el.parentElement;
    if (group && group.children.length <= 6) {
      for (const sib of group.children) {
        if (sib !== el && (sib.tagName === 'LABEL' || sib.tagName === 'LEGEND')) add(sib.textContent);
      }
    }
    return parts.join(' | ');
  }

  const cssEscape = (s) => (window.CSS && CSS.escape ? CSS.escape(s) : s.replace(/[^a-zA-Z0-9_-]/g, '\\$&'));

  function cssPath(el) {
    const segs = [];
    let cur = el;
    for (let depth = 0; cur && cur.nodeType === 1 && cur !== document.body && depth < 4; depth++) {
      const tag = cur.tagName.toLowerCase();
      const same = cur.parentElement ? Array.from(cur.parentElement.children).filter((c) => c.tagName === cur.tagName) : [cur];
      segs.unshift(same.length > 1 ? `${tag}:nth-of-type(${same.indexOf(cur) + 1})` : tag);
      cur = cur.parentElement;
    }
    return segs.join(' > ');
  }

  function cssCandidates(el) {
    const out = [];
    if (el.id) out.push(`#${cssEscape(el.id)}`);
    const tid = el.getAttribute('data-testid');
    if (tid) out.push(`[data-testid="${tid.replace(/"/g, '\\"')}"]`);
    out.push(cssPath(el));
    return out;
  }

  const ATTR_ALLOWLIST = ['name', 'type', 'href', 'value', 'role', 'aria-selected', 'aria-expanded', 'autocomplete', 'for'];

  function allowedAttrs(el) {
    const out = {};
    for (const a of ATTR_ALLOWLIST) {
      const v = el.getAttribute(a);
      if (v === null || v === '') continue;
      if (a === 'href') {
        try {
          const u = new URL(v, location.href);
          out[a] = u.pathname + u.search;
        } catch {
          out[a] = clip(v, 120);
        }
      } else out[a] = clip(v, 120);
    }
    return out;
  }

  function describe(el) {
    const r = el.getBoundingClientRect();
    return {
      role: roleOf(el),
      accessibleName: accessibleName(el),
      label: labelText(el),
      placeholder: norm(el.getAttribute('placeholder')),
      text: ownText(el),
      nearbyText: nearbyText(el),
      tag: el.tagName.toLowerCase(),
      inputType: inputType(el),
      attrs: allowedAttrs(el),
      cssCandidates: cssCandidates(el),
      bbox: { x: Math.round(r.x), y: Math.round(r.y), width: Math.round(r.width), height: Math.round(r.height) },
      frameUrl: location.href,
    };
  }

  /** Interactive controls the user can see right now, in document order. */
  function interactiveElements() {
    return Array.from(document.querySelectorAll(INTERACTIVE_SELECTOR)).filter((el) => isVisible(el));
  }

  /**
   * Visible interactive elements with descriptions. Each is tagged data-bma-cand=<idx> so the
   * replayer can find it again. Policy: hidden (display/visibility/zero size, closed details,
   * aria-hidden) are left out; disabled ones are returned flagged; offscreen ones that can be
   * scrolled to are returned with inViewport=false.
   */
  function collect() {
    for (const old of document.querySelectorAll('[data-bma-cand]')) old.removeAttribute('data-bma-cand');
    const out = [];
    for (const el of interactiveElements()) {
      if (el.closest('[aria-hidden="true"]')) continue;
      const idx = out.length;
      el.setAttribute('data-bma-cand', String(idx));
      const r = el.getBoundingClientRect();
      const inViewport = r.bottom > 0 && r.right > 0 && r.top < window.innerHeight && r.left < window.innerWidth;
      out.push(Object.assign({ idx, disabled: isDisabled(el), inViewport }, describe(el)));
    }
    return out;
  }

  /** Facts the approval gate needs about an element and the form it sits in. */
  function formInfo(el) {
    const form = el.form || el.closest('form');
    const type = el.tagName === 'INPUT' || el.tagName === 'BUTTON' ? (el.getAttribute('type') || (el.tagName === 'BUTTON' ? 'submit' : 'text')).toLowerCase() : '';
    return {
      tag: el.tagName.toLowerCase(),
      type,
      name: accessibleName(el),
      inForm: !!form,
      method: form ? (form.getAttribute('method') || 'get').toLowerCase() : '',
    };
  }

  /** Label and value of every visible control in the element's form. Passwords are never read. */
  function formSummary(el) {
    const form = el.form || el.closest('form');
    if (!form) return [];
    const rows = [];
    for (const c of form.querySelectorAll('input,select,textarea')) {
      const t = (c.getAttribute('type') || '').toLowerCase();
      if (['hidden', 'submit', 'button', 'image', 'reset'].includes(t) || !isVisible(c)) continue;
      const label = accessibleName(c) || c.getAttribute('name') || c.tagName.toLowerCase();
      let value;
      if (t === 'password') value = '(hidden)';
      else if (t === 'checkbox' || t === 'radio') value = c.checked ? 'checked' : 'not checked';
      else if (c.tagName === 'SELECT') value = c.selectedOptions[0] ? norm(c.selectedOptions[0].textContent) : '';
      else value = c.value;
      rows.push({ label: clip(label, 80), value: clip(String(value), 200) });
    }
    return rows;
  }

  window.__bma = { formInfo, formSummary, collect, describe, isVisible, isDisabled, roleOf, accessibleName, labelText, nearbyText, interactiveElements, INTERACTIVE_SELECTOR, norm };
})();
