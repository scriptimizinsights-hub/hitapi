/**
 * workbench/views/curl-dialog.js — "Import cURL": paste a (multi-line) cURL command.
 * Pasting a cURL command straight into the URL bar does the same thing.
 */

import { h } from '../../ui/core/dom.js';
import { parseCurl } from '../../shared/curl.js';

export function openCurlDialog({ onImport }) {
  const area = h('textarea', { class: 'mono wb-curl-text', rows: '12', spellcheck: 'false', 'aria-label': 'cURL command',
    placeholder: "curl 'https://api.example.com/v1/users' \\\n  -H 'Authorization: Bearer <token>' \\\n  -H 'Content-Type: application/json' \\\n  --data-raw '{\"name\":\"Asha\"}'" });
  const error = h('div', { class: 'error', role: 'alert', hidden: true });
  const importBtn = h('button', { type: 'submit', class: 'btn-primary' }, 'Import');

  const close = () => { overlay.remove(); document.removeEventListener('keydown', onKey, true); };
  const submit = (e) => {
    e?.preventDefault();
    try {
      const parsed = parseCurl(area.value);
      close();
      onImport(parsed);
    } catch (err) {
      error.textContent = err.message;
      error.hidden = false;
    }
  };
  const onKey = (e) => {
    if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); close(); }
    else if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') { e.preventDefault(); e.stopPropagation(); submit(); }
  };
  area.addEventListener('input', () => { error.hidden = true; });

  const overlay = h('div', { class: 'wb-overlay', onclick: (e) => { if (e.target === overlay) close(); } },
    h('form', { class: 'wb-dialog', role: 'dialog', 'aria-modal': 'true', 'aria-label': 'Import cURL', onsubmit: submit },
      h('div', { class: 'wb-dialog-head' },
        h('strong', {}, 'Import cURL'),
        h('button', { type: 'button', class: 'btn-ghost btn-sm', onclick: close, 'aria-label': 'Close' }, '✕')),
      h('div', { class: 'muted small' }, 'Paste a cURL command. Works with "Copy as cURL" from Chrome, Firefox and Edge DevTools (bash or cmd), Postman, Insomnia and API docs.'),
      area, error,
      h('div', { class: 'wb-dialog-foot' },
        h('span', { class: 'muted small' }, 'Tip: you can also paste a cURL command straight into the URL bar. Ctrl/⌘ + Enter imports.'),
        h('button', { type: 'button', class: 'btn-ghost', onclick: close }, 'Cancel'),
        importBtn)));

  document.body.append(overlay);
  document.addEventListener('keydown', onKey, true);
  setTimeout(() => area.focus(), 0);
}
