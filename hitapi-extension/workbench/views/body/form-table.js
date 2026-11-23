/**
 * workbench/views/body/form-table.js — multipart form fields: text or file.
 * File objects are kept in memory (files.form: Map rowId → File); the draft
 * remembers only the file name, so after a reload the file must be picked again.
 */

import { h } from '../../../ui/core/dom.js';
import { rowId } from '../../../shared/body.js';
import { formatBytes } from '../../../shared/http.js';

export function createFormTable({ rows, files, onChange }) {
  let data = rows.map(r => ({ ...r }));
  const body = h('div', { class: 'kv-rows' });
  const el = h('div', { class: 'kv' },
    h('div', { class: 'kv-toolbar' },
      h('span', { class: 'muted small' }, 'Sent as multipart/form-data. Files stay on this computer until you send.'),
      h('button', { type: 'button', class: 'btn-ghost btn-sm', onclick: () => { data.push({ id: rowId(), key: '', value: '', kind: 'text', enabled: true }); render(); emit(); } }, '+ Add field')),
    body);
  const emit = () => onChange(data.map(r => ({ ...r })));

  function rowEl(row, index) {
    const check = h('input', { type: 'checkbox', checked: row.enabled !== false, 'aria-label': 'Send this field',
      onchange: () => { row.enabled = check.checked; line.classList.toggle('off', !row.enabled); emit(); } });
    const key = h('input', { type: 'text', class: 'mono', value: row.key, placeholder: 'Field name', 'aria-label': 'Field name', spellcheck: 'false' });
    key.addEventListener('input', () => { row.key = key.value; emit(); });
    const kind = h('select', { class: 'ft-kind', 'aria-label': 'Field type' },
      h('option', { value: 'text', selected: row.kind !== 'file' }, 'Text'),
      h('option', { value: 'file', selected: row.kind === 'file' }, 'File'));
    kind.addEventListener('change', () => { row.kind = kind.value; render(); emit(); });

    let valueCell;
    if (row.kind === 'file') {
      const input = h('input', { type: 'file', hidden: true, 'aria-label': `File for ${row.key || 'field'}` });
      const file = files.form.get(row.id);
      const name = h('span', { class: `ft-file ${!file && row.fileName ? 'ft-missing' : ''}` },
        file ? `${file.name} · ${formatBytes(file.size)}` : row.fileName ? `${row.fileName} — pick it again` : 'No file chosen');
      input.addEventListener('change', () => {
        const f = input.files?.[0];
        if (!f) return;
        files.form.set(row.id, f);
        row.fileName = f.name;
        render(); emit();
      });
      valueCell = h('div', { class: 'ft-filecell' },
        h('button', { type: 'button', class: 'btn-ghost btn-sm', onclick: () => input.click() }, file ? 'Change' : 'Choose file'), name, input);
    } else {
      const value = h('input', { type: 'text', class: 'mono', value: row.value ?? '', placeholder: 'Value', 'aria-label': 'Field value', spellcheck: 'false' });
      value.addEventListener('input', () => { row.value = value.value; emit(); });
      valueCell = value;
    }
    const del = h('button', { type: 'button', class: 'btn-ghost btn-sm kv-del', 'aria-label': 'Delete field',
      onclick: () => { files.form.delete(row.id); data.splice(index, 1); render(); emit(); } }, '✕');
    const line = h('div', { class: `ft-row${row.enabled === false ? ' off' : ''}` }, check, key, kind, valueCell, del);
    return line;
  }

  function render() {
    if (!data.length) data.push({ id: rowId(), key: '', value: '', kind: 'text', enabled: true });
    body.replaceChildren(...data.map(rowEl));
  }
  render();
  return { el, setRows(next) { data = next.map(r => ({ ...r })); render(); } };
}
