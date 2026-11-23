/**
 * workbench/views/collection-dialogs.js — dialogs for collections (roadmap feature 6):
 * Save request, collection/folder settings, export, send to / import from HitAPI.
 */

import { h, mount, toast } from '../../ui/core/dom.js';
import { call } from '../../ui/core/bridge.js';
import { MSG, ERR } from '../../shared/messages.js';
import { DASHBOARD_URL } from '../../shared/config.js';
import { containerOptions, find, inheritedAuth, exportCollection } from '../../shared/collections.js';
import { authSummary } from '../../shared/auth.js';
import { COMMON_HEADERS, COMMON_VALUES } from '../../shared/http.js';
import { createKvTable } from './kv-table.js';
import { createAuthPane } from './auth-pane.js';
import { createVarsTable } from './vars-table.js';
import { exportPostman } from '../../shared/convert/postman.js';
import { exportOpenApi } from '../../shared/convert/openapi.js';
import { fileSafe } from '../../shared/convert/draft.js';
import yaml from '../../lib/js-yaml.mjs';

/** A modal dialog. Returns { close, form, error(text) }. */
export function openDialog({ title, body, foot, onSubmit, wide = false, label }) {
  const err = h('div', { class: 'error', role: 'alert', hidden: true });
  const close = () => { overlay.remove(); document.removeEventListener('keydown', onKey, true); };
  const onKey = (e) => { if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); close(); } };
  const form = h('form', { class: `wb-dialog${wide ? ' wb-dialog-wide' : ' wb-dialog-narrow'}`, role: 'dialog', 'aria-modal': 'true', 'aria-label': label || title,
    onsubmit: (e) => { e.preventDefault(); onSubmit?.(); } },
  h('div', { class: 'wb-dialog-head' }, h('strong', {}, title), h('button', { type: 'button', class: 'btn-ghost btn-sm', onclick: close, 'aria-label': 'Close' }, '✕')),
  body, err,
  h('div', { class: 'wb-dialog-foot' }, foot(close)));
  const overlay = h('div', { class: 'wb-overlay', onclick: (e) => { if (e.target === overlay) close(); } }, form);
  document.body.append(overlay);
  document.addEventListener('keydown', onKey, true);
  setTimeout(() => form.querySelector('input:not([type=checkbox]), select, textarea')?.focus(), 0);
  return { close, form, error: (t) => { err.textContent = t || ''; err.hidden = !t; } };
}

const NEW_COLLECTION = '__new__';

/**
 * Save the current request.
 * onSave({ name, parentId | null, newCollectionName }) — parentId null means "new collection".
 */
export function openSaveDialog({ tree, defaultName, defaultParentId, title = 'Save request', onSave }) {
  const name = h('input', { type: 'text', value: defaultName, 'aria-label': 'Request name', maxlength: '120', class: 'cl-input' });
  const opts = containerOptions(tree);
  const parent = h('select', { 'aria-label': 'Save in', class: 'cl-input' },
    opts.map(op => h('option', { value: op.id, selected: op.id === defaultParentId }, `${'   '.repeat(op.depth)}${op.type === 'collection' ? '▣' : '▤'} ${op.label}`)),
    h('option', { value: NEW_COLLECTION, selected: !opts.length }, '+ New collection…'));
  const newName = h('input', { type: 'text', value: 'My API', 'aria-label': 'New collection name', maxlength: '120', class: 'cl-input' });
  const newWrap = h('label', { class: 'cl-field' }, h('span', { class: 'ap-label' }, 'New collection name'), newName);
  const paintNew = () => { newWrap.hidden = parent.value !== NEW_COLLECTION; };
  parent.addEventListener('change', paintNew);
  paintNew();
  const d = openDialog({
    title,
    body: h('div', { class: 'cl-form' },
      h('label', { class: 'cl-field' }, h('span', { class: 'ap-label' }, 'Name'), name),
      h('label', { class: 'cl-field' }, h('span', { class: 'ap-label' }, 'Save in'), parent),
      newWrap,
      h('div', { class: 'muted small' }, 'Saved in this browser. Requests in a collection can use its base URL, headers and auth: start the URL with "/" and choose "Inherit" in the Auth tab.')),
    foot: (close) => [h('span', { class: 'grow' }), h('button', { type: 'button', class: 'btn-ghost', onclick: close }, 'Cancel'), h('button', { type: 'submit', class: 'btn-primary' }, 'Save')],
    onSubmit: async () => {
      if (!name.value.trim()) { d.error('Enter a name'); return; }
      const isNew = parent.value === NEW_COLLECTION;
      if (isNew && !newName.value.trim()) { d.error('Enter a name for the new collection'); return; }
      try {
        await onSave({ name: name.value.trim(), parentId: isNew ? null : parent.value, newCollectionName: newName.value.trim() });
        d.close();
      } catch (e) { d.error(e.message); }
    },
  });
  setTimeout(() => name.select(), 0);
  return d;
}

/** Collection or folder settings: name, base URL (collection), headers, auth. onSave({ name, settings }) */
export function openSettingsDialog({ tree, id, onSave }) {
  const f = find(tree, id);
  if (!f) return null;
  const node = f.node;
  const isCol = node.type === 'collection';
  const settings = structuredClone(node.settings);
  const holder = { auth: settings.auth };   // the auth pane edits holder.auth
  const name = h('input', { type: 'text', value: node.name, 'aria-label': 'Name', maxlength: '120', class: 'cl-input' });
  const baseUrl = isCol ? h('input', { type: 'text', value: settings.baseUrl || '', class: 'cl-input mono', 'aria-label': 'Base URL', placeholder: 'https://api.example.com/v1', spellcheck: 'false' }) : null;
  const headers = createKvTable({ kind: 'headers', rows: settings.headers, onChange: (rows) => { settings.headers = rows; },
    keySuggestions: COMMON_HEADERS, valueSuggestions: (k) => COMMON_VALUES[String(k).trim().toLowerCase()] || [] });
  const parentAuth = () => {
    const { auth, from } = inheritedAuth(f.ancestors);
    const s = authSummary(auth);
    return s ? `Uses the auth of "${from?.name}": ${s.text}` : `"${from?.name || 'The collection'}" sets no auth, so none is added.`;
  };
  const auth = createAuthPane({ draft: holder, onChange: () => {}, inherit: isCol ? null : { label: 'Inherit', describe: parentAuth } });
  settings.variables = settings.variables || [];
  const vars = createVarsTable({ rows: settings.variables, onChange: (rows) => { settings.variables = rows; } });
  const d = openDialog({
    title: isCol ? 'Collection settings' : 'Folder settings', wide: true,
    body: h('div', { class: 'cl-form' },
      h('label', { class: 'cl-field' }, h('span', { class: 'ap-label' }, 'Name'), name),
      isCol ? h('label', { class: 'cl-field' }, h('span', { class: 'ap-label' }, 'Base URL'), baseUrl,
        h('span', { class: 'muted small' }, 'Requests whose URL starts with "/" are sent to this base URL, e.g. /users → https://api.example.com/v1/users.')) : null,
      h('div', { class: 'cl-section' }, h('strong', {}, 'Headers'), h('span', { class: 'muted small' }, ` sent with every request in this ${isCol ? 'collection' : 'folder'}; a request's own header with the same name wins.`)),
      headers.el,
      h('div', { class: 'cl-section' }, h('strong', {}, 'Auth'), h('span', { class: 'muted small' }, ' used by requests whose Auth tab says "Inherit".')),
      auth.el,
      h('div', { class: 'cl-section' }, h('strong', {}, 'Variables'), h('span', { class: 'muted small' },
        ` for the requests in this ${isCol ? 'collection' : 'folder'}, as {{name}}. The environment you pick overrides a variable with the same name.`)),
      vars.el),
    foot: (close) => [h('span', { class: 'grow' }), h('button', { type: 'button', class: 'btn-ghost', onclick: close }, 'Cancel'), h('button', { type: 'submit', class: 'btn-primary' }, 'Save settings')],
    onSubmit: async () => {
      if (!name.value.trim()) { d.error('Enter a name'); return; }
      if (isCol) {
        const b = baseUrl.value.trim();
        if (b && !b.startsWith('{{') && !/^https?:\/\/[^\s/]+/i.test(b) && !/^(localhost|127\.0\.0\.1|\[::1\])(:\d+)?/i.test(b)) { d.error('The base URL must start with http:// or https:// (or be a {{variable}})'); return; }
        settings.baseUrl = b && !b.startsWith('{{') && !/^https?:\/\//i.test(b) ? `http://${b}` : b;
      }
      settings.auth = holder.auth;
      settings.headers = settings.headers.filter(r => String(r.key || '').trim() || String(r.value || '').trim());
      settings.variables = settings.variables.filter(r => r.key.trim());
      try { await onSave({ name: name.value.trim(), settings }); d.close(); } catch (e) { d.error(e.message); }
    },
  });
  return d;
}

export function download(name, text, type = 'application/json') {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = h('a', { href: url, download: name });
  document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}

export function openExportDialog({ tree, id }) {
  const f = find(tree, id);
  if (!f) return null;
  const secrets = h('input', { type: 'checkbox' });
  const FORMATS = [
    ['hitapi', 'HitAPI collection (.hitapi.json)', 'Everything, to import into HitAPI on another computer.'],
    ['postman', 'Postman collection v2.1 (.json)', 'Opens in Postman, Insomnia, Bruno and others. Tests and Set vars rules become Postman scripts.'],
    ['openapi-json', 'OpenAPI 3 (.json)', 'A best-effort API description: one path per request, example bodies, tags from folders. No secrets.'],
    ['openapi-yaml', 'OpenAPI 3 (.yaml)', 'The same, as YAML.'],
  ];
  const fmt = h('select', { class: 'cl-input', 'aria-label': 'Export format' }, FORMATS.map(([v, l]) => h('option', { value: v }, l)));
  const about = h('div', { class: 'muted small' });
  const secretsRow = h('label', { class: 'check small' }, secrets, h('span', {}, h('strong', {}, 'Include secrets'),
    h('div', { class: 'muted' }, 'Tokens, passwords, API keys, secret variables and Authorization/Cookie headers. Leave this off if you will share the file.')));
  const paint = () => { about.textContent = FORMATS.find(x => x[0] === fmt.value)[2]; secretsRow.hidden = fmt.value.startsWith('openapi'); };
  fmt.addEventListener('change', paint);
  paint();
  const d = openDialog({
    title: `Export "${f.node.name}"`,
    body: h('div', { class: 'cl-form' },
      h('label', { class: 'cl-field' }, h('span', { class: 'ap-label' }, 'Format'), fmt), about, secretsRow),
    foot: (close) => [h('span', { class: 'grow' }), h('button', { type: 'button', class: 'btn-ghost', onclick: close }, 'Cancel'), h('button', { type: 'submit', class: 'btn-primary' }, 'Download')],
    onSubmit: () => {
      const base = fileSafe(f.node.name);
      const data = exportCollection(f.node, { secrets: fmt.value === 'hitapi' || fmt.value === 'postman' ? secrets.checked : false });
      let file; let text; let type = 'application/json';
      if (fmt.value === 'hitapi') { file = `${base}.hitapi.json`; text = JSON.stringify(data, null, 2); }
      else if (fmt.value === 'postman') { file = `${base}.postman_collection.json`; text = JSON.stringify(exportPostman(data.collection), null, 2); }
      else if (fmt.value === 'openapi-json') { file = `${base}.openapi.json`; text = JSON.stringify(exportOpenApi(data.collection), null, 2); }
      else { file = `${base}.openapi.yaml`; text = yaml.dump(exportOpenApi(data.collection), { noRefs: true, lineWidth: 120 }); type = 'application/yaml'; }
      download(file, text, type);
      d.close();
      toast(`Exported ${file}`, 'ok');
    },
  });
  return d;
}

/** Projects of the signed-in user, or a friendly reason why there are none. */
export async function loadProjects() {
  try { return { projects: await call(MSG.LIST_PROJECTS) }; } catch (e) {
    if (e.code === ERR.NOT_LOGGED_IN || e.code === ERR.AUTH_EXPIRED) return { signedOut: true };
    return { error: e.message };
  }
}

export const signedOutNote = () => h('div', { class: 'cl-note' },
  h('strong', {}, 'Sign in to HitAPI first.'),
  h('div', { class: 'muted small' }, 'Open the HitAPI popup from the toolbar and sign in (a free account works), then try again. Collections themselves work without an account.'));

/**
 * Send a collection's requests to a HitAPI project as endpoints.
 * endpoints(projectBaseUrl) → the list to send. onLinked(projectId) remembers the project on the collection.
 */
export async function openPushDialog({ collection, endpoints, onLinked }) {
  const body = h('div', { class: 'cl-form' }, h('div', { class: 'muted small' }, 'Loading your HitAPI projects…'));
  let submit = () => {};
  const d = openDialog({
    title: `Send "${collection.name}" to HitAPI`, body,
    foot: (close) => [h('span', { class: 'grow' }), h('button', { type: 'button', class: 'btn-ghost', onclick: close }, 'Close'), h('button', { type: 'submit', class: 'btn-primary', 'data-push': '' }, 'Send')],
    onSubmit: () => submit(),
  });
  const sendBtn = d.form.querySelector('[data-push]');
  sendBtn.disabled = true;
  const res = await loadProjects();
  if (res.signedOut) { mount(body, signedOutNote()); return d; }
  if (res.error) { mount(body, h('div', { class: 'error' }, res.error)); return d; }
  const NEW = '__new__';
  const pick = h('select', { class: 'cl-input', 'aria-label': 'HitAPI project' },
    res.projects.map(p => h('option', { value: p.id, selected: p.id === collection.hitapiProjectId }, `${p.name}${p.base_url ? ` (${p.base_url})` : ''}`)),
    h('option', { value: NEW, selected: !res.projects.some(p => p.id === collection.hitapiProjectId) && !res.projects.length }, '+ New project…'));
  const pname = h('input', { type: 'text', class: 'cl-input', value: collection.name, 'aria-label': 'Project name' });
  const pbase = h('input', { type: 'text', class: 'cl-input mono', value: collection.settings.baseUrl || '', placeholder: 'https://api.example.com', 'aria-label': 'Project base URL' });
  const newWrap = h('div', { class: 'cl-form' },
    h('label', { class: 'cl-field' }, h('span', { class: 'ap-label' }, 'Project name'), pname),
    h('label', { class: 'cl-field' }, h('span', { class: 'ap-label' }, 'Base URL'), pbase));
  const preview = h('div', { class: 'muted small' });
  const result = h('div', {});
  const projectOf = () => res.projects.find(p => p.id === pick.value);
  const paint = () => {
    newWrap.hidden = pick.value !== NEW;
    const all = endpoints(pick.value === NEW ? pbase.value.trim() : projectOf()?.base_url || '');
    const list = all.filter(e => !e.outside);
    const out = all.filter(e => e.outside);
    mount(preview, `${list.length} request${list.length === 1 ? '' : 's'} will be added as endpoints (`,
      list.slice(0, 3).map((e, i) => [i ? ', ' : '', h('code', {}, `${e.method} ${e.path}`)]), list.length > 3 ? ', …' : '',
      '). Endpoints the project already has (same method and path) are left as they are. Secrets are never sent.',
      out.length ? h('div', { class: 'wb-warn-text' }, `${out.length} request${out.length === 1 ? ' is' : 's are'} not under the project's base URL and will be left out: `,
        out.slice(0, 3).map((e, i) => [i ? ', ' : '', h('code', {}, `${e.method} ${e.url}`)]), out.length > 3 ? ', …' : '') : null);
    sendBtn.disabled = !list.length;
  };
  pick.addEventListener('change', paint); pbase.addEventListener('input', paint);
  mount(body,
    h('div', { class: 'muted small' }, 'Adds your saved requests to a HitAPI project, so the web app can generate tests and mock data for them.'),
    h('label', { class: 'cl-field' }, h('span', { class: 'ap-label' }, 'Project'), pick), newWrap, preview, result);
  paint();
  submit = async () => {
    d.error('');
    sendBtn.disabled = true; sendBtn.textContent = 'Sending…';
    try {
      let project = projectOf();
      if (pick.value === NEW) project = await call(MSG.CREATE_PROJECT, { name: pname.value, baseUrl: pbase.value });
      const list = endpoints(project.base_url || '').filter(e => !e.outside);
      const out = await call(MSG.WB_PUSH_ENDPOINTS, { projectId: project.id, endpoints: list });
      await onLinked?.(project.id);
      mount(result, h('div', { class: 'cl-note ok' },
        h('strong', {}, `✓ Added ${out.created} endpoint${out.created === 1 ? '' : 's'} to "${project.name}".`),
        out.skipped ? h('div', { class: 'muted small' }, `${out.skipped} ${out.skipped === 1 ? 'was' : 'were'} already there.`) : null,
        out.failed.length ? h('div', { class: 'error small' }, `${out.failed.length} failed: ${out.failed.slice(0, 3).map(x => `${x.key} (${x.error})`).join('; ')}`) : null,
        h('a', { href: `${DASHBOARD_URL.replace(/\/+$/, '')}/projects/${encodeURIComponent(project.id)}`, target: '_blank', rel: 'noopener' }, 'Open the project in HitAPI ↗')));
      sendBtn.textContent = 'Send again';
    } catch (e) {
      if (e.code === ERR.NOT_LOGGED_IN || e.code === ERR.AUTH_EXPIRED) mount(body, signedOutNote());
      else d.error(e.message);
      sendBtn.textContent = 'Send';
    }
    sendBtn.disabled = false;
  };
  return d;
}

/** Make a collection from a HitAPI project's endpoints. onImport(project, endpoints) */
export async function openPullDialog({ onImport }) {
  const body = h('div', { class: 'cl-form' }, h('div', { class: 'muted small' }, 'Loading your HitAPI projects…'));
  let submit = () => {};
  const d = openDialog({
    title: 'Import from a HitAPI project', body,
    foot: (close) => [h('span', { class: 'grow' }), h('button', { type: 'button', class: 'btn-ghost', onclick: close }, 'Cancel'), h('button', { type: 'submit', class: 'btn-primary', 'data-pull': '' }, 'Import')],
    onSubmit: () => submit(),
  });
  const btn = d.form.querySelector('[data-pull]');
  btn.disabled = true;
  const res = await loadProjects();
  if (res.signedOut) { mount(body, signedOutNote()); return d; }
  if (res.error) { mount(body, h('div', { class: 'error' }, res.error)); return d; }
  if (!res.projects.length) { mount(body, h('div', { class: 'muted small' }, 'You have no HitAPI projects yet. Create one in the web app, or send a collection to HitAPI.')); return d; }
  const pick = h('select', { class: 'cl-input', 'aria-label': 'HitAPI project' }, res.projects.map(p => h('option', { value: p.id }, `${p.name}${p.base_url ? ` (${p.base_url})` : ''}`)));
  mount(body,
    h('div', { class: 'muted small' }, 'Creates a collection with one request per endpoint (a folder per tag), using the project\'s base URL. Your project in HitAPI is not changed.'),
    h('label', { class: 'cl-field' }, h('span', { class: 'ap-label' }, 'Project'), pick));
  btn.disabled = false;
  submit = async () => {
    btn.disabled = true; btn.textContent = 'Importing…';
    try {
      const project = res.projects.find(p => p.id === pick.value);
      const { endpoints } = await call(MSG.WB_PULL_ENDPOINTS, { projectId: project.id });
      if (!endpoints.length) { d.error('This project has no endpoints yet.'); btn.disabled = false; btn.textContent = 'Import'; return; }
      await onImport(project, endpoints);
      d.close();
    } catch (e) { d.error(e.message); btn.disabled = false; btn.textContent = 'Import'; }
  };
  return d;
}
