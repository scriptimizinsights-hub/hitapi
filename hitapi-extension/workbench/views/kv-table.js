/**
 * workbench/views/kv-table.js — editable key/value rows (query params, headers).
 *
 * Each row has an on/off switch, key, value and delete. There is always one
 * blank row at the end: typing into it adds a row. A "Bulk edit" mode shows
 * the rows as text ("key: value" per line; "//" at the start = switched off).
 */

import { h } from '../../ui/core/dom.js';

let listSeq = 0;

/**
 * @param {object} opts
 * @param {'params'|'headers'} opts.kind
 * @param {Array} opts.rows                 initial rows [{ key, value, enabled }]
 * @param {(rows: Array) => void} opts.onChange
 * @param {(key: string) => {text, tone}|null} [opts.badgeFor]  note shown next to a row
 * @param {string[]} [opts.keySuggestions]
 * @param {(key: string) => string[]} [opts.valueSuggestions]
 */
export function createKvTable({ kind, rows, onChange, badgeFor = () => null, keySuggestions = [], valueSuggestions = () => [], hint = null }) {
  let data = rows.map(r => ({ ...r }));
  let bulk = false;
  const sep = kind === 'headers' ? ': ' : '=';

  const keyListId = `kv-keys-${kind}-${++listSeq}`;
  const keyList = h('datalist', { id: keyListId }, keySuggestions.map(k => h('option', { value: k })));
  const body = h('div', { class: 'kv-rows' });
  const bulkArea = h('textarea', { class: 'kv-bulk mono', rows: '8', spellcheck: 'false', hidden: true,
    'aria-label': kind === 'headers' ? 'Headers as text' : 'Query parameters as text' });
  const bulkBtn = h('button', { type: 'button', class: 'btn-ghost btn-sm', onclick: () => toggleBulk() }, 'Bulk edit');
  const el = h('div', { class: 'kv' },
    h('div', { class: 'kv-toolbar' },
      h('span', { class: 'muted small' }, hint || (kind === 'headers'
        ? 'Switch a header off to keep it without sending it.'
        : 'Query parameters stay in sync with the URL.')),
      bulkBtn),
    body, bulkArea, keyList);

  const emit = () => onChange(data.filter(r => String(r.key).length || String(r.value).length).map(r => ({ ...r })));

  function rowEl(row, index, isBlank) {
    const valueListId = `${keyListId}-v${index}`;
    const valueList = h('datalist', { id: valueListId });
    const fillValues = () => valueList.replaceChildren(...valueSuggestions(row.key).map(v => h('option', { value: v })));
    fillValues();

    const badge = h('span', { class: 'kv-badge' });
    const paintBadge = () => {
      const b = !isBlank && row.key ? badgeFor(row.key) : null;
      badge.hidden = !b;
      badge.textContent = b?.text || '';
      badge.className = `kv-badge kv-badge-${b?.tone || 'info'}`;
      badge.title = b?.title || '';
    };
    paintBadge();

    const check = h('input', { type: 'checkbox', checked: row.enabled !== false, disabled: isBlank,
      'aria-label': 'Send this row', onchange: () => { row.enabled = check.checked; line.classList.toggle('off', !row.enabled); emit(); } });
    const key = h('input', { type: 'text', class: 'mono', value: row.key ?? '', placeholder: kind === 'headers' ? 'Header' : 'Key',
      list: kind === 'headers' ? keyListId : null, spellcheck: 'false', 'aria-label': kind === 'headers' ? 'Header name' : 'Parameter name' });
    const value = h('input', { type: 'text', class: 'mono', value: row.value ?? '', placeholder: 'Value', list: valueListId,
      spellcheck: 'false', 'aria-label': kind === 'headers' ? 'Header value' : 'Parameter value' });
    const del = h('button', { type: 'button', class: 'btn-ghost btn-sm kv-del', title: 'Delete row', 'aria-label': 'Delete row',
      hidden: isBlank, onclick: () => { data.splice(index, 1); render(); emit(); } }, '✕');

    const onType = (field, input) => () => {
      row[field] = input.value;
      if (isBlank && input.value) {
        // the blank row becomes a real row; add a new blank one below
        isBlank = false; row.enabled = true; data.push(row);
        check.disabled = false; check.checked = true; del.hidden = false;
        body.append(rowEl({ key: '', value: '', enabled: true }, data.length, true));
      }
      if (field === 'key') { fillValues(); paintBadge(); }
      emit();
    };
    key.addEventListener('input', onType('key', key));
    value.addEventListener('input', onType('value', value));

    const line = h('div', { class: `kv-row${row.enabled === false ? ' off' : ''}` }, check, key, h('div', { class: 'kv-val' }, value, badge), del, valueList);
    return line;
  }

  function render() {
    body.replaceChildren(...data.map((r, i) => rowEl(r, i, false)), rowEl({ key: '', value: '', enabled: true }, data.length, true));
  }

  function toText() {
    return data.filter(r => r.key || r.value).map(r => `${r.enabled === false ? '//' : ''}${r.key}${sep}${r.value}`).join('\n');
  }

  function fromText(text) {
    return text.split('\n').map(l => l.replace(/\r$/, '')).filter(l => l.trim()).map(line => {
      let enabled = true;
      let s = line.trim();
      if (s.startsWith('//')) { enabled = false; s = s.slice(2).trim(); }
      const at = kind === 'headers' ? s.indexOf(':') : s.indexOf('=');
      return at >= 0
        ? { key: s.slice(0, at).trim(), value: s.slice(at + 1).replace(/^ /, ''), enabled }
        : { key: s, value: '', enabled };
    });
  }

  function toggleBulk() {
    bulk = !bulk;
    if (bulk) { bulkArea.value = toText(); }
    else { data = fromText(bulkArea.value); render(); emit(); }
    body.hidden = bulk; bulkArea.hidden = !bulk;
    bulkBtn.textContent = bulk ? 'Key/value edit' : 'Bulk edit';
    bulkBtn.classList.toggle('pressed', bulk);
  }
  bulkArea.addEventListener('input', () => { data = fromText(bulkArea.value); emit(); });
  bulkArea.placeholder = kind === 'headers' ? 'Content-Type: application/json\n//X-Off: switched off' : 'page=1\n//debug=true';

  render();

  return {
    el,
    /** Replace the rows from outside (e.g. the URL changed). */
    setRows(next) {
      data = next.map(r => ({ ...r }));
      if (bulk) bulkArea.value = toText(); else render();
    },
  };
}
