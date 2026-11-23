/**
 * shared/scenarios.js — scenarios (roadmap feature 9): an ordered list of
 * steps run one after another, sharing variables. Pure functions; the
 * Workbench page supplies how one step is sent (runStep).
 *
 *   scenario = { id, name, steps: [step], data: { text, format: 'csv'|'json' }, lastReport, hitapi }
 *   step     = { id, kind: 'saved', requestId } | { id, kind: 'inline', name, draft }
 *              + { enabled, delayMs, repeat, onFail: 'stop'|'continue' }
 *
 * Each step uses its request's own Tests (feature 8) and Set vars rules
 * (feature 7), so a login step can set {{token}} for the steps after it.
 */

import { normalizeUrl } from './http.js';
import { maskDraft } from './history.js';

let seq = 0;
const id = (p) => `${p}${Date.now().toString(36)}${(seq++).toString(36)}${Math.random().toString(36).slice(2, 5)}`;

export const MAX_REPEAT = 100;
export const MAX_ITERATIONS = 1000;

export function newScenario(name = 'New scenario') {
  return { id: id('s'), name, steps: [], data: { text: '', format: 'csv' }, lastReport: null };
}

export function newStep(kind, patch = {}) {
  return { id: id('st'), kind, enabled: true, delayMs: 0, repeat: 1, onFail: 'stop', ...patch };
}

export function normalizeScenarios(v) {
  const items = (Array.isArray(v?.items) ? v.items : []).filter(s => s?.id).map(s => ({
    ...newScenario(), ...s,
    name: String(s.name || 'Scenario'),
    data: { text: String(s.data?.text || ''), format: s.data?.format === 'json' ? 'json' : 'csv' },
    steps: (Array.isArray(s.steps) ? s.steps : []).filter(st => st?.id && (st.kind === 'saved' || st.kind === 'inline')).map(st => ({
      ...st,
      enabled: st.enabled !== false,
      delayMs: Math.max(0, Math.min(600000, Number(st.delayMs) || 0)),
      repeat: Math.max(1, Math.min(MAX_REPEAT, Math.floor(Number(st.repeat) || 1))),
      onFail: st.onFail === 'continue' ? 'continue' : 'stop',
    })),
  }));
  return { items };
}

export function cloneScenario(s) {
  const c = structuredClone(s);
  c.id = id('s'); c.name = `${s.name} copy`; c.lastReport = null; delete c.hitapi;
  c.steps = c.steps.map(st => ({ ...st, id: id('st') }));
  return c;
}

// ── data-driven runs ────────────────────────────────────────────────────────

/** RFC 4180-ish CSV → rows of fields (quotes, "" escapes, commas and newlines inside quotes). */
export function parseCsv(text) {
  const rows = []; let row = []; let f = ''; let q = false;
  const s = String(text || '').replace(/^﻿/, '');
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (q) {
      if (c === '"' && s[i + 1] === '"') { f += '"'; i++; } else if (c === '"') q = false; else f += c;
    } else if (c === '"' && f === '') q = true;
    else if (c === ',') { row.push(f); f = ''; }
    else if (c === '\n' || c === '\r') { if (c === '\r' && s[i + 1] === '\n') i++; row.push(f); rows.push(row); row = []; f = ''; }
    else f += c;
  }
  if (f !== '' || row.length) { row.push(f); rows.push(row); }
  return rows.filter(r => r.some(x => x.trim() !== ''));
}

/**
 * The data file → [{ name: value }] (one object per run), or throws a readable error.
 * CSV: the first row holds the variable names. JSON: an array of objects.
 */
export function parseData({ text, format }) {
  const t = String(text || '').trim();
  if (!t) return [];
  let rows;
  if (format === 'json') {
    let v; try { v = JSON.parse(t); } catch (e) { throw new Error(`The data is not valid JSON: ${e.message}`); }
    if (!Array.isArray(v) || !v.every(x => x && typeof x === 'object' && !Array.isArray(x))) throw new Error('The JSON data must be an array of objects, e.g. [{"user": "asha"}, {"user": "ben"}]');
    rows = v.map(o => Object.fromEntries(Object.entries(o).map(([k, x]) => [k, typeof x === 'string' ? x : JSON.stringify(x)])));
  } else {
    const all = parseCsv(t);
    if (all.length < 2) throw new Error('The CSV needs a header row with the variable names and at least one row of values.');
    const names = all[0].map(n => n.trim());
    if (names.some(n => !n)) throw new Error('Every column in the CSV header needs a name.');
    rows = all.slice(1).map(r => Object.fromEntries(names.map((n, i) => [n, r[i] ?? ''])));
  }
  if (rows.length > MAX_ITERATIONS) throw new Error(`At most ${MAX_ITERATIONS} rows of data.`);
  return rows;
}

// ── running ─────────────────────────────────────────────────────────────────

const stepPassed = (r) => !!r && !r.error && (r.tests?.length ? r.tests.every(t => t.pass) : r.status > 0 && r.status < 400);
export { stepPassed };

/**
 * Run a scenario.
 * @param {object} o
 * @param {object} o.scenario
 * @param {Array<object>} [o.rows]          data rows; one run per row (none: one run)
 * @param {Set<string>} [o.only]            run only these step ids (re-run failed)
 * @param {(step, ctx: { iteration, attempt, row, signal }) => Promise<object>} o.runStep  → response (with .tests)
 * @param {(report) => void} [o.onUpdate]
 * @param {AbortSignal} [o.signal]
 * @param {(ms: number, signal) => Promise<void>} [o.sleep]
 * @returns {Promise<object>} report
 */
export async function runScenario({ scenario, rows = [], only = null, runStep, onUpdate = () => {}, signal, sleep = defaultSleep }) {
  const iterations = rows.length ? rows : [null];
  const steps = scenario.steps.filter(s => s.enabled && (!only || only.has(s.id)));
  const report = {
    scenarioId: scenario.id, startedAt: Date.now(), finishedAt: null, status: 'running',
    iterations: iterations.length, only: only ? [...only] : null,
    results: [],   // { stepId, iteration, attempt, name, method, status, ms, size, error, tests, pass, skipped }
  };
  const update = () => onUpdate(report);
  let stopped = false;
  outer:
  for (let it = 0; it < iterations.length; it++) {
    for (const step of steps) {
      for (let attempt = 0; attempt < step.repeat; attempt++) {
        if (signal?.aborted) { stopped = true; break outer; }
        if (step.delayMs) { await sleep(step.delayMs, signal); if (signal?.aborted) { stopped = true; break outer; } }
        const entry = { stepId: step.id, iteration: it, attempt, running: true };
        report.results.push(entry);
        update();
        let res;
        try { res = await runStep(step, { iteration: it, attempt, row: iterations[it], signal }); } catch (e) { res = { error: e.message, kind: 'error' }; }
        Object.assign(entry, {
          running: false, name: res?.name || '', method: res?.method || '',
          status: res?.status ?? 0, ms: res?.ms ?? 0, size: res?.size ?? 0,
          error: res?.error || null, kind: res?.kind || null,
          tests: res?.tests ? res.tests.map(t => ({ pass: t.pass, name: t.name || '', message: t.message || '', actual: t.actual })) : null,
          setVars: res?.setVars || null, response: res,
          pass: stepPassed(res),
        });
        if (res?.kind === 'cancel') { entry.pass = false; stopped = true; break outer; }
        update();
        if (!entry.pass && step.onFail === 'stop') { stopped = 'failed'; break outer; }
      }
    }
  }
  report.finishedAt = Date.now();
  report.status = stopped === true ? 'stopped' : stopped === 'failed' ? 'failed-stop' : 'done';
  update();
  return report;
}

function defaultSleep(ms, signal) {
  return new Promise((resolve) => {
    const t = setTimeout(resolve, ms);
    signal?.addEventListener('abort', () => { clearTimeout(t); resolve(); }, { once: true });
  });
}

/** { passed, failed, total, ms } */
export function reportSummary(report) {
  const done = (report?.results || []).filter(r => !r.running);
  const passed = done.filter(r => r.pass).length;
  return { passed, failed: done.length - passed, total: done.length, ms: done.reduce((n, r) => n + (r.ms || 0), 0) };
}

/** The report as kept with the scenario: no response bodies. */
export function storableReport(report) {
  return { ...report, results: report.results.map(({ response, ...r }) => r) };
}

/** Step ids that failed in a report (for "Re-run failed"). */
export const failedSteps = (report) => new Set((report?.results || []).filter(r => !r.running && !r.pass).map(r => r.stepId));

// ── HitAPI flow suites ──────────────────────────────────────────────────────

/** "$.data.token" → "data.token" (flow suites use dotted paths). Returns null for paths they can't read. */
export function toFlowPath(p) {
  const s = String(p || '').trim().replace(/^\$\.?/, '').replace(/\[(\d+)\]/g, '.$1').replace(/^\./, '');
  return /^[\w$-]+(\.[\w$-]+)*$/.test(s) ? s : null;
}

/**
 * A step's request (template: collection settings applied, {{vars}} kept) → a flow step for addFlowStep.
 * Secret headers are not sent: the cloud run uses the token a login step extracts, or the suite/project token.
 * @returns {{ step, extract, dropped: string[] }}
 */
export function toFlowStep(name, d) {
  const { draft: masked, masked: dropped } = maskDraft(d);
  const headers = {};
  for (const r of masked.headers || []) if (r.enabled !== false && String(r.key || '').trim() && r.value !== '') headers[r.key.trim()] = r.value;
  let payload = null;
  if (d.bodyType === 'json' && d.bodies?.json?.trim()) { try { payload = JSON.parse(d.bodies.json); } catch { payload = null; } }
  const statusTest = (d.tests || []).find(t => t.enabled !== false && t.target === 'status' && t.op === 'equals');
  const step = {
    name: String(name || 'Step').slice(0, 120), method: String(d.method || 'GET').toUpperCase(),
    url_override: normalizeUrl(d.url),
    input_headers: Object.keys(headers).length ? headers : null,
    input_payload: payload,
    expected_status: statusTest ? Number(statusTest.expected) || null : null,
  };
  const extract = (d.extract || []).filter(r => r.enabled !== false && r.from === 'json' && r.name && toFlowPath(r.path))
    .map(r => ({ var: r.name.trim(), path: toFlowPath(r.path) }));
  return { step, extract, dropped: dropped.map(x => x.replace(/^header:/, '').replace(/^auth:/, 'auth ')) };
}

/** A flow suite (from GET /flows/:id) → an inline-step scenario. */
export function fromFlowSuite(suite, steps, project, emptyDraft) {
  const s = newScenario(suite.name || 'Flow suite');
  s.hitapi = { projectId: project.id, suiteId: suite.id };
  const parse = (v, fallback) => { if (v == null || v === '') return fallback; if (typeof v !== 'string') return v; try { return JSON.parse(v); } catch { return fallback; } };
  for (const st of steps) {
    const d = emptyDraft();
    d.method = String(st.method || st.endpoint_method || 'GET').toUpperCase();
    let url = st.url_override || `${String(project.base_url || '').replace(/\/+$/, '')}${st.endpoint_path || ''}`;
    const params = parse(st.input_params, null);
    if (params && typeof params === 'object' && Object.keys(params).length) url += `${url.includes('?') ? '&' : '?'}${Object.entries(params).map(([k, v]) => `${encodeURIComponent(k)}=${String(v).startsWith('{{') ? v : encodeURIComponent(v)}`).join('&')}`;
    d.url = url;
    const headers = parse(st.input_headers, {});
    d.headers = Object.entries(headers || {}).map(([key, value]) => ({ key, value: String(value), enabled: true }));
    const payload = parse(st.input_payload, null);
    if (payload != null) { d.bodyType = 'json'; d.bodies.json = JSON.stringify(payload, null, 2); }
    d.extract = (parse(st.extract_vars, []) || []).map(x => ({ name: x.var, from: 'json', path: `$.${x.path}`, enabled: true }));
    if (st.expected_status) d.tests = [{ id: id('t'), target: 'status', op: 'equals', path: '', expected: String(st.expected_status), enabled: true }];
    s.steps.push(newStep('inline', { name: st.name || `${d.method} ${st.endpoint_path || ''}`, draft: d, onFail: st.skip_if_failed ? 'stop' : 'continue' }));
  }
  return s;
}
