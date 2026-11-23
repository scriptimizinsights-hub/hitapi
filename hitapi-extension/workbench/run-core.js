/**
 * workbench/run-core.js — runs one saved or inline request the way every
 * runner does: collection settings applied, {{variables}} filled in, sent,
 * tests checked, kept in History, "Set vars" rules applied.
 *
 * Used by the Workbench page (collection runner, scenarios) and by the
 * service worker (scheduled runs, background/workbench/scheduler.js), so it
 * has no DOM code.
 */

import { effectiveDraft } from '../shared/collections.js';
import { buildScope, resolveDraft, resolveString, runExtract, setVar } from '../shared/vars.js';
import { runTests } from '../shared/assert.js';
import { methodProblem, urlProblem } from '../shared/http.js';
import { normalizeDraft } from './state.js';
import { send } from './send.js';
import { addEntry } from './history-store.js';
import { updateEnvs } from './env-store.js';

const NO_FILES = () => ({ binary: null, form: new Map() });

/** envState: { globals, envs, active } */
export const activeEnvOf = (envState) => envState?.envs?.find(e => e.id === envState.active) || null;

export const scopeOf = (envState, ancestors = [], local = null) =>
  buildScope({ globals: envState?.globals || [], env: activeEnvOf(envState), ancestors, local });

/**
 * What a request sends: template = collection base URL, headers and auth applied
 * ({{vars}} kept, as saved in history); resolved = variables filled in too.
 */
export function prepareRequest(d, ancestors, local, envState) {
  const template = effectiveDraft(d, ancestors);
  const scope = scopeOf(envState, ancestors, local);
  const { draft: resolved, missing, used } = resolveDraft(template, scope);
  // values of secret variables: blanked out of what history keeps (e.g. an API that echoes the request back)
  const secrets = used.map(n => scope.get(n)).filter(v => v?.secret && v.value.length >= 4).map(v => v.value);
  return { template, resolved, missing, secrets };
}

/** Run a request's checks on its response; {{vars}} in paths and expected values are filled in first. */
export function checkWith(tests, res, scope) {
  const list = (tests || []).filter(t => t.enabled !== false);
  if (!list.length) return null;
  const fill = (s) => (String(s ?? '').includes('{{') ? resolveString(s, scope).value : s);
  return runTests(list.map(t => ({ ...t, path: fill(t.path), expected: fill(t.expected) })), res);
}

/**
 * Run "Set vars" rules; values go to envState.active, or Globals.
 * @returns {Promise<{ results, envState }>}  envState: the stored state after the write (or null: nothing written)
 */
export async function applyVars(rules, res, envId) {
  const results = runExtract(rules, res);
  const ok = results.filter(r => r.ok);
  let envState = null;
  if (ok.length) {
    envState = await updateEnvs((s) => {
      const e = envId ? s.envs.find(x => x.id === envId) : null;
      for (const r of ok) { if (e) e.vars = setVar(e.vars, r.name, r.value); else s.globals = setVar(s.globals, r.name, r.value); }
    });
  }
  return { results, envState };
}

/**
 * Send one request.
 * @param {object} o
 * @param {object} o.draft         the request as saved
 * @param {Array}  [o.ancestors]   its collection / folders (find(tree, id).ancestors)
 * @param {string} [o.name]
 * @param {object} [o.row]         data row (scenario data)
 * @param {AbortSignal} [o.signal]
 * @param {() => object} o.getEnv  current { globals, envs, active }
 * @param {(envState) => void} [o.setEnv]  called after "Set vars" wrote to storage
 * @returns {Promise<object>} the response record plus name, method, setVars (or { error, kind })
 */
export async function runRequest({ draft, ancestors = [], name = 'Request', row = null, signal, getEnv, setEnv = () => {} }) {
  const nd = normalizeDraft(structuredClone(draft));
  const env = getEnv();
  const { template, resolved: eff, missing, secrets } = prepareRequest(nd, ancestors, row, env);
  const base = { name, method: eff.method };
  const envName = activeEnvOf(env)?.name;
  if (missing.length) return { ...base, error: `Not defined${envName ? ` in "${envName}"` : ''}: ${missing.map(n => `{{${n}}}`).join(', ')}`, kind: 'invalid' };
  const problem = methodProblem(eff.method) || urlProblem(eff.url);
  if (problem) return { ...base, error: problem, kind: 'invalid' };
  const c = new AbortController();
  const stop = () => c.abort('cancel');
  signal?.addEventListener('abort', stop);
  const t = setTimeout(() => c.abort('timeout'), (eff.settings?.timeoutSec || 30) * 1000);
  try {
    const res = await send(eff, { signal: c.signal, files: NO_FILES() });
    if (res.kind === 'cancel') return { ...res, ...base };
    const results = checkWith(nd.tests, res, scopeOf(env, ancestors, row));
    if (results) res.tests = results;
    addEntry(template, res, { resolvedUrl: eff.url, redact: secrets }).catch(() => {});
    // "Set vars" rules run in order, so a login request can set {{token}} for the next ones
    const { results: x, envState } = await applyVars(nd.extract || [], res, env.active);
    if (envState) setEnv(envState);
    res.setVars = x.filter(r => r.ok).map(r => r.name);
    const bad = x.filter(r => !r.ok);
    if (bad.length) res.warnings = [...(res.warnings || []), ...bad.map(r => `${r.name} not set: ${r.reason}`)];
    return { ...res, ...base };
  } finally { clearTimeout(t); signal?.removeEventListener('abort', stop); }
}
