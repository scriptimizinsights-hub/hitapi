/**
 * src/run.mjs — runs suites with the extension's own engine
 * (shared/scenarios.js runScenario): same variables, tests and "Set vars".
 */

import { effectiveDraft } from './shared/collections.js';
import { buildScope, resolveDraft, resolveString, runExtract, setVar } from './shared/vars.js';
import { runTests, describe } from './shared/assert.js';
import { methodProblem, urlProblem } from './shared/http.js';
import { emptyBodies, normalizeBodies, detectBody } from './shared/body.js';
import { normalizeAuth } from './shared/auth.js';
import { runScenario, parseData, stepPassed } from './shared/scenarios.js';
import { sendDraft } from './send.mjs';

/** Same as the Workbench's normalizeDraft (workbench/state.js), without the browser parts. */
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

/**
 * @param {object} suite        from loadSuites
 * @param {object} vars         { env: { name, vars }, globals }  — env.vars is updated by "Set vars"
 * @param {object} o            { rows, timeoutMs, signal, onStep }
 * @returns {Promise<object>}   report (shared/scenarios.js) with suite info
 */
export async function runSuite(suite, vars, o = {}) {
  let rows = o.rows || null;
  if (!rows) {
    try { rows = suite.data ? parseData(suite.data) : []; } catch (e) { return { suite, error: `Data: ${e.message}`, results: [] }; }
  }
  const runOne = async (step, { row, signal }) => {
    const item = suite.lookup.get(step.id);
    if (!item || item.missing) return { error: item?.missing || 'Unknown step', kind: 'invalid', name: item?.name || step.name };
    const nd = normalizeDraft(structuredClone(item.draft));
    const template = effectiveDraft(nd, item.ancestors);
    const scope = buildScope({ globals: vars.globals, env: vars.env, ancestors: item.ancestors, local: row });
    const { draft: eff, missing } = resolveDraft(template, scope);
    const base = { name: item.name, method: eff.method, url: eff.url };
    if (missing.length) return { ...base, error: `Not defined: ${missing.map(n => `{{${n}}}`).join(', ')} — give a value with --var, --env-file or HITAPI_VAR_${missing[0]}`, kind: 'invalid' };
    const problem = methodProblem(eff.method) || urlProblem(eff.url);
    if (problem) return { ...base, error: problem, kind: 'invalid' };
    const res = await sendDraft(eff, { timeoutMs: o.timeoutMs, signal });
    if (!res.error || res.kind !== 'invalid') {
      const fill = (s) => (String(s ?? '').includes('{{') ? resolveString(s, scope).value : s);
      const list = nd.tests.filter(t => t.enabled !== false);
      if (list.length && !res.error) res.tests = runTests(list.map(t => ({ ...t, path: fill(t.path), expected: fill(t.expected) })), res).map(r => ({ ...r, name: r.name || describe(r.test) }));
      if (!res.error) {
        const x = runExtract(nd.extract, res);
        for (const r of x.filter(r => r.ok)) vars.env.vars = setVar(vars.env.vars, r.name, r.value);
        res.setVars = x.filter(r => r.ok).map(r => r.name);
        const bad = x.filter(r => !r.ok);
        if (bad.length) res.warnings = [...(res.warnings || []), ...bad.map(r => `${r.name} not set: ${r.reason}`)];
      }
    }
    return { ...res, ...base };
  };
  const runStep = async (step, ctx) => {
    const out = await runOne(step, ctx);
    o.onStep?.(out, stepPassed(out));
    return out;
  };
  const report = await runScenario({ scenario: { id: suite.name, steps: suite.steps }, rows, runStep, signal: o.signal });
  return { suite, ...report };
}
