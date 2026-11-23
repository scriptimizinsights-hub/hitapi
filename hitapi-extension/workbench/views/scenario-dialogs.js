/**
 * workbench/views/scenario-dialogs.js — scenarios ↔ HitAPI flow suites (roadmap feature 9).
 * Push: a scenario becomes a flow suite in a project, so it can run in the cloud on a schedule.
 * Pull: a flow suite becomes a scenario with its steps copied in.
 */

import { h, mount } from '../../ui/core/dom.js';
import { call } from '../../ui/core/bridge.js';
import { MSG, ERR } from '../../shared/messages.js';
import { DASHBOARD_URL } from '../../shared/config.js';
import { openDialog, loadProjects, signedOutNote } from './collection-dialogs.js';

const projectLink = (pid, path) => `${DASHBOARD_URL.replace(/\/+$/, '')}/projects/${encodeURIComponent(pid)}/${path}`;

/**
 * @param {{ scenario, steps: () => Array<{ name, step, extract, dropped, unresolved }>, onLinked: (projectId, suiteId) => void }} o
 */
export async function openFlowPushDialog({ scenario, steps, onLinked }) {
  const body = h('div', { class: 'cl-form' }, h('div', { class: 'muted small' }, 'Loading your HitAPI projects…'));
  let submit = () => {};
  const d = openDialog({
    title: `Send "${scenario.name}" to HitAPI`, body,
    foot: (close) => [h('span', { class: 'grow' }), h('button', { type: 'button', class: 'btn-ghost', onclick: close }, 'Close'), h('button', { type: 'submit', class: 'btn-primary', 'data-push': '' }, 'Create flow suite')],
    onSubmit: () => submit(),
  });
  const btn = d.form.querySelector('[data-push]');
  btn.disabled = true;
  const res = await loadProjects();
  if (res.signedOut) { mount(body, signedOutNote()); return d; }
  if (res.error) { mount(body, h('div', { class: 'error' }, res.error)); return d; }
  if (!res.projects.length) { mount(body, h('div', { class: 'muted small' }, 'You have no HitAPI projects yet. Create one in the web app (or send a collection to HitAPI) first.')); return d; }
  const list = steps();
  const dropped = [...new Set(list.flatMap(x => x.dropped))];
  const unresolved = [...new Set(list.flatMap(x => x.unresolved))];
  const pick = h('select', { class: 'cl-input', 'aria-label': 'HitAPI project' },
    res.projects.map(p => h('option', { value: p.id, selected: p.id === scenario.hitapi?.projectId }, `${p.name}${p.base_url ? ` (${p.base_url})` : ''}`)));
  const result = h('div', {});
  mount(body,
    h('div', { class: 'muted small' }, 'Creates a flow suite with these steps in the project, so it can run in the cloud (on a schedule, with AI bug reports). Your scenario here is not changed.'),
    h('label', { class: 'cl-field' }, h('span', { class: 'ap-label' }, 'Project'), pick),
    h('ol', { class: 'sc-push-list small' }, list.map(x => h('li', {}, h('code', {}, `${x.step.method} ${x.step.url_override}`), x.extract.length ? h('span', { class: 'muted' }, ` → sets ${x.extract.map(e => e.var).join(', ')}`) : null))),
    dropped.length ? h('div', { class: 'wb-warn-text small' }, `Not sent (secrets): ${dropped.join(', ')}. In the cloud, a login step that sets a token variable is used for auth, or the suite/project token.`) : null,
    unresolved.length ? h('div', { class: 'muted small' }, `Kept as variables for the cloud run: ${unresolved.map(n => `{{${n}}}`).join(', ')}.`) : null,
    result);
  btn.disabled = false;
  submit = async () => {
    d.error(''); btn.disabled = true; btn.textContent = 'Creating…';
    try {
      const out = await call(MSG.WB_PUSH_FLOW, { projectId: pick.value, name: scenario.name, description: 'Sent from the HitAPI Workbench scenario', steps: list.map(x => ({ step: x.step, extract: x.extract })) });
      await onLinked?.(pick.value, out.suiteId);
      mount(result, h('div', { class: 'cl-note ok' }, h('strong', {}, `✓ Created the flow suite "${scenario.name}" with ${out.steps} step${out.steps === 1 ? '' : 's'}.`),
        h('a', { href: projectLink(pick.value, 'flows'), target: '_blank', rel: 'noopener' }, 'Open flow suites in HitAPI ↗')));
      btn.textContent = 'Create another copy';
    } catch (e) {
      if (e.code === ERR.NOT_LOGGED_IN || e.code === ERR.AUTH_EXPIRED) mount(body, signedOutNote()); else d.error(e.message);
      btn.textContent = 'Create flow suite';
    }
    btn.disabled = false;
  };
  return d;
}

/** Pick a project and one of its flow suites → onImport(project, suite, steps). */
export async function openFlowPullDialog({ onImport }) {
  const body = h('div', { class: 'cl-form' }, h('div', { class: 'muted small' }, 'Loading your HitAPI projects…'));
  let submit = () => {};
  const d = openDialog({
    title: 'Import a HitAPI flow suite', body,
    foot: (close) => [h('span', { class: 'grow' }), h('button', { type: 'button', class: 'btn-ghost', onclick: close }, 'Cancel'), h('button', { type: 'submit', class: 'btn-primary', 'data-pull': '' }, 'Import')],
    onSubmit: () => submit(),
  });
  const btn = d.form.querySelector('[data-pull]');
  btn.disabled = true;
  const res = await loadProjects();
  if (res.signedOut) { mount(body, signedOutNote()); return d; }
  if (res.error) { mount(body, h('div', { class: 'error' }, res.error)); return d; }
  if (!res.projects.length) { mount(body, h('div', { class: 'muted small' }, 'You have no HitAPI projects yet.')); return d; }
  const pick = h('select', { class: 'cl-input', 'aria-label': 'HitAPI project' }, res.projects.map(p => h('option', { value: p.id }, p.name)));
  const suites = h('select', { class: 'cl-input', 'aria-label': 'Flow suite' });
  const info = h('div', { class: 'muted small' });
  const loadSuites = async () => {
    btn.disabled = true; mount(suites); mount(info, 'Loading flow suites…');
    try {
      const list = await call(MSG.LIST_FLOW_SUITES, { projectId: pick.value });
      mount(suites, list.map(s => h('option', { value: s.id }, `${s.name}${s.step_count != null ? ` (${s.step_count} steps)` : ''}`)));
      mount(info, list.length ? '' : 'This project has no flow suites.');
      btn.disabled = !list.length;
    } catch (e) { mount(info, h('span', { class: 'text-red' }, e.message)); }
  };
  pick.addEventListener('change', loadSuites);
  mount(body,
    h('div', { class: 'muted small' }, 'Copies the suite\'s steps into a new scenario (method, URL, headers, body, extracted variables, expected status). The suite in HitAPI is not changed.'),
    h('label', { class: 'cl-field' }, h('span', { class: 'ap-label' }, 'Project'), pick),
    h('label', { class: 'cl-field' }, h('span', { class: 'ap-label' }, 'Flow suite'), suites), info);
  await loadSuites();
  submit = async () => {
    btn.disabled = true; btn.textContent = 'Importing…';
    try {
      const project = res.projects.find(p => p.id === pick.value);
      const { suite, steps } = await call(MSG.WB_GET_FLOW, { projectId: project.id, suiteId: suites.value });
      if (!steps.length) { d.error('This flow suite has no steps.'); btn.disabled = false; btn.textContent = 'Import'; return; }
      await onImport(project, suite, steps);
      d.close();
    } catch (e) { d.error(e.message); btn.disabled = false; btn.textContent = 'Import'; }
  };
  return d;
}
