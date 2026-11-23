/**
 * workbench/views/schedule-dialog.js — scheduled runs (roadmap feature 12).
 *
 *   openScheduleDialog   create / edit the schedule of one scenario, collection or folder
 *   openSchedulesOverview  every schedule, with its last and next run
 *
 * Runs are done by the service worker, so they happen while Chrome is open
 * even with no Workbench tab. "Run now" asks it to run at once.
 */

import { h, mount, toast } from '../../ui/core/dom.js';
import { call } from '../../ui/core/bridge.js';
import { MSG } from '../../shared/messages.js';
import { openDialog } from './collection-dialogs.js';
import { EVERY, NOTIFY, newSchedule, everyLabel, runFailed, targetName, KIND_LABEL, inTime } from '../../shared/schedules.js';
import { ago } from '../../shared/sync.js';
import { loadSchedules, updateSchedules, onSchedulesChange } from '../schedules-store.js';

const envName = (envs, id) => (id ? envs.envs.find(e => e.id === id)?.name || 'deleted environment' : 'No environment');

export function runLine(run) {
  if (!run) return h('span', { class: 'muted' }, 'Not run yet');
  const bad = runFailed(run);
  const text = run.error ? 'Could not run' : bad ? `${run.failed} of ${run.total} failed` : `All ${run.total} passed`;
  return h('span', { class: `sch-run ${bad ? 'bad' : 'ok'}`, title: new Date(run.at).toLocaleString() }, `${bad ? '✗' : '✓'} ${text}`, h('span', { class: 'muted' }, ` · ${ago(run.at)}`));
}

function runsList(schedule) {
  if (!schedule?.runs?.length) return h('div', { class: 'muted small sch-empty' }, 'No runs yet.');
  return h('ul', { class: 'sch-runs' }, schedule.runs.map(r => h('li', { class: runFailed(r) ? 'bad' : 'ok' },
    h('div', { class: 'sch-run-head' }, runLine(r), h('span', { class: 'muted small' }, ` · ${r.ms} ms · ${r.reason === 'manual' ? 'run now' : 'scheduled'}`)),
    r.error ? h('div', { class: 'small sch-fail' }, r.error) : null,
    ...r.failures.map(f => h('div', { class: 'small sch-fail' }, h('strong', {}, f.name), `: ${f.reason}`)))));
}

async function nextRuns() {
  try { return await call(MSG.WB_NEXT_RUNS); } catch { return {}; }
}

/**
 * @param {object} o
 * @param {{ kind: 'scenario'|'collection'|'folder', id: string }} o.target
 * @param {string} o.name           what is being scheduled
 * @param {() => object} o.getEnvs  { globals, envs, active }
 */
export async function openScheduleDialog({ target, name, getEnvs }) {
  const envs = getEnvs();
  let schedule = (await loadSchedules()).items.find(s => s.target.kind === target.kind && s.target.id === target.id) || null;
  const isNew = !schedule;
  const draft = schedule || newSchedule(target, { envId: envs.active || '' });

  const every = h('select', { class: 'cl-input sch-every', 'aria-label': 'How often' },
    [...EVERY, ...(EVERY.some(e => e.minutes === draft.everyMinutes) ? [] : [{ minutes: draft.everyMinutes, label: everyLabel(draft.everyMinutes) }])]
      .map(e => h('option', { value: String(e.minutes), selected: e.minutes === draft.everyMinutes }, e.label)));
  const env = h('select', { class: 'cl-input sch-env', 'aria-label': 'Environment' },
    h('option', { value: '' }, 'No environment (Globals only)'),
    envs.envs.map(e => h('option', { value: e.id, selected: e.id === draft.envId }, e.name)));
  const notify = h('select', { class: 'cl-input sch-notify', 'aria-label': 'Notify me' },
    NOTIFY.map(n => h('option', { value: n.id, selected: n.id === draft.notify }, n.label)));
  const enabled = h('input', { type: 'checkbox', class: 'sch-enabled', checked: draft.enabled });
  const status = h('div', { class: 'sch-status small' });
  const runsEl = h('div', { class: 'sch-runs-wrap' });
  const runBtn = h('button', { type: 'button', class: 'btn-ghost sch-run-now', onclick: () => runNow() }, '▶ Run now');

  const read = () => ({ everyMinutes: Number(every.value), envId: env.value, notify: notify.value, enabled: enabled.checked });
  async function paintStatus() {
    if (!schedule) { mount(status, h('span', { class: 'muted' }, 'Not scheduled yet.')); return; }
    const next = schedule.enabled ? (await nextRuns())[schedule.id] : null;
    mount(status, h('span', {}, 'Last run: ', runLine(schedule.lastRun)),
      h('span', { class: 'muted' }, schedule.enabled ? (next ? ` · Next run ${inTime(next)}` : ' · Next run: being set up…') : ' · Paused'));
  }
  const paint = () => { mount(runsEl, h('div', { class: 'sc-title muted small' }, 'Recent runs'), runsList(schedule)); paintStatus(); };

  async function store() {
    const patch = read();
    const { state } = await updateSchedules((st) => {
      const cur = st.items.find(s => s.id === draft.id);
      if (cur) Object.assign(cur, patch); else st.items.push({ ...draft, ...patch });
    });
    schedule = state.items.find(s => s.id === draft.id) || null;
    return schedule;
  }

  async function runNow() {
    runBtn.disabled = true; runBtn.textContent = 'Running…';
    try {
      if (!schedule || JSON.stringify(read()) !== JSON.stringify({ everyMinutes: schedule.everyMinutes, envId: schedule.envId, notify: schedule.notify, enabled: schedule.enabled })) await store();
      const run = await call(MSG.WB_RUN_SCHEDULE, { id: draft.id });
      schedule = (await loadSchedules()).items.find(s => s.id === draft.id) || schedule;
      paint();
      toast(run.error ? `Could not run: ${run.error}` : `${name}: ${run.passed} passed, ${run.failed} failed`, runFailed(run) ? 'error' : 'ok');
    } catch (e) { toast(e.message, 'error'); }
    finally { runBtn.disabled = false; runBtn.textContent = '▶ Run now'; }
  }

  const stop = onSchedulesChange((st) => {
    if (!d.form.isConnected) { stop(); return; }
    const s = st.items.find(x => x.id === draft.id);
    if (s && JSON.stringify(s.runs) !== JSON.stringify(schedule?.runs)) { schedule = s; paint(); }
  });

  const d = openDialog({
    title: `Schedule "${name}"`, wide: true, label: 'Schedule runs',
    body: h('div', { class: 'cl-form sch' },
      h('div', { class: 'sch-grid' },
        h('label', { class: 'cl-field' }, h('span', { class: 'ap-label' }, 'Run'), every),
        h('label', { class: 'cl-field' }, h('span', { class: 'ap-label' }, 'Environment'), env),
        h('label', { class: 'cl-field' }, h('span', { class: 'ap-label' }, 'Notify me'), notify)),
      h('label', { class: 'cl-check' }, enabled, ' On (uncheck to pause)'),
      status,
      h('div', { class: 'muted small' }, `Runs in the background while Chrome is open, even with no Workbench tab. A run that was due while Chrome was closed happens once when it opens. Each request also appears in History; "Set vars" rules write to the chosen environment.`),
      runsEl),
    foot: (close) => [
      isNew ? null : h('button', { type: 'button', class: 'btn-ghost btn-danger-text sch-delete', onclick: async () => {
        if (!confirm(`Delete the schedule of "${name}"? Its run history is deleted too.`)) return;
        await updateSchedules((st) => { st.items = st.items.filter(s => s.id !== draft.id); });
        stop(); close(); toast('Schedule deleted', 'info');
      } }, 'Delete'),
      h('span', { class: 'grow' }),
      runBtn,
      h('button', { type: 'button', class: 'btn-ghost', onclick: () => { stop(); close(); } }, 'Close'),
      h('button', { type: 'submit', class: 'btn-primary sch-save' }, isNew ? 'Create schedule' : 'Save'),
    ],
    onSubmit: async () => {
      await store();
      toast(isNew ? `Scheduled: ${everyLabel(Number(every.value)).toLowerCase()}` : 'Schedule saved', 'ok');
      stop(); d.close();
    },
  });
  paint();
  return d;
}

/**
 * Every schedule. o.open(schedule) opens one; o.resolve(target) → name or null.
 * @param {object} o
 * @param {() => { tree, scenarios }} o.getData
 * @param {() => object} o.getEnvs
 */
export async function openSchedulesOverview({ getData, getEnvs }) {
  const list = h('div', { class: 'sch-list' });
  let state = await loadSchedules();
  async function paint() {
    const data = getData();
    const envs = getEnvs();
    if (!state.items.length) {
      mount(list, h('div', { class: 'muted small sch-empty' },
        h('p', {}, 'No schedules yet.'),
        h('p', {}, 'Use "⏰ Schedule" in a scenario, or "Schedule runs…" in the ⋯ menu of a collection, folder or scenario. Runs happen in the background while Chrome is open, and you get a notification when one fails.')));
      return;
    }
    const next = await nextRuns();
    mount(list, h('table', { class: 'sch-table' },
      h('thead', {}, h('tr', {}, ['What', 'How often', 'Environment', 'Last run', 'Next run', ''].map(t => h('th', {}, t)))),
      h('tbody', {}, state.items.map((s) => {
        const name = targetName(s.target, data);
        return h('tr', { dataset: { id: s.id } },
          h('td', {}, h('span', { class: 'muted small' }, `${KIND_LABEL[s.target.kind]} `), name ?? h('span', { class: 'sch-fail' }, '(deleted)')),
          h('td', {}, everyLabel(s.everyMinutes)),
          h('td', {}, envName(envs, s.envId)),
          h('td', {}, runLine(s.lastRun)),
          h('td', {}, s.enabled ? (next[s.id] ? inTime(next[s.id]) : '…') : h('span', { class: 'muted' }, 'Paused')),
          h('td', {}, name == null
            ? h('button', { type: 'button', class: 'btn-ghost btn-sm', onclick: () => updateSchedules((st) => { st.items = st.items.filter(x => x.id !== s.id); }) }, 'Delete')
            : h('button', { type: 'button', class: 'btn-ghost btn-sm sch-edit', onclick: () => { stop(); d.close(); openScheduleDialog({ target: s.target, name, getEnvs }); } }, 'Edit')));
      }))));
  }
  const stop = onSchedulesChange((st) => { if (!d.form.isConnected) { stop(); return; } state = st; paint(); });
  const d = openDialog({
    title: 'Scheduled runs', wide: true,
    body: h('div', { class: 'cl-form' }, list),
    foot: (close) => [h('span', { class: 'grow' }), h('button', { type: 'button', class: 'btn-ghost', onclick: () => { stop(); close(); } }, 'Close')],
  });
  paint();
  return d;
}
