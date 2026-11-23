/**
 * workbench/views/import-dialog.js — "Import" (roadmap feature 10): a file, pasted text
 * or a URL → collections, environments or a request. The format is detected:
 * Postman collection or environment, OpenAPI / Swagger, HAR, Insomnia, HitAPI, cURL.
 */

import { h, mount } from '../../ui/core/dom.js';
import { openDialog } from './collection-dialogs.js';
import { detectFormat, FORMAT_LABELS } from '../../shared/convert/detect.js';
import { importPostman, importPostmanEnvironment } from '../../shared/convert/postman.js';
import { importOpenApi } from '../../shared/convert/openapi.js';
import { harSummary, importHar } from '../../shared/convert/har.js';
import { importInsomnia } from '../../shared/convert/insomnia.js';
import { importCollection, countRequests, newCollection, newRequest, requestName } from '../../shared/collections.js';
import { parseCurl } from '../../shared/curl.js';
import { draftFrom } from '../../shared/convert/draft.js';

/**
 * Turn detected content into what will be added.
 * @returns {{ collections: Array, envs: Array<{ name, vars }>, globals: Array, request?: object, notes: string[], summary: string }}
 */
export function convert({ format, data }, { sourceUrl = '', fileName = '', har = {} } = {}) {
  const out = { collections: [], envs: [], globals: [], notes: [], summary: '' };
  const n = (x, one, many) => `${x} ${x === 1 ? one : many}`;
  switch (format) {
    case 'hitapi': {
      const c = importCollection(data);
      out.collections.push(c);
      out.summary = `"${c.name}": ${n(countRequests(c), 'request', 'requests')}.`;
      if (!data.secrets) out.notes.push('The file was exported without secrets: fill in tokens and passwords again.');
      break;
    }
    case 'postman': {
      const r = importPostman(data);
      out.collections.push(r.collection); out.notes.push(...r.notes);
      out.summary = `"${r.collection.name}": ${n(r.stats.requests, 'request', 'requests')} in ${n(r.stats.folders, 'folder', 'folders')}, ${n(r.collection.settings.variables.length, 'variable', 'variables')}.`;
      break;
    }
    case 'postman-env': {
      const e = importPostmanEnvironment(data);
      if (e.scope === 'globals') { out.globals = e.vars; out.summary = `${n(e.vars.length, 'global variable', 'global variables')} (added to Globals; existing names are updated).`; }
      else { out.envs.push({ name: e.name, vars: e.vars }); out.summary = `Environment "${e.name}" with ${n(e.vars.length, 'variable', 'variables')}.`; }
      break;
    }
    case 'openapi': {
      const r = importOpenApi(data, { sourceUrl });
      out.collections.push(r.collection); out.notes.push(...r.notes);
      out.summary = `"${r.collection.name}": ${n(r.stats.requests, 'request', 'requests')} in ${n(r.stats.folders, 'folder', 'folders')} (one per tag). Base URL: ${r.collection.settings.baseUrl || '(none)'}.`;
      break;
    }
    case 'har': {
      const r = importHar(data, { name: har.name || (fileName ? fileName.replace(/\.har$/i, '') : 'HAR import'), onlyApi: har.onlyApi !== false, host: har.host || '', unique: har.unique !== false });
      out.collections.push(r.collection); out.notes.push(...r.notes);
      out.summary = `"${r.collection.name}": ${n(r.stats.requests, 'request', 'requests')}${r.stats.folders ? ` in ${n(r.stats.folders, 'folder', 'folders')} (one per host)` : ''}.`;
      break;
    }
    case 'insomnia': {
      const r = importInsomnia(data);
      out.collections.push(...r.collections); out.envs.push(...r.envs); out.notes.push(...r.notes);
      out.summary = `${n(r.collections.length, 'collection', 'collections')} with ${n(r.stats.requests, 'request', 'requests')}${r.envs.length ? `, ${n(r.envs.length, 'environment', 'environments')}` : ''}.`;
      break;
    }
    case 'curl': {
      const p = parseCurl(data);
      const d = draftFrom({ method: p.method, url: p.url, headers: p.headers.map(x => [x.key, x.value]), body: p.body || '' });
      if (p.auth?.type === 'basic') { d.auth.type = 'basic'; d.auth.basic = { username: p.auth.username, password: p.auth.password }; }
      out.request = newRequest(requestName(d), d);
      out.notes.push(...(p.warnings || []));
      out.summary = `One request: ${d.method} ${d.url}`;
      break;
    }
    default: throw new Error('Unsupported format');
  }
  return out;
}

/**
 * @param {{ tree, onImport: (result, { into }) => Promise<string> }} o
 *   onImport returns a short message for the toast.
 */
export function openImportDialog({ tree, onImport }) {
  let content = null;   // { text, fileName, sourceUrl }
  let detected = null;
  let preview = null;
  const har = { onlyApi: true, host: '', unique: true, name: '' };

  const file = h('input', { type: 'file', accept: '.json,.yaml,.yml,.har,.txt,application/json', hidden: true });
  const drop = h('div', { class: 'im-drop', tabindex: '0', role: 'button', 'aria-label': 'Choose a file to import' },
    h('strong', {}, 'Drop a file here or click to choose'),
    h('div', { class: 'muted small' }, 'Postman collection or environment · OpenAPI / Swagger (JSON or YAML) · HAR · Insomnia · HitAPI'));
  const paste = h('textarea', { class: 'mono im-paste', rows: '5', spellcheck: 'false', 'aria-label': 'Paste JSON, YAML or a cURL command', placeholder: 'Or paste JSON / YAML / a cURL command here' });
  const url = h('input', { type: 'text', class: 'cl-input mono', 'aria-label': 'URL of a spec or collection', placeholder: 'https://petstore3.swagger.io/api/v3/openapi.json', spellcheck: 'false' });
  const fetchBtn = h('button', { type: 'button', class: 'btn-ghost btn-sm' }, 'Fetch');
  const result = h('div', { class: 'im-result' });

  const load = (text, meta) => { content = { text, ...meta }; analyse(); };
  drop.addEventListener('click', () => file.click());
  drop.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); file.click(); } });
  drop.addEventListener('dragover', (e) => { e.preventDefault(); drop.classList.add('over'); });
  drop.addEventListener('dragleave', () => drop.classList.remove('over'));
  drop.addEventListener('drop', async (e) => { e.preventDefault(); drop.classList.remove('over'); const f = e.dataTransfer.files?.[0]; if (f) load(await f.text(), { fileName: f.name }); });
  file.addEventListener('change', async () => { const f = file.files?.[0]; if (f) load(await f.text(), { fileName: f.name }); });
  let pasteTimer = null;
  paste.addEventListener('input', () => { clearTimeout(pasteTimer); pasteTimer = setTimeout(() => (paste.value.trim() ? load(paste.value, { fileName: '' }) : (content = null, analyse())), 250); });
  fetchBtn.addEventListener('click', async () => {
    const u = url.value.trim();
    if (!/^https?:\/\//i.test(u)) { show(h('div', { class: 'error small' }, 'Enter a URL starting with http:// or https://')); return; }
    fetchBtn.disabled = true; fetchBtn.textContent = 'Fetching…';
    try {
      const res = await fetch(u, { headers: { Accept: 'application/json, application/yaml, text/yaml, */*' } });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      load(await res.text(), { sourceUrl: u, fileName: u.split('/').pop() });
    } catch (e) { show(h('div', { class: 'error small' }, `Couldn't download it: ${e.message}`)); }
    fetchBtn.disabled = false; fetchBtn.textContent = 'Fetch';
  });

  const show = (...nodes) => mount(result, nodes);
  const intoSelect = () => h('select', { class: 'cl-input', 'aria-label': 'Add the request to' },
    tree.items.map(c => h('option', { value: c.id }, c.name)), h('option', { value: '' }, '+ New collection "Imported requests"'));
  let into = null;

  function analyse() {
    detected = null; preview = null; submitBtn.disabled = true;
    if (!content) { show(); return; }
    try { detected = detectFormat(content.text); } catch (e) { show(h('div', { class: 'error small' }, e.message)); return; }
    try { preview = convert(detected, { sourceUrl: content.sourceUrl, fileName: content.fileName, har }); } catch (e) {
      show(h('div', { class: 'im-kind' }, `Detected: ${FORMAT_LABELS[detected.format]}`), detected.format === 'har' ? harOptions() : null, h('div', { class: 'error small' }, e.message));
      return;
    }
    into = detected.format === 'curl' ? intoSelect() : null;
    show(
      h('div', { class: 'im-kind' }, `Detected: ${FORMAT_LABELS[detected.format]}`, content.fileName ? h('span', { class: 'muted small' }, ` · ${content.fileName}`) : null),
      detected.format === 'har' ? harOptions() : null,
      h('div', { class: 'im-summary' }, preview.summary),
      into ? h('label', { class: 'cl-field' }, h('span', { class: 'ap-label' }, 'Add it to'), into) : null,
      preview.notes.length ? h('ul', { class: 'im-notes small' }, preview.notes.map(x => h('li', {}, x))) : null);
    submitBtn.disabled = false;
  }

  function harOptions() {
    let sum; try { sum = harSummary(detected.data); } catch { return null; }
    const host = h('select', { 'aria-label': 'Only this host' }, h('option', { value: '' }, `All hosts (${sum.hosts.length})`), sum.hosts.map(x => h('option', { value: x.host, selected: x.host === har.host }, `${x.host} (${x.count})`)));
    host.addEventListener('change', () => { har.host = host.value; analyse(); });
    const only = h('input', { type: 'checkbox', checked: har.onlyApi, onchange: (e) => { har.onlyApi = e.target.checked; analyse(); } });
    const uniq = h('input', { type: 'checkbox', checked: har.unique, onchange: (e) => { har.unique = e.target.checked; analyse(); } });
    return h('div', { class: 'im-har small' },
      h('div', { class: 'muted' }, `${sum.total} entries, ${sum.api} look like API calls.`),
      h('label', { class: 'check' }, only, ' Only API calls (fetch / XHR)'),
      h('label', { class: 'check' }, uniq, ' Skip repeats of the same method and URL'),
      h('label', { class: 'cl-field' }, h('span', { class: 'ap-label' }, 'Host'), host));
  }

  const d = openDialog({
    title: 'Import', wide: true,
    body: h('div', { class: 'cl-form' }, drop, file, paste,
      h('div', { class: 'im-url' }, url, fetchBtn),
      result),
    foot: (close) => [h('span', { class: 'muted small' }, 'Imported items are added next to your collections; nothing is replaced.'), h('span', { class: 'grow' }),
      h('button', { type: 'button', class: 'btn-ghost', onclick: close }, 'Cancel'), h('button', { type: 'submit', class: 'btn-primary', 'data-import': '' }, 'Import')],
    onSubmit: async () => {
      if (!preview) return;
      submitBtn.disabled = true;
      try {
        await onImport(preview, { into: into ? into.value : null });
        d.close();
      } catch (e) { d.error(e.message); submitBtn.disabled = false; }
    },
  });
  const submitBtn = d.form.querySelector('[data-import]');
  submitBtn.disabled = true;
  url.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); fetchBtn.click(); } });
  return d;
}

export { newCollection };
