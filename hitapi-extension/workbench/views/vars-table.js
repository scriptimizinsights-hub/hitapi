/**
 * workbench/views/vars-table.js — a table of variables (roadmap feature 7):
 * name, value, secret, on/off. Used for globals, environments, collections and folders.
 */

import { h } from '../../ui/core/dom.js';
import { isValidVarName, normalizeRows } from '../../shared/vars.js';

/**
 * @param {{ rows: Array, onChange: (rows) => void, hint?: string }} o
 */
export function createVarsTable({ rows, onChange, hint = null }) {
  let data = normalizeRows(rows);
  const body = h('div', { class: 'vt-rows' });
  const el = h('div', { class: 'vt' },
    hint ? h('div', { class: 'muted small' }, hint) : null,
    h('div', { class: 'vt-head muted small' }, h('span', {}), h('span', {}, 'Variable'), h('span', {}, 'Value'), h('span', { title: 'Secret: hidden on screen, left out of exports' }, 'Secret'), h('span', {})),
    body);
  const emit = () => onChange(data.filter(r => r.key.length || r.value.length).map(r => ({ ...r })));

  function rowEl(row, index, isBlank) {
    const check = h('input', { type: 'checkbox', checked: row.enabled, disabled: isBlank, 'aria-label': 'Use this variable',
      onchange: () => { row.enabled = check.checked; line.classList.toggle('off', !row.enabled); emit(); } });
    const key = h('input', { type: 'text', class: 'mono', value: row.key, placeholder: 'name', spellcheck: 'false', 'aria-label': 'Variable name' });
    const value = h('input', { type: row.secret ? 'password' : 'text', class: 'mono', value: row.value, placeholder: 'value', spellcheck: 'false', autocomplete: 'off', 'aria-label': 'Variable value' });
    const secret = h('input', { type: 'checkbox', checked: row.secret, 'aria-label': 'Secret',
      onchange: () => { row.secret = secret.checked; value.type = row.secret ? 'password' : 'text'; if (!isBlank) emit(); } });
    const del = h('button', { type: 'button', class: 'btn-ghost btn-sm kv-del', title: 'Delete', 'aria-label': 'Delete variable', hidden: isBlank,
      onclick: () => { data.splice(index, 1); render(); emit(); } }, '✕');
    const paintKey = () => {
      const bad = row.key && !isValidVarName(row.key.trim());
      key.classList.toggle('invalid', !!bad);
      key.title = bad ? 'Use letters, digits, _ . or -, starting with a letter or _' : '';
    };
    const onType = (field, input) => () => {
      row[field] = input.value;
      if (isBlank && input.value) {
        isBlank = false; row.enabled = true; data.push(row);
        check.disabled = false; check.checked = true; del.hidden = false;
        body.append(rowEl({ key: '', value: '', secret: false, enabled: true }, data.length, true));
      }
      if (field === 'key') paintKey();
      emit();
    };
    key.addEventListener('input', onType('key', key));
    value.addEventListener('input', onType('value', value));
    value.addEventListener('focus', () => { if (row.secret) value.type = 'text'; });
    value.addEventListener('blur', () => { if (row.secret) value.type = 'password'; });
    paintKey();
    const line = h('div', { class: `vt-row${row.enabled ? '' : ' off'}` }, check, key, value, h('label', { class: 'vt-secret' }, secret), del);
    return line;
  }

  function render() {
    body.replaceChildren(...data.map((r, i) => rowEl(r, i, false)), rowEl({ key: '', value: '', secret: false, enabled: true }, data.length, true));
  }
  render();
  return { el, setRows(next) { data = normalizeRows(next); render(); } };
}
