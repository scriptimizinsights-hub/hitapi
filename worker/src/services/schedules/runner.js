/**
 * services/schedules/runner.js — runs cloud schedules (web roadmap W9).
 *
 *   runDueSchedules(env, ctx)  the every-minute cron: claims due schedules (in batches) and
 *                              queues them (or runs them in the background without a queue)
 *   runSchedule(env, id, reason)  one run: the target from the user's account copy
 *                              (extension_sync), the schedule's encrypted secrets filled in,
 *                              the shared engine, a run record, alerts
 *
 * Limits: 10 schedules per user, every 5 minutes at most, 100 requests per run, a run is
 * stopped after 5 minutes (and a stuck "running" mark is cleared after 5 minutes).
 */

import { DatabaseAdapter } from '../../db/adapter.js';
import { encryptField, decryptField } from '../encryption.js';
import { executePublicRequest, setDevAllowHosts } from '../proxy.js';
import { suiteFor, runVars, runSuite, plannedRequests } from './engine.js';

export const LIMITS = Object.freeze({ MAX_SCHEDULES: 10, MIN_EVERY: 5, MAX_EVERY: 1440, MAX_REQUESTS: 100, RUN_MS: 5 * 60 * 1000, KEEP_RUNS: 50, BATCH: 25 });
export const EVERY = [5, 15, 30, 60, 180, 360, 720, 1440];

const safeJson = (t, fb) => { try { return t ? JSON.parse(t) : fb; } catch { return fb; } };
const newId = (p) => `${p}${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;

/** The user's account copy: { tree, envs, scenarios } (secret values already removed by the browser). */
export async function accountData(db, userId) {
  const rows = await db.all('SELECT kind, data FROM extension_sync WHERE user_id = ?', [userId]);
  const doc = Object.fromEntries(rows.map(r => [r.kind, safeJson(r.data, null)]));
  const envItems = doc.environments?.items || [];
  return {
    tree: { items: doc.collections?.items || [] },
    envs: { globals: envItems.find(x => x.id === '__globals')?.vars || [], envs: envItems.filter(x => x.id !== '__globals') },
    scenarios: { items: doc.scenarios?.items || [] },
  };
}

export async function sealSecrets(env, secrets) {
  const clean = Object.fromEntries(Object.entries(secrets || {}).filter(([k, v]) => /^[A-Za-z_][\w.-]{0,99}$/.test(k) && v !== undefined && v !== null && String(v) !== '').map(([k, v]) => [k, String(v).slice(0, 4000)]));
  const names = Object.keys(clean);
  return { secrets: names.length ? await encryptField(env, JSON.stringify(clean)) : null, secret_names: JSON.stringify(names) };
}
export async function openSecrets(env, sealed) {
  if (!sealed) return {};
  try { return safeJson(await decryptField(env, sealed), {}); } catch { return {}; }
}

function failReason(r) {
  if (r.error) return String(r.error).split('\n')[0].slice(0, 160);
  const bad = (r.tests || []).filter(t => !t.pass);
  if (bad.length) return `${bad.length} test${bad.length > 1 ? 's' : ''} failed: ${bad[0].name || bad[0].message || ''}`.slice(0, 160);
  return `Status ${r.status}`;
}

/** Run one schedule now and record it. Returns the run row (summary). */
export async function runSchedule(env, scheduleId, reason = 'cron') {
  const db = new DatabaseAdapter(env.DB);
  setDevAllowHosts(env.DEV_PROXY_ALLOW_HOSTS);   // local development only (same rule as the public proxy)
  const s = await db.first('SELECT * FROM schedules WHERE id = ?', [scheduleId]);
  if (!s) return null;
  const startedAt = Date.now();
  const runId = newId('run');
  await db.run('INSERT INTO schedule_runs (id, schedule_id, user_id, started_at, reason, status) VALUES (?, ?, ?, ?, ?, ?)', [runId, s.id, s.user_id, startedAt, reason, 'running']);
  await db.run('UPDATE schedules SET running_since = ? WHERE id = ?', [startedAt, s.id]);
  let out = { status: 'error', passed: 0, failed: 0, total: 0, ms: 0, error: null, failures: [], results: [] };
  try {
    const data = await accountData(db, s.user_id);
    const secrets = await openSecrets(env, s.secrets);
    const vars = runVars({ envs: data.envs, envId: s.env_id, secrets });
    if (s.env_id && !data.envs.envs.some(e => e.id === s.env_id)) throw new Error('The environment this schedule uses was deleted from your account.');
    const suite = suiteFor({ kind: s.target_kind, id: s.target_id }, data, vars.fill);
    if (suite.error) throw new Error(suite.error);
    const planned = plannedRequests(suite);
    if (planned > LIMITS.MAX_REQUESTS) throw new Error(`This run would send ${planned} requests; a cloud run can send at most ${LIMITS.MAX_REQUESTS}. Run fewer data rows or repeats, or split it.`);
    if (!planned) throw new Error('Nothing to run: it has no requests (or every step is switched off).');
    const c = new AbortController();
    const t = setTimeout(() => c.abort('timeout'), LIMITS.RUN_MS);
    let r;
    try { r = await runSuite(suite, vars, { maxRequests: LIMITS.MAX_REQUESTS, signal: c.signal, secretValues: Object.values(secrets) }); } finally { clearTimeout(t); }
    if (r.error) throw new Error(r.error);
    const failedOnes = r.results.filter(x => !x.pass);
    out = {
      status: failedOnes.length ? 'failed' : 'passed', passed: r.results.length - failedOnes.length, failed: failedOnes.length, total: r.results.length,
      ms: r.results.reduce((n, x) => n + (x.ms || 0), 0), error: c.signal.aborted ? 'Stopped after 5 minutes.' : null,
      failures: failedOnes.slice(0, 5).map(x => ({ name: x.name || 'Request', reason: failReason(x) })), results: r.results,
    };
    if (out.error) out.status = 'failed';
  } catch (e) {
    out = { ...out, status: 'error', error: String(e.message || e).slice(0, 500) };
  }
  const finishedAt = Date.now();
  const alert = await sendAlerts(env, db, s, out).catch((e) => `alert failed: ${e.message}`);
  await db.run(`UPDATE schedule_runs SET finished_at = ?, status = ?, passed = ?, failed = ?, total = ?, ms = ?, error = ?, failures = ?, results = ?, alert = ? WHERE id = ?`,
    [finishedAt, out.status, out.passed, out.failed, out.total, out.ms, out.error, JSON.stringify(out.failures), JSON.stringify(out.results).slice(0, 900_000), alert || null, runId]);
  await db.run('UPDATE schedules SET last_run_at = ?, last_status = ?, running_since = NULL, updated_at = ? WHERE id = ?', [startedAt, out.status, finishedAt, s.id]);
  // keep the last 50 runs
  await db.run(`DELETE FROM schedule_runs WHERE schedule_id = ? AND id NOT IN (SELECT id FROM schedule_runs WHERE schedule_id = ? ORDER BY started_at DESC LIMIT ${LIMITS.KEEP_RUNS})`, [s.id, s.id]);
  return { id: runId, schedule_id: s.id, started_at: startedAt, finished_at: finishedAt, reason, status: out.status, passed: out.passed, failed: out.failed, total: out.total, ms: out.ms, error: out.error, failures: out.failures, alert: alert || null };
}

/** Email and webhook alerts: on failure (and when it works again), after every run, or never. */
async function sendAlerts(env, db, s, out) {
  if (s.notify === 'never') return null;
  const failed = out.status !== 'passed';
  const recovered = !failed && (s.last_status === 'failed' || s.last_status === 'error');
  if (s.notify === 'failures' && !failed && !recovered) return null;
  const head = out.status === 'error' ? `"${s.name}" could not run: ${out.error}`
    : failed ? `"${s.name}": ${out.failed} of ${out.total} failed` : recovered ? `"${s.name}" works again: all ${out.total} passed` : `"${s.name}": all ${out.total} passed`;
  const lines = out.failures.map(f => `• ${f.name}: ${f.reason}`);
  const link = `${String(env.SITE_URL || 'https://hitapi.dev').replace(/\/+$/, '')}/schedules`;
  const sent = [];
  if (s.webhook_url) {
    try {
      const r = await executePublicRequest({ method: 'POST', url: s.webhook_url, headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: [`HitAPI: ${head}`, ...lines, link].join('\n'), schedule: { id: s.id, name: s.name }, status: out.status, passed: out.passed, failed: out.failed, total: out.total, failures: out.failures, error: out.error }) });
      sent.push(r.ok ? 'webhook' : `webhook answered ${r.status}`);
    } catch (e) { sent.push(`webhook failed: ${e.message}`); }
  }
  if (s.notify_email) {
    if (!env.RESEND_API_KEY) sent.push('email skipped: no email provider is set up on the server');
    else {
      const u = await db.first('SELECT email FROM hitapi_users WHERE id = ?', [s.user_id]);
      if (u?.email) {
        try {
          const res = await fetch('https://api.resend.com/emails', { method: 'POST', headers: { Authorization: `Bearer ${env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({ from: env.ALERT_FROM || 'HitAPI <alerts@hitapi.dev>', to: [u.email], subject: `HitAPI: ${head}`.slice(0, 200), text: [head, '', ...lines, '', `Runs and settings: ${link}`].join('\n') }) });
          sent.push(res.ok ? 'email' : `email failed (${res.status})`);
        } catch (e) { sent.push(`email failed: ${e.message}`); }
      }
    }
  }
  return sent.join('; ') || null;
}

/** The every-minute cron: claim due schedules and run them (queue when there is one). */
export async function runDueSchedules(env, ctx) {
  const db = new DatabaseAdapter(env.DB);
  const now = Date.now();
  let due;
  try {
    due = await db.all(`SELECT id, every_min FROM schedules WHERE enabled = 1 AND next_run_at <= ? AND (running_since IS NULL OR running_since < ?) ORDER BY next_run_at LIMIT ${LIMITS.BATCH}`, [now, now - LIMITS.RUN_MS]);
  } catch { return 0; }   // table not created yet (migration 0019 not applied)
  let n = 0;
  for (const s of due) {
    // claim it: only one worker moves next_run_at on
    const r = await db.run('UPDATE schedules SET next_run_at = ?, running_since = ? WHERE id = ? AND next_run_at <= ? AND (running_since IS NULL OR running_since < ?)',
      [now + s.every_min * 60_000, now, s.id, now, now - LIMITS.RUN_MS]);
    if (!(r?.meta?.changes ?? r?.changes ?? 1)) continue;
    n++;
    if (env.QUEUE) await env.QUEUE.send({ type: 'schedule_run', scheduleId: s.id });
    else ctx?.waitUntil?.(runSchedule(env, s.id, 'cron'));
  }
  return n;
}

/** Queue consumer part: { type: 'schedule_run', scheduleId } messages. */
export async function handleScheduleMessages(messages, env) {
  for (const m of messages) {
    try { await runSchedule(env, m.body.scheduleId, 'cron'); } catch { /* recorded in the run */ }
    m.ack();
  }
}
