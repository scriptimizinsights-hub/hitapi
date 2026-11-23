/**
 * shared/schedules.js — scheduled runs (roadmap feature 12): the data model.
 *
 *   wb:schedules  { items: [schedule] }
 *   schedule = {
 *     id, target: { kind: 'scenario' | 'collection' | 'folder', id },
 *     everyMinutes, envId ('' = no environment: Globals only),
 *     enabled, notify: 'failures' | 'always' | 'never',
 *     createdAt, lastRun: run | null, runs: [run] (newest first, ≤ MAX_RUNS)
 *   }
 *   run = { at, ms, passed, failed, total, reason: 'alarm' | 'manual', error?, failures: [{ name, reason }] }
 *
 * The service worker runs them with chrome.alarms (background/workbench/scheduler.js),
 * so they run whenever Chrome is open, even with no Workbench tab.
 */

import { find } from './collections.js';

export const KEY = 'wb:schedules';
export const ALARM_PREFIX = 'wb-sched:';
export const MAX_RUNS = 20;
export const MAX_FAILURES = 5;

export const EVERY = Object.freeze([
  { minutes: 5, label: 'Every 5 minutes' },
  { minutes: 15, label: 'Every 15 minutes' },
  { minutes: 30, label: 'Every 30 minutes' },
  { minutes: 60, label: 'Every hour' },
  { minutes: 180, label: 'Every 3 hours' },
  { minutes: 360, label: 'Every 6 hours' },
  { minutes: 720, label: 'Every 12 hours' },
  { minutes: 1440, label: 'Every day' },
]);
export const NOTIFY = Object.freeze([
  { id: 'failures', label: 'When a run fails' },
  { id: 'always', label: 'After every run' },
  { id: 'never', label: 'Never' },
]);
const KINDS = ['scenario', 'collection', 'folder'];

let seq = 0;
export const newScheduleId = () => `sch${Date.now().toString(36)}${(seq++).toString(36)}`;

export function newSchedule(target, patch = {}) {
  return normalizeSchedule({ id: newScheduleId(), target, everyMinutes: 60, envId: '', enabled: true, notify: 'failures', createdAt: Date.now(), lastRun: null, runs: [], ...patch });
}

export function everyLabel(minutes) {
  const known = EVERY.find(e => e.minutes === minutes);
  if (known) return known.label;
  if (minutes < 1) return `Every ${Math.round(minutes * 60)} seconds`;
  if (minutes % 1440 === 0) return `Every ${minutes / 1440} days`;
  if (minutes % 60 === 0) return `Every ${minutes / 60} hours`;
  return `Every ${minutes} minutes`;
}

function normalizeRun(r) {
  if (!r || typeof r !== 'object') return null;
  return {
    at: Number(r.at) || 0, ms: Number(r.ms) || 0,
    passed: Number(r.passed) || 0, failed: Number(r.failed) || 0, total: Number(r.total) || 0,
    reason: r.reason === 'manual' ? 'manual' : 'alarm',
    ...(r.error ? { error: String(r.error) } : {}),
    failures: (Array.isArray(r.failures) ? r.failures : []).slice(0, MAX_FAILURES).map(f => ({ name: String(f?.name || ''), reason: String(f?.reason || '') })),
  };
}

export function normalizeSchedule(s) {
  const target = s?.target && KINDS.includes(s.target.kind) && s.target.id ? { kind: s.target.kind, id: String(s.target.id) } : null;
  if (!s?.id || !target) return null;
  const every = Number(s.everyMinutes);
  const runs = (Array.isArray(s.runs) ? s.runs : []).map(normalizeRun).filter(Boolean).slice(0, MAX_RUNS);
  return {
    id: String(s.id), target,
    // the picker offers 5 minutes and up; smaller values (tests) are kept as stored
    everyMinutes: Number.isFinite(every) && every > 0 ? every : 60,
    envId: String(s.envId || ''),
    enabled: s.enabled !== false,
    notify: NOTIFY.some(n => n.id === s.notify) ? s.notify : 'failures',
    createdAt: Number(s.createdAt) || 0,
    lastRun: normalizeRun(s.lastRun) || runs[0] || null,
    runs,
  };
}

export function normalizeSchedules(v) {
  const items = (Array.isArray(v?.items) ? v.items : []).map(normalizeSchedule).filter(Boolean);
  return { items };
}

/** Why a result failed, in a few words. */
export function failReason(r) {
  if (r.error) return r.error.split('\n')[0].slice(0, 160);
  const bad = (r.tests || []).filter(t => !t.pass);
  if (bad.length) return `${bad.length} test${bad.length > 1 ? 's' : ''} failed: ${bad[0].name || bad[0].message || ''}`.slice(0, 160);
  return `Status ${r.status}`;
}

/**
 * A run record from step / request results.
 * @param {Array<{ name, pass, error?, tests?, status, ms }>} results
 */
export function runRecord(results, { at, reason = 'alarm', error = null } = {}) {
  const done = results.filter(r => !r.running);
  const failedOnes = done.filter(r => !r.pass);
  return normalizeRun({
    at, reason, error,
    ms: done.reduce((n, r) => n + (r.ms || 0), 0),
    passed: done.length - failedOnes.length, failed: failedOnes.length + (error ? 1 : 0), total: done.length,
    failures: failedOnes.slice(0, MAX_FAILURES).map(r => ({ name: r.name || 'Request', reason: failReason(r) })),
  });
}

/** Push a run onto a schedule (newest first). */
export function addRun(schedule, run) {
  schedule.lastRun = run;
  schedule.runs = [run, ...(schedule.runs || [])].slice(0, MAX_RUNS);
  return schedule;
}

export const runFailed = (run) => !!run && (run.failed > 0 || !!run.error);

/** Text for a notification. */
export function notificationText(name, run) {
  if (run.error) return { title: `HitAPI: "${name}" could not run`, message: run.error };
  const head = runFailed(run) ? `${run.failed} of ${run.total} failed` : `All ${run.total} passed`;
  const first = run.failures[0];
  return { title: `HitAPI: "${name}" — ${head}`, message: first ? `${first.name}: ${first.reason}` : `Finished in ${run.ms} ms.` };
}

/** The name shown for a schedule's target, or null if it was deleted. */
export function targetName(target, { tree, scenarios }) {
  if (target.kind === 'scenario') return scenarios.items.find(s => s.id === target.id)?.name ?? null;
  const f = find(tree, target.id);
  return f && f.node.type !== 'request' ? f.node.name : null;
}

export const KIND_LABEL = { scenario: 'Scenario', collection: 'Collection', folder: 'Folder' };

/** "in 12 min", "in 3 h", or a date. */
export function inTime(ms, now = Date.now()) {
  const s = Math.round((ms - now) / 1000);
  if (s < 60) return 'in less than a minute';
  if (s < 3600) return `in ${Math.round(s / 60)} min`;
  if (s < 86400) return `in ${Math.round(s / 3600)} h`;
  return new Date(ms).toLocaleString();
}
