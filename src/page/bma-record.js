/* global window, document, location, setTimeout, clearTimeout, Element */
// Recording listeners. Runs in every page after bma-page.js. Sends one message
// per user action through the exposed binding `__bmaEvent`. Values of sensitive
// fields (passwords, payment, one-time codes) are never read: the message only
// says a field was refused.
(() => {
  if (window.__bmaRec) return;
  window.__bmaRec = true;

  const TEXTLIKE = new Set(['text', 'email', 'search', 'url', 'tel', 'number', '']);
  const SENSITIVE_AUTOCOMPLETE = /^(current-password|new-password|one-time-code|cc-|cc$)/i;
  const SENSITIVE_WORDS = /\b(password|passcode|passwd|pwd|card number|credit card|cvv|cvc|security code|captcha|one[- ]time code|otp)\b/i;

  const send = (m) => {
    if (typeof window.__bmaEvent === 'function') {
      try {
        window.__bmaEvent(m);
      } catch {
        /* page is going away */
      }
    }
  };

  function fieldInfo(el) {
    const l = window.__bma.labelText(el);
    return {
      tag: el.tagName.toLowerCase(),
      inputType: (el.getAttribute('type') || '').toLowerCase(),
      name: el.getAttribute('name') || '',
      id: el.id || '',
      autocomplete: el.getAttribute('autocomplete') || '',
      label: l,
    };
  }

  function sensitiveReason(el) {
    const f = fieldInfo(el);
    if (f.inputType === 'password') return 'type="password" field';
    if (SENSITIVE_AUTOCOMPLETE.test(f.autocomplete)) return 'autocomplete="' + f.autocomplete + '"';
    const text = [f.name, f.id, f.label].filter(Boolean).join(' ').replace(/[_-]/g, ' ');
    if (SENSITIVE_WORDS.test(text)) return 'credential or payment field (' + text.trim() + ')';
    return '';
  }

  function textLike(el) {
    if (el.tagName === 'TEXTAREA') return true;
    return el.tagName === 'INPUT' && TEXTLIKE.has((el.getAttribute('type') || '').toLowerCase());
  }

  let pending = null;
  function emitFill(el) {
    const why = sensitiveReason(el);
    if (why) {
      send({ kind: 'refused', why, url: location.href });
      return;
    }
    send({ kind: 'fill', target: window.__bma.describe(el), value: el.value, url: location.href });
  }
  function flush() {
    if (!pending) return;
    clearTimeout(pending.timer);
    const el = pending.el;
    pending = null;
    emitFill(el);
  }
  window.__bmaFlush = flush;

  document.addEventListener(
    'input',
    (e) => {
      const el = e.target;
      if (!(el instanceof Element)) return;
      if ((el.tagName === 'INPUT' || el.tagName === 'TEXTAREA') && sensitiveReason(el)) {
        // report the refusal, never the value
        send({ kind: 'refused', why: sensitiveReason(el), url: location.href });
        return;
      }
      if (!textLike(el)) return;
      if (pending && pending.el !== el) flush();
      if (pending) clearTimeout(pending.timer);
      pending = { el, timer: setTimeout(flush, 400) };
    },
    true,
  );

  document.addEventListener(
    'change',
    (e) => {
      const el = e.target;
      if (!(el instanceof Element)) return;
      flush();
      if (el.tagName === 'SELECT') {
        send({ kind: 'select', target: window.__bma.describe(el), value: el.value, url: location.href });
      } else if (el.tagName === 'INPUT' && ['checkbox', 'radio'].includes((el.getAttribute('type') || '').toLowerCase())) {
        send({ kind: 'check', target: window.__bma.describe(el), checked: el.checked, url: location.href });
      }
    },
    true,
  );

  let lastEnter = 0;

  document.addEventListener(
    'click',
    (e) => {
      // Enter in a field makes the browser click the default button; that click is not a user action.
      if (e.detail === 0 && Date.now() - lastEnter < 300) return;
      const start = e.target;
      if (!(start instanceof Element)) return;
      const el = start.closest('a[href],button,summary,input,select,textarea,[role=button],[role=tab],[role=link],[role=menuitem]');
      if (!el) return;
      if (el.tagName === 'SELECT' || el.tagName === 'TEXTAREA') return;
      if (el.tagName === 'INPUT') {
        const t = (el.getAttribute('type') || 'text').toLowerCase();
        if (!['submit', 'button', 'image', 'reset'].includes(t)) return; // focus clicks; change events cover the rest
      }
      flush();
      send({ kind: 'click', target: window.__bma.describe(el), url: location.href });
    },
    true,
  );

  document.addEventListener(
    'keydown',
    (e) => {
      if (e.key !== 'Enter') return;
      lastEnter = Date.now();
      const el = e.target;
      if (!(el instanceof Element) || el.tagName === 'TEXTAREA' || el.tagName === 'BUTTON' || el.tagName === 'A') return;
      if (el.tagName !== 'INPUT' && el.tagName !== 'SELECT') return;
      flush();
      if (el.form) send({ kind: 'press', key: 'Enter', target: window.__bma.describe(el), url: location.href });
    },
    true,
  );

  document.addEventListener(
    'submit',
    (e) => {
      flush();
      const form = e.target;
      const sub = e.submitter;
      send({ kind: 'submit', target: window.__bma.describe(sub || form), url: location.href });
    },
    true,
  );

  window.addEventListener('pagehide', flush);
})();
