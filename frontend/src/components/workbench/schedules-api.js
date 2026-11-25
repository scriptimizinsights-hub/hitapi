/**
 * Web Workbench (W9) — cloud schedules API (/api/schedules) and what a schedule needs
 * from this browser: which secret variables its requests use (their values are not in
 * the account copy, so the schedule stores them, encrypted).
 */

import { isDailyLimitResponse } from '../../utils/dailyLimit.js';
import { API_BASE, getToken } from '../../store/index.js';
import { find, requestsIn, effectiveDraft } from '@hitapi/shared/collections.js';
import { normalizeRows, VAR_RE } from '@hitapi/shared/vars.js';
import { maskDraft } from '@hitapi/shared/history.js';

// Free plan: at most hourly (docs/platform/usage-limits.md); the server checks once an hour
export const EVERY = [
  [60, 'Every hour'], [180, 'Every 3 hours'], [360, 'Every 6 hours'], [720, 'Every 12 hours'], [1440, 'Every day'],
];
export const everyLabel = (m) => EVERY.find(x => x[0] === Math.max(60, m))?.[1] || `Every ${m} minutes`;
export const KIND_LABEL = { collection: 'Collection', folder: 'Folder', scenario: 'Scenario' };

async function call(method, path = '', body) {
  const token = getToken();
  if (!token) throw new Error('Sign in to use cloud schedules.');
  let res;
  try { res = await fetch(`${API_BASE}/schedules${path}`, { method, headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body: body ? JSON.stringify(body) : undefined }); }
  catch { throw new Error('Couldn\'t reach HitAPI. Check your connection.'); }
  const data = await res.json().catch(() => null);
  if (isDailyLimitResponse(res, data)) { const e = new Error(data.error); e.code = 'DAILY_LIMIT'; throw e; }
  if (res.status === 401) throw new Error('Signed out: sign in again.');
  if (!res.ok || data?.success === false) throw new Error(data?.error || `HitAPI error ${res.status}`);
  return data?.data ?? data;
}

export const schedulesApi = {
  list: () => call('GET'),
  create: (body) => call('POST', '', body),
  update: (id, body) => call('PATCH', `/${encodeURIComponent(id)}`, body),
  remove: (id) => call('DELETE', `/${encodeURIComponent(id)}`),
  runNow: (id) => call('POST', `/${encodeURIComponent(id)}/run`),
  runs: (id) => call('GET', `/${encodeURIComponent(id)}/runs`),
  run: (id, runId) => call('GET', `/${encodeURIComponent(id)}/runs/${encodeURIComponent(runId)}`),
};

/** The requests (templates) a target sends, from this browser's copy. */
function targetDrafts({ kind, id }, { tree, scenarios }) {
  if (kind === 'scenario') {
    const s = scenarios.items.find(x => x.id === id);
    if (!s) return { name: null, drafts: [] };
    const drafts = [];
    for (const st of s.steps || []) {
      if (st.kind === 'saved') { const f = find(tree, st.requestId); if (f) drafts.push({ name: f.node.name, draft: effectiveDraft(f.node.draft, f.ancestors), ancestors: f.ancestors }); }
      else if (st.draft) drafts.push({ name: st.name, draft: st.draft, ancestors: [] });
    }
    return { name: s.name, drafts };
  }
  const f = find(tree, id);
  if (!f || f.node.type === 'request') return { name: null, drafts: [] };
  return { name: f.node.name, drafts: requestsIn(tree, id).map(({ node, ancestors }) => ({ name: node.name, draft: effectiveDraft(node.draft, ancestors), ancestors })) };
}

export function targetName(target, data) { return targetDrafts(target, data).name; }

/**
 * Secret variables the target uses, with this browser's values (to offer them), and
 * secrets typed straight into a request or collection (not variables: they can't run in the cloud).
 * @returns {{ secrets: Array<{ key, value, from }>, literal: string[], produced: string[] }}
 */
export function scheduleNeeds(target, data, envId) {
  const { drafts } = targetDrafts(target, data);
  const used = new Set();
  const produced = new Set();
  for (const { draft } of drafts) {
    for (const m of JSON.stringify(draft).matchAll(VAR_RE)) used.add(m[1]);
    for (const r of draft.extract || []) if (r.enabled !== false && r.name) produced.add(String(r.name).trim());
  }
  const env = (data.envs.envs || []).find(e => e.id === envId);
  const sources = [
    ...(env ? normalizeRows(env.vars).map(r => ({ ...r, from: `the "${env.name}" environment` })) : []),
    ...normalizeRows(data.envs.globals).map(r => ({ ...r, from: 'Globals' })),
  ];
  for (const { ancestors } of drafts) for (const a of ancestors) for (const r of normalizeRows(a.settings?.variables)) sources.push({ ...r, from: `"${a.name}"` });
  const secrets = [];
  for (const r of sources) {
    if (!r.secret || !r.key || !used.has(r.key) || produced.has(r.key) || secrets.some(x => x.key === r.key)) continue;
    secrets.push({ key: r.key, value: r.value, from: r.from });
  }
  // secrets typed into a request's auth or headers (not a {{variable}}): removed from the account copy
  const literal = [];
  for (const { name, draft } of drafts) {
    // keepVars: {{variable}} references are fine; anything still masked is a typed-in secret
    if (maskDraft(draft, { keepVars: true }).masked.length) literal.push(name);
  }
  return { secrets, literal: [...new Set(literal)], produced: [...produced] };
}

