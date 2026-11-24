/**
 * Web Workbench (W8) — keeps collections, environments and scenarios the same in
 * this browser, the HitAPI extension and every other device signed in to the same
 * HitAPI account. The extension's algorithm (workbench/sync.js) and merge
 * (@hitapi/shared/sync.js), with localStorage and the website's sign-in.
 *
 *   hitapi:web:sync = { enabled, userId, device, kinds: { [kind]: { version, base: { id: hash } } },
 *                       lastSyncAt, lastError, lastResult }
 *
 * For each kind: download the account copy; if only this browser changed, upload; if only
 * the account changed, take it; if both changed, merge item by item (a conflict keeps this
 * browser's version as "Name (conflict copy)"), save it here and upload it. Uploads name the
 * version they replace, so two devices saving at once can't overwrite each other.
 * Secrets are removed before upload and filled back in from this browser's copy.
 */

import { SYNC_KINDS, itemsOf, hashes, sameItems, merge3, applyItems } from '@hitapi/shared/sync.js';
import { API_BASE, getToken } from '../../store/index.js';

export const SYNC_KEY = 'hitapi:web:sync';
const ls = () => { try { return typeof window !== 'undefined' ? window.localStorage : null; } catch { return null; } };
const listeners = new Set();

export function defaultDevice() {
  const ua = typeof navigator !== 'undefined' ? navigator.userAgent : '';
  const browser = /Edg\//.test(ua) ? 'Edge' : /Firefox\//.test(ua) ? 'Firefox' : /Chrome\//.test(ua) ? 'Chrome' : /Safari\//.test(ua) ? 'Safari' : 'a browser';
  const os = /iPhone|iPad/.test(ua) ? 'iOS' : /Android/.test(ua) ? 'Android' : /Mac OS X/.test(ua) ? 'Mac' : /Windows/.test(ua) ? 'Windows' : /CrOS/.test(ua) ? 'ChromeOS' : /Linux/.test(ua) ? 'Linux' : 'a computer';
  return `Website (${browser} on ${os})`;
}

const EMPTY = () => ({ enabled: false, userId: null, device: defaultDevice(), kinds: {}, lastSyncAt: 0, lastError: '', lastResult: null });

export function loadSyncState() {
  try { return { ...EMPTY(), ...JSON.parse(ls()?.getItem(SYNC_KEY) || '{}') }; } catch { return EMPTY(); }
}
export function saveSyncState(patch) {
  const next = { ...loadSyncState(), ...patch };
  try { ls()?.setItem(SYNC_KEY, JSON.stringify(next)); } catch { /* storage blocked */ }
  for (const fn of listeners) fn(next);
  return next;
}
export function onSyncStateChange(fn) {
  listeners.add(fn);
  const onStorage = (e) => { if (e.key === SYNC_KEY) fn(loadSyncState()); };
  if (typeof window !== 'undefined') window.addEventListener('storage', onStorage);
  return () => { listeners.delete(fn); if (typeof window !== 'undefined') window.removeEventListener('storage', onStorage); };
}

/** The account's sync route (the same one the extension uses). No redirect to the login page on 401. */
async function call(method, path = '', body) {
  const token = getToken();
  if (!token) { const e = new Error('Signed out: sign in to keep your Workbench in your account.'); e.signedOut = true; throw e; }
  let res;
  try {
    res = await fetch(`${API_BASE}/extension/sync${path}`, { method, headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body: body ? JSON.stringify(body) : undefined });
  } catch { const e = new Error('Offline: changes are kept here and saved when you are back online.'); e.offline = true; throw e; }
  const data = await res.json().catch(() => null);
  if (res.status === 401) { const e = new Error('Signed out: sign in to keep your Workbench in your account.'); e.signedOut = true; throw e; }
  if (!res.ok || data?.success === false) throw new Error(data?.error || `HitAPI error ${res.status}`);
  return data?.data ?? data;
}

export const getCloud = () => call('GET');
export const deleteCloud = () => call('DELETE');

let running = null;

/**
 * @param {{ load: (kind) => object, save: (kind, data) => void }} io  this browser's stores
 * @returns {Promise<{ ok, uploaded: string[], downloaded: string[], conflicts: string[], error?, offline?, signedOut? }>}
 */
export function syncNow(io, { force = false } = {}) {
  if (running) return running;
  running = (async () => {
    const state = loadSyncState();
    if (!state.enabled && !force) return { ok: false, skipped: true };
    const result = { ok: true, uploaded: [], downloaded: [], conflicts: [] };
    saveSyncState({ syncing: true });
    try {
      const { docs } = await getCloud();
      const kinds = { ...state.kinds };
      for (const kind of SYNC_KINDS) {
        kinds[kind] = await syncKind(kind, docs?.[kind] || null, kinds[kind] || { version: 0, base: {} }, io, state.device, result);
      }
      saveSyncState({ kinds, lastSyncAt: Date.now(), lastError: '', offline: false, syncing: false, lastResult: { uploaded: result.uploaded, downloaded: result.downloaded, conflicts: result.conflicts, at: Date.now() } });
    } catch (e) {
      Object.assign(result, { ok: false, error: e.message, offline: !!e.offline, signedOut: !!e.signedOut });
      saveSyncState({ lastError: e.message, offline: !!e.offline, syncing: false });
    }
    return result;
  })().finally(() => { running = null; });
  return running;
}

async function syncKind(kind, doc, mine, io, device, result, attempt = 0) {
  const localData = io.load(kind);
  const local = itemsOf(kind, localData);
  const remoteVersion = doc?.version || 0;
  const remote = doc?.data?.items || [];
  let items = local;
  if (remoteVersion !== mine.version) {
    // the account copy changed since this browser last synced
    const m = merge3({ base: mine.base, local, remote });
    items = m.items;
    if (m.fromRemote || m.removed || m.conflicts.length) {
      io.save(kind, applyItems(kind, items, localData));
      result.downloaded.push(kind);
    }
    result.conflicts.push(...m.conflicts);
    if (sameItems(items, hashes(remote)) && remoteVersion) return { version: remoteVersion, base: hashes(items) };
  } else if (sameItems(local, mine.base) && remoteVersion) {
    return mine;   // nothing changed anywhere
  }
  const put = await call('PUT', `/${kind}`, { data: { items }, base_version: remoteVersion, device });
  if (put.conflict) {
    if (attempt >= 3) throw new Error('Another device keeps saving at the same time. Try again in a moment.');
    return syncKind(kind, put.current, { version: remoteVersion, base: hashes(items) }, io, device, result, attempt + 1);
  }
  result.uploaded.push(kind);
  return { version: put.version, base: hashes(items) };
}

/** Stop keeping this browser in the account; optionally delete the account copy (for every device). */
export async function stopSync({ deleteCloud: del = false } = {}) {
  if (del) await deleteCloud();
  return saveSyncState({ enabled: false, kinds: {}, lastResult: null, lastError: '', syncing: false });
}

/** This browser's stores, for syncNow (used outside the Workbench page, e.g. the Schedules page). */
export async function localIO() {
  const [{ loadTree, saveTree }, { loadEnvs, updateEnvs }, { loadScenarios, updateScenarios }] = await Promise.all([import('./collections-store.js'), import('./env-store.js'), import('./scenarios-store.js')]);
  return {
    load: (kind) => (kind === 'collections' ? loadTree() : kind === 'environments' ? (({ active, ...e }) => e)(loadEnvs()) : loadScenarios()),
    save: (kind, data) => {
      if (kind === 'collections') saveTree(data);
      else if (kind === 'environments') updateEnvs((st) => { st.globals = data.globals; st.envs = data.envs; });
      else updateScenarios((st) => { st.items = data.items; return true; });
    },
  };
}
