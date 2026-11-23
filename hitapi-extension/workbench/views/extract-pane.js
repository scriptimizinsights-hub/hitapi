/**
 * workbench/views/extract-pane.js — the "Set vars" tab (roadmap feature 7):
 * after each response, save values from it into variables, e.g. $.token → token.
 *
 *   draft.extract = [{ name, from: 'json' | 'header' | 'status', path, enabled }]
 */

import { h, mount } from '../../ui/core/dom.js';
import { isValidVarName } from '../../shared/vars.js';

const FROM = [['json', 'JSON body'], ['header', 'Header'], ['status', 'Status code']];
const PLACEHOLDER = { json: '$.data.token', header: 'Location', status: '' };

/**
 * @param {{ draft, onChange: () => void, target: () => string }} o  target(): where values go, e.g. 'the "Dev" environment'
 */
export function createExtractPane({ draft, onChange, target }) {
  if (!Array.isArray(draft.extract)) draft.extract = [];
  const rowsEl = h('div', { class: 'xt-rows' });
  const results = h('div', { class: 'xt-results small' });
  const where = h('span', {});
  const emit = () => onChange();

  function rowEl(r, i) {
    const check = h('input', { type: 'checkbox', checked: r.enabled !== false, 'aria-label': 'Use this rule', onchange: () => { r.enabled = check.checked; line.classList.toggle('off', !r.enabled); emit(); } });
    const name = h('input', { type: 'text', class: 'mono', value: r.name || '', placeholder: 'variable', spellcheck: 'false', 'aria-label': 'Variable to set' });
    const from = h('select', { 'aria-label': 'Take it from' }, FROM.map(([v, l]) => h('option', { value: v, selected: (r.from || 'json') === v }, l)));
    const path = h('input', { type: 'text', class: 'mono', value: r.path || '', placeholder: PLACEHOLDER[r.from || 'json'], spellcheck: 'false', 'aria-label': 'JSON path or header name', style: { visibility: r.from === 'status' ? 'hidden' : 'visible' } });
    const del = h('button', { type: 'button', class: 'btn-ghost btn-sm kv-del', 'aria-label': 'Delete rule', title: 'Delete', onclick: () => { draft.extract.splice(i, 1); paint(); emit(); } }, '✕');
    const paintName = () => { const bad = r.name && !isValidVarName(r.name.trim()); name.classList.toggle('invalid', !!bad); name.title = bad ? 'Use letters, digits, _ . or -, starting with a letter or _' : ''; };
    name.addEventListener('input', () => { r.name = name.value; paintName(); emit(); });
    from.addEventListener('change', () => { r.from = from.value; path.style.visibility = r.from === 'status' ? 'hidden' : 'visible'; path.placeholder = PLACEHOLDER[r.from]; emit(); });
    path.addEventListener('input', () => { r.path = path.value; emit(); });
    paintName();
    const line = h('div', { class: `xt-row${r.enabled === false ? ' off' : ''}` }, check, name, h('span', { class: 'muted small' }, '←'), from, path, del);
    return line;
  }

  function paint() {
    mount(where, target());
    mount(rowsEl, draft.extract.length ? draft.extract.map(rowEl) : h('div', { class: 'muted small xt-empty' }, 'No rules yet. Example: after a login request, save $.token into token, then use {{token}} in other requests.'));
  }

  const el = h('div', { class: 'xt' },
    h('div', { class: 'muted small' }, 'After each response, save values from it into variables in ', where, '.'),
    rowsEl,
    h('button', { type: 'button', class: 'btn-ghost btn-sm', onclick: () => { draft.extract.push({ name: '', from: 'json', path: '', enabled: true }); paint(); emit(); setTimeout(() => rowsEl.querySelector('.xt-row:last-child input[aria-label="Variable to set"]')?.focus(), 0); } }, '+ Add rule'),
    results);
  paint();

  return {
    el,
    refresh: paint,
    /** Show what the last response set: [{ name, ok, value, reason }] */
    showResults(list) {
      mount(results, list.length ? list.map(x => h('div', { class: x.ok ? 'text-green' : 'text-red' },
        x.ok ? `✓ ${x.name} set` : `✗ ${x.name} not set: ${x.reason}`)) : null);
    },
    count: () => draft.extract.filter(r => r.enabled !== false && r.name).length,
  };
}
