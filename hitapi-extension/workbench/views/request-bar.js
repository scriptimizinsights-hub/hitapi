/**
 * workbench/views/request-bar.js — method, URL and Send/Cancel.
 */

import { h } from '../../ui/core/dom.js';
import { METHODS, methodProblem } from '../../shared/http.js';
import { looksLikeCurl } from '../../shared/curl.js';

const CUSTOM = '__custom__';

export function createRequestBar({ draft, onMethod, onUrl, onSend, onCancel, onCurl }) {
  const isStandard = (m) => METHODS.includes(String(m).toUpperCase());
  const select = h('select', { class: 'wb-method mono', 'aria-label': 'HTTP method' },
    METHODS.map(m => h('option', { value: m }, m)),
    h('option', { value: CUSTOM }, 'Custom…'));
  const custom = h('input', { type: 'text', class: 'wb-custom mono', placeholder: 'PURGE', 'aria-label': 'Custom method', spellcheck: 'false', maxlength: '32' });
  const url = h('input', { type: 'text', class: 'wb-url mono', placeholder: 'https://api.example.com/users?page=1   or   localhost:3000/health',
    'aria-label': 'Request URL', spellcheck: 'false', autocomplete: 'off' });
  const sendBtn = h('button', { type: 'submit', class: 'btn-primary wb-send', title: 'Send (Ctrl/⌘ + Enter)' }, 'Send');
  const hint = h('div', { class: 'wb-bar-hint error', role: 'alert', hidden: true });

  function setMethod(m) {
    const standard = isStandard(m);
    select.value = standard ? String(m).toUpperCase() : CUSTOM;
    custom.hidden = standard;
    if (!standard) custom.value = m;
    paintMethod();
  }
  function paintMethod() {
    const m = select.value === CUSTOM ? 'CUSTOM' : select.value;
    select.dataset.method = m;
  }

  select.addEventListener('change', () => {
    if (select.value === CUSTOM) { custom.hidden = false; custom.focus(); onMethod(custom.value.trim() || 'GET'); }
    else { custom.hidden = true; onMethod(select.value); }
    paintMethod();
  });
  custom.addEventListener('input', () => {
    const v = custom.value.trim();
    const p = v ? methodProblem(v) : null;
    custom.classList.toggle('invalid', !!p);
    custom.title = p || '';
    onMethod(v || 'GET');
  });
  url.addEventListener('paste', (e) => {
    const text = e.clipboardData?.getData('text') || '';
    if (looksLikeCurl(text)) { e.preventDefault(); onCurl(text); return; }   // a whole cURL command
    setTimeout(() => onUrl(url.value.trim()), 0);
  });
  url.addEventListener('input', () => onUrl(url.value));   // a typed cURL command is imported on Send

  let sending = false;
  const form = h('form', { class: 'wb-bar', onsubmit: (e) => { e.preventDefault(); sending ? onCancel() : onSend(); } },
    select, custom, url, sendBtn);

  setMethod(draft.method);
  url.value = draft.url;

  return {
    el: h('div', {}, form, hint),
    focusUrl: () => url.focus(),
    setUrl(v) { if (url.value !== v) url.value = v; },
    setMethod,
    setSending(on) {
      sending = on;
      sendBtn.textContent = on ? 'Cancel' : 'Send';
      sendBtn.classList.toggle('btn-danger', on);
      sendBtn.classList.toggle('btn-primary', !on);
      sendBtn.title = on ? 'Cancel (Esc)' : 'Send (Ctrl/⌘ + Enter)';
    },
    /** action: { label, fn } adds a button after the text (e.g. "Send anyway"). */
    showProblem(text, action = null) {
      hint.replaceChildren(text || '', action ? h('button', { type: 'button', class: 'btn-ghost btn-sm wb-hint-btn', onclick: action.fn }, action.label) : '');
      hint.hidden = !text;
    },
  };
}
