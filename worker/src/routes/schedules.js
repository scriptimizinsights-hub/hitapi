/**
 * routes/schedules.js — cloud schedules for Workbench collections, folders and scenarios (web roadmap W9).
 *
 *   GET    /api/schedules                 → { schedules: [...], limits, every }
 *   POST   /api/schedules                 { name, target_kind, target_id, every_min, env_id, notify, notify_email, webhook_url, secrets }
 *   PATCH  /api/schedules/:id             any of the above, plus enabled; secrets: { name: value } sets those (null removes), others kept
 *   DELETE /api/schedules/:id
 *   POST   /api/schedules/:id/run         run now → the run (summary)
 *   GET    /api/schedules/:id/runs        → { runs: [...] } last 50, newest first
 *   GET    /api/schedules/:id/runs/:runId → one run with each request (bodies cut to 10 KB)
 *
 * The target comes from the user's account copy (Workbench sync). Secret values are stored
 * encrypted for the schedule only and are never returned: the API gives their names.
 */

import { DatabaseAdapter } from '../db/adapter.js';
import { json, error, success, parseBody } from '../middleware/cors.js';
import { LIMITS, EVERY, accountData, sealSecrets, openSecrets, runSchedule } from '../services/schedules/runner.js';
import { suiteFor, plannedRequests } from '../services/schedules/engine.js';

const KINDS = ['collection', 'folder', 'scenario'];
const NOTIFY = ['failures', 'always', 'never'];
const safeJson = (t, fb) => { try { return t ? JSON.parse(t) : fb; } catch { return fb; } };

/** What the API shows for a schedule: never the secret values. */
function view(s, lastRun = null) {
  return {
    id: s.id, name: s.name, target_kind: s.target_kind, target_id: s.target_id, every_min: s.every_min, env_id: s.env_id || null,
    notify: s.notify, notify_email: !!s.notify_email, webhook_url: s.webhook_url || '', secret_names: safeJson(s.secret_names, []),
    enabled: !!s.enabled, next_run_at: s.next_run_at, last_run_at: s.last_run_at || null, last_status: s.last_status || null,
    running: !!s.running_since && s.running_since > Date.now() - LIMITS.RUN_MS, created_at: s.created_at, updated_at: s.updated_at,
    last_run: lastRun,
  };
}
const runView = (r, full = false) => ({
  id: r.id, started_at: r.started_at, finished_at: r.finished_at, reason: r.reason, status: r.status,
  passed: r.passed, failed: r.failed, total: r.total, ms: r.ms, error: r.error, failures: safeJson(r.failures, []), alert: r.alert || null,
  ...(full ? { results: safeJson(r.results, []) } : {}),
});

/** Check the fields; returns { values } or { error }. */
async function validate(body, { db, userId, partial = false }) {
  const v = {};
  if (!partial || body.name !== undefined) { v.name = String(body.name || '').trim().slice(0, 120); if (!v.name) return { error: 'Give the schedule a name.' }; }
  if (!partial || body.every_min !== undefined) {
    v.every_min = Number(body.every_min);
    if (!EVERY.includes(v.every_min)) return { error: `"every_min" must be one of ${EVERY.join(', ')} (minutes). The shortest is every ${LIMITS.MIN_EVERY} minutes.` };
  }
  if (!partial || body.notify !== undefined) { v.notify = NOTIFY.includes(body.notify) ? body.notify : 'failures'; }
  if (body.notify_email !== undefined || !partial) v.notify_email = body.notify_email === false ? 0 : 1;
  if (body.webhook_url !== undefined || !partial) {
    const w = String(body.webhook_url || '').trim();
    if (w && !/^https:\/\/[^\s]+$/i.test(w)) return { error: 'The webhook URL must start with https://' };
    v.webhook_url = w || null;
  }
  if (body.enabled !== undefined) v.enabled = body.enabled ? 1 : 0;
  if (body.env_id !== undefined || !partial) v.env_id = body.env_id ? String(body.env_id) : null;
  if (!partial || body.target_kind !== undefined || body.target_id !== undefined) {
    if (!KINDS.includes(body.target_kind)) return { error: '"target_kind" must be collection, folder or scenario.' };
    if (!body.target_id) return { error: '"target_id" is required.' };
    v.target_kind = body.target_kind; v.target_id = String(body.target_id);
  }
  // the target and environment must be in the account copy, and the run must fit the limit
  if (v.target_kind || v.env_id) {
    const data = await accountData(db, userId);
    if (v.target_kind) {
      const suite = suiteFor({ kind: v.target_kind, id: v.target_id }, data);
      if (suite.error) return { error: `${suite.error.replace(' was deleted from', ' is not in')} Turn on "Keep my Workbench in my HitAPI account" so the schedule can see it.` };
      const n = plannedRequests(suite);
      if (n > LIMITS.MAX_REQUESTS) return { error: `A run would send ${n} requests; a cloud run can send at most ${LIMITS.MAX_REQUESTS}.` };
    }
    if (v.env_id && !data.envs.envs.some(e => e.id === v.env_id)) return { error: 'That environment is not in your account.' };
  }
  return { values: v };
}

export async function listSchedules(request, env, { user }) {
  const db = new DatabaseAdapter(env.DB);
  const rows = await db.all('SELECT * FROM schedules WHERE user_id = ? ORDER BY created_at', [user.sub]);
  const out = [];
  for (const s of rows) {
    const last = await db.first('SELECT * FROM schedule_runs WHERE schedule_id = ? AND status != ? ORDER BY started_at DESC LIMIT 1', [s.id, 'running']);
    out.push(view(s, last ? runView(last) : null));
  }
  return json(success({ schedules: out, limits: LIMITS, every: EVERY, email: !!env.RESEND_API_KEY }));
}

export async function createSchedule(request, env, { user }) {
  const db = new DatabaseAdapter(env.DB);
  const body = await parseBody(request).catch(() => null);
  if (!body) return error('Invalid JSON body');
  const count = (await db.first('SELECT COUNT(*) AS n FROM schedules WHERE user_id = ?', [user.sub]))?.n || 0;
  if (count >= LIMITS.MAX_SCHEDULES) return error(`You have ${LIMITS.MAX_SCHEDULES} schedules, the most an account can have. Delete one first.`, 403);
  const { values, error: problem } = await validate(body, { db, userId: user.sub });
  if (problem) return error(problem);
  const sealed = await sealSecrets(env, body.secrets);
  const now = Date.now();
  const id = `sc${now.toString(36)}${Math.random().toString(36).slice(2, 8)}`;
  await db.run(`INSERT INTO schedules (id, user_id, name, target_kind, target_id, every_min, env_id, notify, notify_email, webhook_url, secrets, secret_names, enabled, next_run_at, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  [id, user.sub, values.name, values.target_kind, values.target_id, values.every_min, values.env_id, values.notify, values.notify_email, values.webhook_url, sealed.secrets, sealed.secret_names, body.enabled === false ? 0 : 1, now + values.every_min * 60_000, now, now]);
  return json(success(view(await db.first('SELECT * FROM schedules WHERE id = ?', [id]))), 201);
}

async function own(db, id, userId) {
  return db.first('SELECT * FROM schedules WHERE id = ? AND user_id = ?', [id, userId]);
}

export async function updateSchedule(request, env, { params, user }) {
  const db = new DatabaseAdapter(env.DB);
  const s = await own(db, params.id, user.sub);
  if (!s) return error('Schedule not found', 404);
  const body = await parseBody(request).catch(() => null);
  if (!body) return error('Invalid JSON body');
  const { values, error: problem } = await validate(body, { db, userId: user.sub, partial: true });
  if (problem) return error(problem);
  // secrets: the names given are set (an empty or null value removes one); the others are kept
  if (body.secrets !== undefined && body.secrets !== null && typeof body.secrets === 'object') {
    const merged = { ...(await openSecrets(env, s.secrets)) };
    for (const [k, v] of Object.entries(body.secrets)) { if (v === null || v === '') delete merged[k]; else merged[k] = v; }
    Object.assign(values, await sealSecrets(env, merged));
  }
  if (values.every_min && values.every_min !== s.every_min) values.next_run_at = Date.now() + values.every_min * 60_000;
  if (values.enabled === 1 && !s.enabled) values.next_run_at = Date.now() + (values.every_min || s.every_min) * 60_000;
  const keys = Object.keys(values);
  if (keys.length) {
    await db.run(`UPDATE schedules SET ${keys.map(k => `${k} = ?`).join(', ')}, updated_at = ? WHERE id = ?`, [...keys.map(k => values[k]), Date.now(), s.id]);
  }
  return json(success(view(await db.first('SELECT * FROM schedules WHERE id = ?', [s.id]))));
}

export async function deleteSchedule(request, env, { params, user }) {
  const db = new DatabaseAdapter(env.DB);
  const s = await own(db, params.id, user.sub);
  if (!s) return error('Schedule not found', 404);
  await db.run('DELETE FROM schedule_runs WHERE schedule_id = ?', [s.id]);
  await db.run('DELETE FROM schedules WHERE id = ?', [s.id]);
  return json(success({ deleted: true }));
}

export async function runScheduleNow(request, env, { params, user }) {
  const db = new DatabaseAdapter(env.DB);
  const s = await own(db, params.id, user.sub);
  if (!s) return error('Schedule not found', 404);
  if (s.running_since && s.running_since > Date.now() - LIMITS.RUN_MS) return error('It is running now. Wait for this run to finish.', 409);
  const run = await runSchedule(env, s.id, 'manual');
  return json(success(run));
}

export async function listScheduleRuns(request, env, { params, user }) {
  const db = new DatabaseAdapter(env.DB);
  const s = await own(db, params.id, user.sub);
  if (!s) return error('Schedule not found', 404);
  const rows = await db.all(`SELECT * FROM schedule_runs WHERE schedule_id = ? ORDER BY started_at DESC LIMIT ${LIMITS.KEEP_RUNS}`, [s.id]);
  return json(success({ runs: rows.map(r => runView(r)) }));
}

export async function getScheduleRun(request, env, { params, user }) {
  const db = new DatabaseAdapter(env.DB);
  const s = await own(db, params.id, user.sub);
  if (!s) return error('Schedule not found', 404);
  const r = await db.first('SELECT * FROM schedule_runs WHERE id = ? AND schedule_id = ?', [params.runId, s.id]);
  if (!r) return error('Run not found', 404);
  return json(success(runView(r, true)));
}
