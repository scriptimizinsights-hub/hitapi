/**
 * services/schedules/engine.js — runs Workbench requests on the server (web roadmap W9),
 * with the HitAPI extension's own engine (hitapi-extension/shared): collection settings,
 * {{variables}}, tests, "Set vars", scenarios with data rows. The same code runs in the
 * extension, on the website and in hitapi-cli.
 *
 * Requests go out through the public proxy (services/proxy.js): no private or local
 * hosts, every redirect checked, 15 s timeout, 2 MB response cap.
 */

import { effectiveDraft, requestsIn, find } from '../../../../hitapi-extension/shared/collections.js';
import { buildScope, resolveDraft, resolveString, runExtract, setVar, normalizeRows } from '../../../../hitapi-extension/shared/vars.js';
import { runTests, describe } from '../../../../hitapi-extension/shared/assert.js';
import { methodProblem, urlProblem, normalizeUrl, hasNoBody, isValidHeaderName } from '../../../../hitapi-extension/shared/http.js';
import { emptyBodies, normalizeBodies, detectBody, buildBody } from '../../../../hitapi-extension/shared/body.js';
import { normalizeAuth, authParts, addQuery, oauthTokenRequest, oauthKey } from '../../../../hitapi-extension/shared/auth.js';
import { runScenario, parseData, stepPassed } from '../../../../hitapi-extension/shared/scenarios.js';
import { executePublicRequest, PublicRequestError } from '../proxy.js';

export const BODY_KEEP = 10 * 1024;   // per request, in a run's stored results

/** Same as the Workbench's normalizeDraft. */
export function normalizeDraft(d) {
  const draft = { method: 'GET', url: '', params: [], headers: [], bodyType: 'json', bodies: emptyBodies(), extract: [], tests: [], ...(d || {}) };
  draft.method = String(draft.method || 'GET').trim() || 'GET';
  draft.headers = Array.isArray(draft.headers) ? draft.headers : [];
  draft.settings = { timeoutSec: 30, followRedirects: true, withCookies: false, ...(draft.settings || {}) };
  draft.extract = Array.isArray(draft.extract) ? draft.extract : [];
  draft.tests = Array.isArray(draft.tests) ? draft.tests : [];
  if (!d?.bodies) {
    const ct = draft.headers.find(r => r.enabled !== false && String(r.key).trim().toLowerCase() === 'content-type')?.value || '';
    Object.assign(draft, detectBody(typeof draft.body === 'string' ? draft.body : '', ct));
  } else { draft.bodies = normalizeBodies(draft.bodies); draft.bodyType = draft.bodyType || 'json'; }
  delete draft.body;
  draft.auth = normalizeAuth(draft.auth);
  return draft;
}

const toB64 = (bytes) => { let s = ''; for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000)); return btoa(s); };

/** One request through the public proxy → the Workbench's response record, or { error, kind }. */
async function viaProxy({ method, url, headers, body, follow }) {
  const input = { method, url, headers, follow_redirects: follow };
  if (typeof body === 'string') input.body = body;
  else if (body instanceof FormData) {
    input.form = [];
    for (const [name, v] of body.entries()) {
      if (typeof v === 'string') input.form.push({ name, value: v });
      else input.form.push({ name, filename: v.name || 'file', content_type: v.type || 'application/octet-stream', base64: toB64(new Uint8Array(await v.arrayBuffer())) });
    }
  } else if (body instanceof Blob) input.body_base64 = toB64(new Uint8Array(await body.arrayBuffer()));
  else if (body instanceof URLSearchParams) input.body = body.toString();
  try {
    const r = await executePublicRequest(input);
    return {
      status: r.status, statusText: r.status_text || '', ok: r.ok, ms: r.time_ms, ttfb: r.ttfb_ms, size: r.size_bytes, truncated: r.truncated,
      headers: r.header_list || [], contentType: r.content_type || '', text: r.body || '', base64: r.body_base64 || null,
      redirects: r.redirects || [], finalUrl: r.final_url, request: r.request,
    };
  } catch (e) {
    return { error: e.message, kind: e instanceof PublicRequestError ? (e.status === 504 ? 'timeout' : e.status === 400 || e.status === 413 ? 'invalid' : 'network') : 'error' };
  }
}

/** A draft (variables filled in) → response record. OAuth 2.0 client credentials tokens are cached per run. */
export async function sendDraft(draft, tokens = new Map()) {
  let oauth = null;
  if (draft.auth?.type === 'oauth2') {
    const o = draft.auth.oauth2; const key = oauthKey(o);
    oauth = tokens.get(key);
    if (!oauth || (oauth.expires_at && Date.now() > oauth.expires_at - 30_000)) {
      if (!String(o.tokenUrl || '').trim()) return { error: 'OAuth 2.0: no token URL', kind: 'invalid' };
      const req = oauthTokenRequest(o);
      const r = await viaProxy({ method: 'POST', url: req.url, headers: req.headers, body: req.body, follow: true });
      let data = null; try { data = JSON.parse(r.text); } catch { /* not JSON */ }
      if (r.error || r.status >= 400 || !data?.access_token) return { error: `OAuth 2.0: couldn't get a token (${r.error || `HTTP ${r.status}`})`, kind: 'invalid' };
      oauth = { access_token: data.access_token, token_type: data.token_type || 'Bearer', expires_at: data.expires_in ? Date.now() + Number(data.expires_in) * 1000 : null };
      tokens.set(key, oauth);
    }
  }
  const method = String(draft.method || 'GET').trim();
  const auth = authParts(draft.auth, { oauthToken: oauth });
  if (auth.problems.length) return { error: auth.problems.join('\n'), kind: 'invalid' };
  let rows = (draft.headers || []).filter(r => r.enabled !== false && String(r.key || '').trim());
  for (const ah of auth.headers) rows = rows.filter(r => String(r.key).trim().toLowerCase() !== ah.key.toLowerCase());
  rows = [...rows, ...auth.headers];
  const headers = {};
  for (const r of rows) {
    const k = String(r.key).trim();
    if (!isValidHeaderName(k)) return { error: `"${k}" is not a valid header name`, kind: 'invalid' };
    headers[k] = String(r.value ?? '');
  }
  let body;
  const warnings = [];
  if (!hasNoBody(method)) {
    let ct = Object.keys(headers).find(k => k.toLowerCase() === 'content-type');
    if (ct && !headers[ct].trim()) { delete headers[ct]; ct = undefined; }
    const built = buildBody(draft, { binary: null, form: new Map() }, ct ? headers[ct] : '');
    if (built.problems.length) return { error: built.problems.join('\n'), kind: 'invalid' };
    warnings.push(...built.warnings);
    body = built.body;
    if (built.dropContentType && ct) delete headers[ct];
    else if (!ct && body !== undefined && built.contentType && draft.bodyType !== 'form') headers['Content-Type'] = built.contentType;
  }
  const url = addQuery(normalizeUrl(draft.url), auth.query);
  const res = await viaProxy({ method, url, headers, body, follow: draft.settings?.followRedirects !== false });
  if (warnings.length && !res.error) res.warnings = warnings;
  return res;
}

/** Variables a schedule's run uses: the account's environment and Globals, with the schedule's secret values filled in. */
export function runVars({ envs, envId, secrets = {} }) {
  const fill = (rows) => normalizeRows(rows).map(r => (r.secret && r.value === '' && secrets[r.key] !== undefined ? { ...r, value: String(secrets[r.key]) } : r));
  const env = envId ? (envs?.envs || []).find(e => e.id === envId) : null;
  const vars = env ? { name: env.name, vars: fill(env.vars) } : { name: 'Globals', vars: [] };
  return { env: vars, globals: fill(envs?.globals || []), fill };
}

/**
 * The steps of a schedule's target (from the account copy).
 * @returns {{ name, steps, lookup: Map<stepId, { draft, ancestors, name }>, data } | { error }}
 */
export function suiteFor({ kind, id }, { tree, scenarios }, fill = (r) => r) {
  const withSecrets = (ancestors) => ancestors.map(a => ({ ...a, settings: { ...a.settings, variables: fill(a.settings?.variables || []) } }));
  if (kind === 'scenario') {
    const s = (scenarios?.items || []).find(x => x.id === id);
    if (!s) return { error: 'The scenario was deleted from your account.' };
    const lookup = new Map();
    for (const st of s.steps || []) {
      if (st.kind === 'saved') {
        const f = find(tree, st.requestId);
        if (!f || f.node.type !== 'request') lookup.set(st.id, { missing: 'The saved request for this step was deleted.', name: 'Deleted request' });
        else lookup.set(st.id, { draft: f.node.draft, ancestors: withSecrets(f.ancestors), name: f.node.name });
      } else lookup.set(st.id, { draft: st.draft, ancestors: [], name: st.name || 'Request' });
    }
    return { name: s.name, steps: s.steps || [], lookup, data: s.data || null };
  }
  const f = find(tree, id);
  if (!f || f.node.type === 'request') return { error: `The ${kind} was deleted from your account.` };
  const items = requestsIn(tree, id);
  const lookup = new Map();
  const steps = items.map((it, i) => {
    const sid = `r${i}`;
    lookup.set(sid, { draft: it.node.draft, ancestors: withSecrets(it.ancestors), name: it.node.name });
    return { id: sid, kind: 'inline', name: it.node.name, enabled: true, delayMs: 0, repeat: 1, onFail: 'continue' };
  });
  return { name: f.node.name, steps, lookup, data: null };
}

/** Requests a run will send (steps × repeats × data rows), to check the limit before starting. */
export function plannedRequests(suite) {
  let rows = 1;
  try { const r = suite.data ? parseData(suite.data) : []; rows = Math.max(1, r.length); } catch { /* reported by the run */ }
  return rows * (suite.steps || []).filter(s => s.enabled !== false).reduce((n, s) => n + Math.max(1, Number(s.repeat) || 1), 0);
}

const cut = (s) => (typeof s === 'string' && s.length > BODY_KEEP ? `${s.slice(0, BODY_KEEP)}… (cut at 10 KB)` : s);

/**
 * Run a suite with the shared engine. vars.env.vars is updated by "Set vars" during the run (not saved back).
 * @param {object} o { maxRequests, signal, secretValues: string[] (blanked from the stored results) }
 */
export async function runSuite(suite, vars, { maxRequests = 100, signal, secretValues = [] } = {}) {
  let rows;
  try { rows = suite.data ? parseData(suite.data) : []; } catch (e) { return { error: `Data: ${e.message}`, results: [] }; }
  const tokens = new Map();
  let sent = 0;
  const scrub = (t) => secretValues.filter(v => v && v.length >= 4).reduce((s, v) => String(s).split(v).join('••••••'), String(t ?? ''));
  const runStep = async (step, { row }) => {
    const item = suite.lookup.get(step.id);
    if (!item || item.missing) return { error: item?.missing || 'Unknown step', kind: 'invalid', name: item?.name || step.name };
    if (++sent > maxRequests) return { error: `Stopped: a cloud run can send at most ${maxRequests} requests.`, kind: 'cancel', name: item.name };
    const nd = normalizeDraft(structuredClone(item.draft));
    const template = effectiveDraft(nd, item.ancestors);
    const scope = buildScope({ globals: vars.globals, env: vars.env, ancestors: item.ancestors, local: row });
    const { draft: eff, missing } = resolveDraft(template, scope);
    const base = { name: item.name, method: String(eff.method).toUpperCase(), url: scrub(eff.url) };
    if (missing.length) return { ...base, error: `Not defined: ${missing.map(n => `{{${n}}}`).join(', ')}. Add it to the environment, or give its value in the schedule's secrets.`, kind: 'invalid' };
    const problem = methodProblem(eff.method) || urlProblem(eff.url);
    if (problem) return { ...base, error: problem, kind: 'invalid' };
    const res = await sendDraft(eff, tokens);
    if (!res.error) {
      const fill = (s) => (String(s ?? '').includes('{{') ? resolveString(s, scope).value : s);
      const list = nd.tests.filter(t => t.enabled !== false);
      if (list.length) res.tests = runTests(list.map(t => ({ ...t, path: fill(t.path), expected: fill(t.expected) })), res).map(r => ({ ...r, name: r.name || describe(r.test) }));
      const x = runExtract(nd.extract, res);
      for (const r of x.filter(r => r.ok)) vars.env.vars = setVar(vars.env.vars, r.name, r.value);
      res.setVars = x.filter(r => r.ok).map(r => r.name);
    }
    return { ...res, ...base };
  };
  const report = await runScenario({ scenario: { id: suite.name, steps: suite.steps }, rows, runStep, signal });
  // what is kept: no secrets, bodies cut
  const results = report.results.filter(r => !r.running).map(r => ({
    name: r.name, method: r.method, url: r.response?.url || '', iteration: r.iteration, attempt: r.attempt,
    status: r.status, ms: r.ms, size: r.size, pass: r.pass, error: r.error ? scrub(r.error) : null,
    tests: (r.tests || []).map(t => ({ pass: t.pass, name: scrub(t.name), message: scrub(t.message), actual: scrub(t.actual) })),
    setVars: r.setVars || [],
    response: r.response && !r.response.error ? { headers: (r.response.headers || []).map(([k, v]) => [k, scrub(v)]), contentType: r.response.contentType, body: scrub(cut(r.response.text || '')) } : null,
  }));
  return { status: report.status, iterations: report.iterations, results, stepPassed };
}
