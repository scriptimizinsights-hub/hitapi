/**
 * workbench/views/code-dialog.js — "Code": the request as cURL, JavaScript, Node.js,
 * Python, Go or PHP (roadmap feature 10). {{variables}} and the collection's
 * settings are filled in, as when sending.
 */

import { h, mount, toast, copyText } from '../../ui/core/dom.js';
import { openDialog } from './collection-dialogs.js';
import { LANGUAGES } from '../../shared/convert/codegen.js';
import { highlight } from './body/code-editor.js';

const KEY = 'hitapi:wbCodeLang';

/** @param {{ make: (lang: string) => string, note?: string }} o */
export function openCodeDialog({ make, note = '' }) {
  let lang = (() => { try { return localStorage.getItem(KEY) || 'curl'; } catch { return 'curl'; } })();
  if (!LANGUAGES.some(l => l.id === lang)) lang = 'curl';
  const tabs = h('div', { class: 'bp-types', role: 'radiogroup', 'aria-label': 'Language' });
  const pre = h('pre', { class: 'wb-pre mono cd-code' });
  let code = '';
  const paint = () => {
    mount(tabs, LANGUAGES.map(l => h('button', { type: 'button', role: 'radio', class: 'bp-type', 'aria-checked': String(l.id === lang), dataset: { lang: l.id },
      onclick: () => { lang = l.id; try { localStorage.setItem(KEY, lang); } catch { /* blocked */ } paint(); } }, l.label)));
    code = make(lang);
    highlight(pre, code, lang === 'curl' ? 'text' : 'json');
  };
  const d = openDialog({
    title: 'Code', wide: true,
    body: h('div', { class: 'cl-form' }, tabs, pre,
      h('div', { class: 'muted small' }, 'Variables and the collection\'s base URL, headers and auth are filled in. ', note)),
    foot: (close) => [h('span', { class: 'grow' }), h('button', { type: 'button', class: 'btn-ghost', onclick: close }, 'Close'),
      h('button', { type: 'submit', class: 'btn-primary' }, 'Copy')],
    onSubmit: async () => { toast(await copyText(code) ? 'Copied' : 'Could not copy', 'ok'); },
  });
  paint();
  return d;
}
