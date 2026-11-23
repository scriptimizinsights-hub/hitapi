/**
 * workbench/views/env-dialog.js — "Environments" dialog (roadmap feature 7):
 * global variables and environments (Development, Staging, Production…).
 * Edits a copy; Save writes it.
 */

import { h, mount } from '../../ui/core/dom.js';
import { openDialog } from './collection-dialogs.js';
import { createVarsTable } from './vars-table.js';
import { DYNAMIC } from '../../shared/vars.js';
import { newEnvId } from '../env-store.js';
import { download } from './collection-dialogs.js';
import { fileSafe } from '../../shared/convert/draft.js';

/** Postman environment JSON (secret values left out). */
function postmanEnv(name, vars, scope = 'environment') {
  return { id: crypto.randomUUID(), name, values: vars.filter(v => v.key).map(v => ({ key: v.key, value: v.secret ? '' : v.value, type: v.secret ? 'secret' : 'default', enabled: v.enabled !== false })),
    _postman_variable_scope: scope, _postman_exported_using: 'HitAPI Workbench' };
}

/**
 * @param {{ state: { globals, envs, active }, select?: string, onSave: (state, activeId) => Promise<void> }} o
 *   select: 'globals' or an environment id to show first.
 */
export function openEnvDialog({ state, select, onSave }) {
  const work = structuredClone({ globals: state.globals, envs: state.envs });
  let current = select || state.active || work.envs[0]?.id || 'globals';
  let active = state.active;
  const list = h('div', { class: 'ev-list', role: 'listbox', 'aria-label': 'Environments' });
  const editor = h('div', { class: 'ev-editor' });

  const envOf = (id) => work.envs.find(e => e.id === id);

  /** New environment: by default with the same variable names as the one shown, values empty. */
  function addEnv(name = 'New environment', vars = null) {
    const e = { id: newEnvId(), name, vars: vars || (envOf(current)?.vars || []).map(r => ({ ...r, value: '' })) };
    work.envs.push(e);
    current = e.id;
    paint();
    setTimeout(() => editor.querySelector('input[aria-label="Environment name"]')?.select(), 0);
  }

  function paintList() {
    const item = (id, label, extra) => h('button', { type: 'button', role: 'option', class: `ev-item${current === id ? ' active' : ''}`, 'aria-selected': String(current === id),
      onclick: () => { current = id; paint(); } }, h('span', { class: 'ev-name' }, label), extra);
    mount(list,
      item('globals', 'Globals', h('span', { class: 'muted small' }, String(work.globals.filter(r => r.key).length))),
      h('div', { class: 'ev-sep muted small' }, 'Environments'),
      work.envs.map(e => item(e.id, e.name, active === e.id ? h('span', { class: 'ev-active', title: 'In use' }, '● in use') : null)),
      h('button', { type: 'button', class: 'btn-ghost btn-sm ev-add', onclick: () => addEnv() }, '+ New environment'));
  }

  function paintEditor() {
    if (current === 'globals') {
      mount(editor,
        h('div', { class: 'ev-title' }, h('strong', {}, 'Globals'), h('span', { class: 'grow' }),
          h('button', { type: 'button', class: 'btn-ghost btn-sm', title: 'Download as a Postman globals file (secret values left out)', onclick: () => download('globals.postman_globals.json', JSON.stringify(postmanEnv('Globals', work.globals, 'globals'), null, 2)) }, 'Export')),
        h('div', { class: 'muted small' }, 'Used by every request in every environment. An environment, folder or collection variable with the same name wins.'),
        createVarsTable({ rows: work.globals, onChange: (rows) => { work.globals = rows; paintList(); } }).el);
      return;
    }
    const e = envOf(current);
    if (!e) { current = 'globals'; paintEditor(); return; }
    const name = h('input', { type: 'text', class: 'cl-input', value: e.name, 'aria-label': 'Environment name', maxlength: '60',
      oninput: () => { e.name = name.value; paintList(); } });
    mount(editor,
      h('div', { class: 'ev-title' }, name,
        active === e.id
          ? h('button', { type: 'button', class: 'btn-ghost btn-sm', onclick: () => { active = ''; paint(); } }, 'Stop using')
          : h('button', { type: 'button', class: 'btn-ghost btn-sm', onclick: () => { active = e.id; paint(); } }, 'Use this one'),
        h('button', { type: 'button', class: 'btn-ghost btn-sm', title: 'Copy this environment (secret values are not copied)', onclick: () => addEnv(`${e.name} copy`, e.vars.map(r => ({ ...r, value: r.secret ? '' : r.value }))) }, 'Duplicate'),
        h('button', { type: 'button', class: 'btn-ghost btn-sm', title: 'Download as a Postman environment (secret values left out)', onclick: () => download(`${fileSafe(e.name)}.postman_environment.json`, JSON.stringify(postmanEnv(e.name, e.vars), null, 2)) }, 'Export'),
        h('button', { type: 'button', class: 'btn-ghost btn-sm ev-del', onclick: () => {
          if (!confirm(`Delete the environment "${e.name}"?`)) return;
          work.envs = work.envs.filter(x => x.id !== e.id);
          if (active === e.id) active = '';
          current = work.envs[0]?.id || 'globals';
          paint();
        } }, 'Delete')),
      h('div', { class: 'muted small' }, 'Use them as {{name}} in the URL, params, headers, body and auth. Give every environment the same names (baseUrl, token…) with its own values.'),
      createVarsTable({ rows: e.vars, onChange: (rows) => { e.vars = rows; } }).el);
  }

  function paint() { paintList(); paintEditor(); }

  const d = openDialog({
    title: 'Environments and variables', wide: true,
    body: h('div', {},
      h('div', { class: 'ev-wrap' }, list, editor),
      h('details', { class: 'ev-dyn small' }, h('summary', {}, 'Dynamic variables (a new value every time)'),
        h('div', { class: 'ev-dyn-grid' }, Object.entries(DYNAMIC).map(([k, v]) => [h('code', {}, `{{${k}}}`), h('span', { class: 'muted' }, v.about)])))),
    foot: (close) => [h('span', { class: 'muted small' }, 'Kept in this browser. Secret values are hidden on screen and left out of exports.'), h('span', { class: 'grow' }),
      h('button', { type: 'button', class: 'btn-ghost', onclick: close }, 'Cancel'), h('button', { type: 'submit', class: 'btn-primary' }, 'Save')],
    onSubmit: async () => {
      const names = work.envs.map(e => e.name.trim().toLowerCase());
      if (work.envs.some(e => !e.name.trim())) { d.error('Every environment needs a name.'); return; }
      if (new Set(names).size !== names.length) { d.error('Two environments have the same name.'); return; }
      for (const e of work.envs) e.name = e.name.trim();
      try { await onSave(work, active); d.close(); } catch (err) { d.error(err.message); }
    },
  });
  paint();
  if (select === 'new') addEnv('Development', []);
  return d;
}
