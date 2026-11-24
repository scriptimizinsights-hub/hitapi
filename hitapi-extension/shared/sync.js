/**
 * shared/sync.js — what gets synced across devices, and how two edited copies are
 * merged (roadmap feature 11). Pure functions.
 *
 * Three kinds are synced: collections, environments (plus Globals) and scenarios.
 * Each is a list of items with an id. Before upload, secrets are removed (request
 * auth secrets and secret headers, secret variable values; {{variable}} references
 * such as "Bearer {{token}}" are kept); after download they are
 * filled back in from this device's own copy, so a token never leaves the browser.
 *
 * Merge (three-way, per item, against the copy both sides had at the last sync):
 *   changed on one side only  → that side's version
 *   changed on both sides     → the other device's version wins, and this device's is kept
 *                               as "Name (conflict copy)"
 *   deleted on one side       → deleted, unless the other side changed it (then it's kept)
 */

import { maskDraft } from './history.js';
import { maskRows, normalizeRows } from './vars.js';
import { stableJson } from './collections.js';

export const SYNC_KINDS = ['collections', 'environments', 'scenarios'];
const GLOBALS_ID = '__globals';

// ── secrets out ──
// keepVars: "Bearer {{token}}" is kept — a reference, not a secret (the value lives in an environment).
// Without it a new device, or a cloud schedule run, would get an empty token.
const KEEP = { keepVars: true };
const maskAuth = (a) => maskDraft({ headers: [], auth: a }, KEEP).draft.auth;
const maskHeaders = (rows) => maskDraft({ headers: rows || [] }, KEEP).draft.headers;

function stripNode(n) {
  if (n.type === 'request') return { ...n, draft: maskDraft(n.draft, KEEP).draft };
  const c = { ...n, children: (n.children || []).map(stripNode) };
  if (n.settings) c.settings = { ...n.settings, auth: maskAuth(n.settings.auth), headers: maskHeaders(n.settings.headers), variables: maskRows(n.settings.variables) };
  return c;
}

/** Local data → the items that are synced (secrets removed). */
export function itemsOf(kind, data) {
  if (kind === 'collections') return (data?.items || []).map(stripNode);
  if (kind === 'environments') {
    const envs = (data?.envs || []).map(e => ({ id: e.id, name: e.name, vars: maskRows(e.vars) }));
    return [{ id: GLOBALS_ID, name: 'Globals', vars: maskRows(data?.globals || []) }, ...envs];
  }
  if (kind === 'scenarios') {
    return (data?.items || []).map(({ lastReport, ...s }) => ({   // run reports stay on the device
      ...s, steps: (s.steps || []).map(st => (st.kind === 'inline' && st.draft ? { ...st, draft: maskDraft(st.draft, KEEP).draft } : st)),
    }));
  }
  return [];
}

export const hashItem = (item) => {
  // a cheap, stable fingerprint (FNV-1a over the sorted JSON)
  const s = stableJson(item);
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193); }
  return `${(h >>> 0).toString(36)}-${s.length.toString(36)}`;
};

export const hashes = (items) => Object.fromEntries(items.map(it => [it.id, hashItem(it)]));
export const sameItems = (items, base) => {
  const h = hashes(items);
  const a = Object.keys(h); const b = Object.keys(base || {});
  return a.length === b.length && a.every(k => base[k] === h[k]);
};

let seq = 0;
const freshId = (id) => `${String(id).replace(/-copy\w*$/, '')}-copy${Date.now().toString(36)}${(seq++).toString(36)}`;
function renewIds(n) {
  const c = structuredClone(n);
  const walk = (x) => { x.id = freshId(x.id); (x.children || []).forEach(walk); (x.steps || []).forEach(st => { st.id = freshId(st.id); }); };
  walk(c);
  return c;
}

/**
 * @param {{ base: object, local: Array, remote: Array }} o  base: { id: hash } from the last sync
 * @returns {{ items: Array, conflicts: string[], fromRemote: number, removed: number }}
 */
export function merge3({ base = {}, local = [], remote = [] }) {
  const L = new Map(local.map(x => [x.id, x]));
  const R = new Map(remote.map(x => [x.id, x]));
  const order = [...local.map(x => x.id), ...remote.map(x => x.id).filter(id => !L.has(id))];
  const items = []; const conflicts = []; let fromRemote = 0; let removed = 0;
  for (const id of order) {
    const l = L.get(id); const r = R.get(id); const b = base[id];
    const lh = l && hashItem(l); const rh = r && hashItem(r);
    if (l && r && b === undefined && id === GLOBALS_ID && !(l.vars || []).some(v => v.key)) { items.push(r); fromRemote++; continue; }   // empty Globals on a new device
    if (l && r) {
      if (lh === rh) items.push(l);
      else if (lh === b) { items.push(r); fromRemote++; }          // only the other device changed it
      else if (rh === b) items.push(l);                              // only this device changed it
      else {                                                         // both changed it
        items.push(r); fromRemote++;
        if (id !== GLOBALS_ID) { const copy = renewIds(l); copy.name = `${l.name} (conflict copy)`; items.push(copy); conflicts.push(l.name); }
        else conflicts.push('Globals');
      }
    } else if (l) {
      if (b === undefined || lh !== b) items.push(l);                // new here, or changed here after the other device deleted it
      else removed++;                                                // deleted on the other device
    } else if (r) {
      if (b === undefined || rh !== b) { items.push(r); fromRemote++; }   // new there, or changed there after this device deleted it
      else removed++;                                                // deleted here
    }
  }
  return { items, conflicts, fromRemote, removed };
}

// ── secrets back in ──

function fillDraft(next, mine) {
  if (!next || !mine) return next;
  const d = structuredClone(next);
  for (const row of d.headers || []) {
    if (row.value === '') {
      const m = (mine.headers || []).find(x => String(x.key).trim().toLowerCase() === String(row.key).trim().toLowerCase() && x.value);
      if (m) row.value = m.value;
    }
  }
  d.auth = fillAuth(d.auth, mine.auth);
  return d;
}
function fillAuth(a, mine) {
  if (!a || !mine) return a;
  const out = structuredClone(a);
  for (const [sec, field] of [['bearer', 'token'], ['basic', 'password'], ['apikey', 'value'], ['custom', 'value'], ['oauth2', 'clientSecret']]) {
    if (out[sec] && !out[sec][field] && mine[sec]?.[field]) out[sec][field] = mine[sec][field];
  }
  return out;
}
function fillRows(rows, mine) {
  return normalizeRows(rows).map(r => {
    if (r.secret && !r.value) { const m = normalizeRows(mine).find(x => x.key === r.key && x.value); if (m) return { ...r, value: m.value }; }
    return r;
  });
}

/** Index every request/folder of local collections by id. */
function indexNodes(items) {
  const m = new Map();
  const walk = (n) => { m.set(n.id, n); (n.children || []).forEach(walk); };
  (items || []).forEach(walk);
  return m;
}

/**
 * Merged (secret-free) items → data for this device, with this device's secrets put back
 * and things that are not synced (scenario reports, the active environment) kept.
 */
export function applyItems(kind, items, localData) {
  if (kind === 'collections') {
    const mine = indexNodes(localData?.items);
    const fill = (n) => {
      const m = mine.get(n.id);
      if (n.type === 'request') return { ...n, draft: fillDraft(n.draft, m?.draft) };
      const c = { ...n, children: (n.children || []).map(fill) };
      if (n.settings && m?.settings) c.settings = { ...n.settings, auth: fillAuth(n.settings.auth, m.settings.auth), headers: fillDraft({ headers: n.settings.headers }, { headers: m.settings.headers }).headers, variables: fillRows(n.settings.variables, m.settings.variables) };
      return c;
    };
    return { items: items.map(fill) };
  }
  if (kind === 'environments') {
    const g = items.find(x => x.id === GLOBALS_ID);
    const envs = items.filter(x => x.id !== GLOBALS_ID).map(e => ({ ...e, vars: fillRows(e.vars, (localData?.envs || []).find(x => x.id === e.id)?.vars) }));
    return { globals: g ? fillRows(g.vars, localData?.globals) : (localData?.globals || []), envs };
  }
  if (kind === 'scenarios') {
    const mine = new Map((localData?.items || []).map(s => [s.id, s]));
    return {
      items: items.map(s => {
        const m = mine.get(s.id);
        const steps = (s.steps || []).map(st => (st.kind === 'inline' ? { ...st, draft: fillDraft(st.draft, m?.steps?.find(x => x.id === st.id)?.draft) } : st));
        return { ...s, steps, lastReport: m?.lastReport ?? null };
      }),
    };
  }
  return localData;
}

/** "3 minutes ago" */
export function ago(ms, now = Date.now()) {
  const s = Math.round((now - ms) / 1000);
  if (s < 45) return 'just now';
  if (s < 3600) return `${Math.round(s / 60)} min ago`;
  if (s < 86400) return `${Math.round(s / 3600)} h ago`;
  return new Date(ms).toLocaleString();
}
