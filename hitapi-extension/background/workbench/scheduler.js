/**
 * background/workbench/scheduler.js — scheduled runs (roadmap feature 12).
 *
 * Each enabled schedule has a chrome.alarms alarm "wb-sched:<id>". When it
 * fires, the service worker runs the scenario, collection or folder itself
 * (no Workbench tab needed), using the same code as the Workbench
 * (workbench/run-core.js): saved requests with their collection settings,
 * the schedule's environment, tests, History and "Set vars".
 * Alarms are kept in step with wb:schedules whenever it changes.
 * A notification is shown when a run fails (or after every run, per schedule);
 * clicking it opens the Workbench.
 *
 * Runs only while Chrome is open. A run that was due while Chrome was closed or
 * the computer asleep happens once, when Chrome is back.
 */

import { KEY, ALARM_PREFIX, normalizeSchedules, runRecord, addRun, runFailed, notificationText, targetName } from '../../shared/schedules.js';
import { normalizeTree, find, requestsIn } from '../../shared/collections.js';
import { normalizeScenarios, parseData, runScenario, storableReport, stepPassed } from '../../shared/scenarios.js';
import { runRequest } from '../../workbench/run-core.js';
import { setRpc } from '../../workbench/send.js';
import { loadEnvs } from '../../workbench/env-store.js';
import { MSG } from '../../shared/messages.js';
import * as headerRules from './protected-headers.js';
import * as netErrors from './net-errors.js';
import { openWorkbench } from './open.js';

const running = new Map();   // schedule id → Promise<run>

// send() from the worker: call the handlers directly (a worker can't message itself)
const direct = {
  [MSG.WB_APPLY_HEADER_RULE]: (m) => headerRules.applyRule(m),
  [MSG.WB_REMOVE_HEADER_RULE]: (m) => headerRules.removeRule(m),
  [MSG.WB_GET_NET_ERROR]: (m) => netErrors.getNetError(m),
};
setRpc(async (type, payload) => {
  const fn = direct[type];
  if (!fn) throw new Error(`Not available in scheduled runs: ${type}`);
  return fn(payload);
});

async function readAll() {
  const got = await chrome.storage.local.get([KEY, 'wb:collections', 'wb:scenarios']);
  return { schedules: normalizeSchedules(got[KEY]), tree: normalizeTree(got['wb:collections']), scenarios: normalizeScenarios(got['wb:scenarios']) };
}

async function updateSchedules(fn) {
  const state = normalizeSchedules((await chrome.storage.local.get(KEY))[KEY]);
  const out = fn(state);
  if (out !== false) await chrome.storage.local.set({ [KEY]: state });
  return state;
}

/** Create, change or clear alarms so they match the stored schedules. */
export async function syncAlarms() {
  const { items } = normalizeSchedules((await chrome.storage.local.get(KEY))[KEY]);
  const want = new Map(items.filter(s => s.enabled).map(s => [ALARM_PREFIX + s.id, s.everyMinutes]));
  const have = (await chrome.alarms.getAll()).filter(a => a.name.startsWith(ALARM_PREFIX));
  for (const a of have) {
    if (!want.has(a.name) || a.periodInMinutes !== want.get(a.name)) await chrome.alarms.clear(a.name);
  }
  const left = new Set((await chrome.alarms.getAll()).map(a => a.name));
  for (const [name, every] of want) {
    if (!left.has(name)) await chrome.alarms.create(name, { delayInMinutes: every, periodInMinutes: every });
  }
}

async function execute(schedule, reason) {
  const at = Date.now();
  const all = await readAll();
  const name = targetName(schedule.target, all);
  if (name == null) return { name: 'Deleted item', run: runRecord([], { at, reason, error: `The ${schedule.target.kind} for this schedule was deleted.` }) };

  // The schedule's own environment, not the one selected in the Workbench
  const stored = await loadEnvs();
  const envId = stored.envs.some(e => e.id === schedule.envId) ? schedule.envId : '';
  let envState = { ...stored, active: envId };
  const io = { getEnv: () => envState, setEnv: (st) => { envState = { ...st, active: envId }; } };
  if (schedule.envId && !envId) return { name, run: runRecord([], { at, reason, error: 'The environment for this schedule was deleted. Choose another one.' }) };

  if (schedule.target.kind === 'scenario') {
    const s = all.scenarios.items.find(x => x.id === schedule.target.id);
    if (!s.steps.some(x => x.enabled)) return { name, run: runRecord([], { at, reason, error: 'The scenario has no steps.' }) };
    let rows;
    try { rows = parseData(s.data); } catch (e) { return { name, run: runRecord([], { at, reason, error: `Data: ${e.message}` }) }; }
    const report = await runScenario({
      scenario: s, rows,
      runStep: async (step, { row, signal }) => {
        if (step.kind !== 'saved') return runRequest({ draft: step.draft, name: step.name || 'Request', row, signal, ...io });
        const f = find(normalizeTree((await chrome.storage.local.get('wb:collections'))['wb:collections']), step.requestId);
        if (!f || f.node.type !== 'request') return { error: 'The saved request for this step was deleted.', kind: 'invalid', name: 'Deleted request' };
        return runRequest({ draft: f.node.draft, ancestors: f.ancestors, name: f.node.name, row, signal, ...io });
      },
    });
    // keep the report with the scenario, as a run from the Workbench does
    const cur = normalizeScenarios((await chrome.storage.local.get('wb:scenarios'))['wb:scenarios']);
    const x = cur.items.find(i => i.id === s.id);
    if (x) { x.lastReport = storableReport(report); await chrome.storage.local.set({ 'wb:scenarios': cur }); }
    return { name, run: runRecord(report.results, { at, reason }) };
  }

  const items = requestsIn(all.tree, schedule.target.id);
  if (!items.length) return { name, run: runRecord([], { at, reason, error: `The ${schedule.target.kind} has no saved requests.` }) };
  const results = [];
  for (const it of items) {
    let res;
    try { res = await runRequest({ draft: it.node.draft, ancestors: it.ancestors, name: it.node.name, ...io }); } catch (e) { res = { name: it.node.name, error: e.message, kind: 'error' }; }
    results.push({ name: it.node.name, status: res.status ?? 0, ms: res.ms ?? 0, error: res.error || null, tests: res.tests || null, pass: stepPassed(res) });
  }
  return { name, run: runRecord(results, { at, reason }) };
}

function notify(schedule, name, run) {
  const want = schedule.notify === 'always' || (schedule.notify === 'failures' && runFailed(run));
  if (!want || !chrome.notifications?.create) return;
  const { title, message } = notificationText(name, run);
  chrome.notifications.create(`${ALARM_PREFIX}${schedule.id}:${run.at}`, {
    type: 'basic', iconUrl: chrome.runtime.getURL('icons/icon128.png'), title, message: message || ' ', priority: runFailed(run) ? 1 : 0,
  }, () => void chrome.runtime.lastError);
}

/**
 * Run a schedule now. Two runs of the same schedule never overlap: a second
 * call while one is running gets the same result.
 * @returns {Promise<object>} the run record
 */
export function runSchedule({ id, reason = 'manual' }) {
  if (running.has(id)) return running.get(id);
  const p = (async () => {
    const { schedules } = await readAll();
    const schedule = schedules.items.find(s => s.id === id);
    if (!schedule) throw new Error('That schedule no longer exists.');
    let out;
    try { out = await execute(schedule, reason); } catch (e) { out = { name: 'Schedule', run: runRecord([], { at: Date.now(), reason, error: e.message }) }; }
    await updateSchedules((st) => { const s = st.items.find(x => x.id === id); if (!s) return false; addRun(s, out.run); });
    notify(schedule, out.name, out.run);
    return out.run;
  })().finally(() => running.delete(id));
  running.set(id, p);
  return p;
}

/** When each schedule runs next: { id: time } (from its alarm). */
export async function nextRuns() {
  const out = {};
  for (const a of await chrome.alarms.getAll()) if (a.name.startsWith(ALARM_PREFIX)) out[a.name.slice(ALARM_PREFIX.length)] = a.scheduledTime;
  return out;
}

export function registerScheduler() {
  chrome.alarms.onAlarm.addListener((alarm) => {
    if (!alarm.name.startsWith(ALARM_PREFIX)) return;
    runSchedule({ id: alarm.name.slice(ALARM_PREFIX.length), reason: 'alarm' }).catch(e => console.warn('[HitAPI] scheduled run', e.message));
  });
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === 'local' && changes[KEY]) syncAlarms().catch(() => {});
  });
  chrome.notifications?.onClicked.addListener((nid) => {
    if (!nid.startsWith(ALARM_PREFIX)) return;
    chrome.notifications.clear(nid);
    openWorkbench().catch(() => {});
  });
  syncAlarms().catch(() => {});
}
