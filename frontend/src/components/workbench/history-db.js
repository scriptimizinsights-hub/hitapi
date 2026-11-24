/**
 * Web Workbench history (web roadmap W2), kept in this browser's IndexedDB.
 *
 *   database "hitapi-web" (version 1)
 *     index    one small record per request (list, search, filters) — key: id
 *     entries  the request (secrets removed) and its response — key: id
 *   settings   localStorage "hitapi:web:historySettings"
 *
 * Same shapes and rules as the extension's history (shared/history.js):
 * secrets masked, newest first, oldest dropped past the limits.
 * Other tabs are told about changes with a BroadcastChannel.
 */

import { maskDraft, onlyVarRefs, searchText, hostOf, isSkippedHost } from '@hitapi/shared/history.js';
import { bodyKind } from '@hitapi/shared/response.js';
import { normalizeUrl } from '@hitapi/shared/http.js';
import { normalizeDraft, emptyDraft, RECENT_KEY, OLD_HISTORY_KEY } from './core.js';
import { emptyBodies } from '@hitapi/shared/body.js';

export const DB_NAME = 'hitapi-web';
export const MAX_TOTAL_BYTES = 25 * 1024 * 1024;
export const MAX_BODY_CHARS = 1024 * 1024;
export const LIMITS = [100, 250, 500];
const SETTINGS_KEY = 'hitapi:web:historySettings';
const MIGRATED_KEY = 'hitapi:web:historyMigrated';
export const DEFAULT_SETTINGS = Object.freeze({ enabled: true, skipHosts: '', maxEntries: 500 });

let dbPromise = null;
let memory = null;          // used when IndexedDB is not available (some private modes)
const listeners = new Set();
let channel = null;   // opened on first use, in the browser only (an open channel keeps the build's prerender running)
function getChannel() {
  if (channel || typeof window === 'undefined' || typeof BroadcastChannel === 'undefined') return channel;
  channel = new BroadcastChannel('hitapi-web-history');
  channel.addEventListener('message', () => listeners.forEach(fn => fn()));
  return channel;
}
const changed = () => { listeners.forEach(fn => fn()); getChannel()?.postMessage('changed'); };

/** fn() runs after any change, here or in another tab. Returns an unsubscribe function. */
export function onHistoryChange(fn) { getChannel(); listeners.add(fn); return () => listeners.delete(fn); }

function open() {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') { reject(new Error('no IndexedDB')); return; }
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains('index')) db.createObjectStore('index', { keyPath: 'id' });
      if (!db.objectStoreNames.contains('entries')) db.createObjectStore('entries');
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error || new Error('IndexedDB failed'));
    req.onblocked = () => reject(new Error('IndexedDB blocked'));
  }).catch((e) => { memory = memory || { index: new Map(), entries: new Map() }; throw e; });
  return dbPromise;
}

/** true when history can be kept (IndexedDB works). */
export async function available() {
  try { await open(); return true; } catch { return false; }
}

const done = (tx) => new Promise((res, rej) => { tx.oncomplete = () => res(); tx.onerror = () => rej(tx.error); tx.onabort = () => rej(tx.error || new Error('aborted')); });
const reqP = (r) => new Promise((res, rej) => { r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });

export function getSettings() {
  try { return { ...DEFAULT_SETTINGS, ...JSON.parse(localStorage.getItem(SETTINGS_KEY) || '{}') }; } catch { return { ...DEFAULT_SETTINGS }; }
}
export async function setSettings(patch) {
  const next = { ...getSettings(), ...patch };
  next.maxEntries = LIMITS.includes(Number(next.maxEntries)) ? Number(next.maxEntries) : 500;
  try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(next)); } catch { /* ignore */ }
  await prune();
  changed();
  return next;
}

/** All index records, newest first. */
export async function listIndex() {
  try {
    const db = await open();
    const all = await reqP(db.transaction('index').objectStore('index').getAll());
    return all.sort((a, b) => b.at - a.at);
  } catch {
    return memory ? [...memory.index.values()].sort((a, b) => b.at - a.at) : [];
  }
}

export async function getEntry(id) {
  try { const db = await open(); return (await reqP(db.transaction('entries').objectStore('entries').get(id))) || null; }
  catch { return memory?.entries.get(id) || null; }
}

const sizeOf = (v) => { try { return JSON.stringify(v).length; } catch { return 0; } };

/** Secret values in the draft (tokens, passwords, API keys, secret headers), to blank them out of stored responses. */
function secretValues(d) {
  const out = [];
  const a = d.auth || {};
  out.push(a.bearer?.token, a.basic?.password, a.apikey?.value, a.custom?.value, a.oauth2?.clientSecret);
  for (const r of d.headers || []) if (/^(authorization|cookie|x-api-key|api-key|x-auth-token|proxy-authorization)$/i.test(String(r.key).trim())) {
    out.push(r.value); const m = /^\s*(?:bearer|basic|token)\s+(.+)$/i.exec(String(r.value || '')); if (m) out.push(m[1]);
  }
  return out.filter(v => v && String(v).length >= 4 && !onlyVarRefs(v)).map(String);
}
const scrubber = (values) => (s) => values.reduce((t, v) => t.split(v).join('••••••'), String(s ?? ''));

/** The response as kept: no binary bodies, body text capped, secrets blanked. */
function storableResponse(res, secrets) {
  const scrub = scrubber(secrets);
  const kind = res.error ? 'text' : bodyKind(res.contentType, res.text);
  const binary = !!res.base64 || kind === 'image' || kind === 'pdf' || kind === 'binary';
  const text = binary ? '' : String(res.text || '');
  return {
    error: res.error ? scrub(res.error) : null, kind: res.kind || null,
    status: res.status ?? 0, statusText: res.statusText || '', ok: !!res.ok,
    ms: res.ms ?? 0, ttfb: res.ttfb ?? 0, size: res.size ?? 0,
    headers: (res.headers || []).map(([k, v]) => [k, scrub(v)]), contentType: res.contentType || '',
    text: scrub(text.slice(0, MAX_BODY_CHARS)), base64: null,
    truncated: !!res.truncated || text.length > MAX_BODY_CHARS,
    notKept: binary ? (kind === 'text' ? 'binary' : kind) : null,
    redirects: res.redirects || [], finalUrl: scrub(res.finalUrl || ''), redirectBlocked: !!res.redirectBlocked,
    warnings: res.warnings || [], mode: res.mode || null, headersLimited: !!res.headersLimited,
    // W5: results of the request's checks (values scrubbed: an expected value may have come from a secret variable)
    tests: Array.isArray(res.tests) ? res.tests.map(r => ({ pass: !!r.pass, actual: scrub(r.actual), message: scrub(r.message), test: { ...r.test, path: scrub(r.test?.path), expected: scrub(r.test?.expected) } })) : null,
  };
}

/**
 * Record one send. Returns the index record, or null (history off, host skipped,
 * request not sent at all, storage unavailable).
 */
export async function addEntry(draft, res, { at = Date.now(), resolved = null, redact = [] } = {}) {
  const settings = getSettings();
  if (!settings.enabled || !draft?.url || res?.kind === 'invalid' || res?.kind === 'cancel') return null;
  // draft: the request as written ({{variables}} kept: that's what is stored and reopened);
  // resolved: with the values filled in (its URL is listed; its secret values are blanked everywhere)
  const url = normalizeUrl((resolved || draft).url);
  if (isSkippedHost(url, settings.skipHosts)) return null;
  const secrets = [...new Set([...secretValues(draft), ...(resolved ? secretValues(resolved) : []), ...(redact || []).filter(v => v && String(v).length >= 4).map(String)])];
  const { draft: kept, masked } = maskDraft(draft, { keepVars: true });   // "Bearer {{token}}" is kept: the secret lives in the environment
  const response = storableResponse(res, secrets);
  const entry = { draft: kept, masked, response };
  const id = `${at.toString(36)}${Math.random().toString(36).slice(2, 8)}`;
  const meta = {
    id, at, method: String(draft.method || 'GET').toUpperCase(), url: scrubber(secrets)(url), host: hostOf(url),
    status: response.status || 0, ms: response.ms || 0, size: response.size || 0,
    error: response.error ? (response.kind || 'error') : null, mode: response.mode,
    tests: response.tests?.length ? { passed: response.tests.filter(t => t.pass).length, total: response.tests.length } : null,
    search: `${searchText(kept, response)} ${scrubber(secrets)(url).toLowerCase()}`.slice(0, 2000),
  };
  meta.bytes = sizeOf(entry) + sizeOf(meta);
  try {
    const db = await open();
    const tx = db.transaction(['index', 'entries'], 'readwrite');
    tx.objectStore('index').put(meta);
    tx.objectStore('entries').put(entry, id);
    await done(tx);
  } catch {
    if (!memory) return null;
    memory.index.set(id, meta); memory.entries.set(id, entry);
  }
  await prune();
  changed();
  return meta;
}

async function removeIds(ids) {
  if (!ids.length) return;
  try {
    const db = await open();
    const tx = db.transaction(['index', 'entries'], 'readwrite');
    for (const id of ids) { tx.objectStore('index').delete(id); tx.objectStore('entries').delete(id); }
    await done(tx);
  } catch { for (const id of ids) { memory?.index.delete(id); memory?.entries.delete(id); } }
}

/** Drop the oldest entries past the limits (count from settings, 25 MB). */
async function prune() {
  const list = await listIndex();
  const max = getSettings().maxEntries;
  let total = list.reduce((n, m) => n + (m.bytes || 0), 0);
  const drop = [];
  while (list.length > max || (total > MAX_TOTAL_BYTES && list.length > 1)) { const m = list.pop(); drop.push(m.id); total -= m.bytes || 0; }
  await removeIds(drop);
}

export async function removeEntry(id) { await removeIds([id]); changed(); }
export async function clearAll() { await removeIds((await listIndex()).map(m => m.id)); changed(); }
export async function clearOlderThan(days, now = Date.now()) {
  const cut = now - days * 86400000;
  const old = (await listIndex()).filter(m => m.at < cut).map(m => m.id);
  await removeIds(old); changed();
  return old.length;
}

/**
 * Once: move the W1 "Recent" list and the old playground history into History.
 * They held requests without responses; they come in as entries without a body.
 */
export async function migrateOld() {
  try { if (localStorage.getItem(MIGRATED_KEY)) return 0; } catch { return 0; }
  const items = [];
  try {
    const recent = JSON.parse(localStorage.getItem(RECENT_KEY) || '[]');
    for (const e of Array.isArray(recent) ? recent : []) if (e?.draft?.url) items.push({ at: e.at || Date.now(), draft: normalizeDraft(e.draft), status: e.status || 0, ms: e.ms || 0, error: e.error });
    if (!items.length) {
      const old = JSON.parse(localStorage.getItem(OLD_HISTORY_KEY) || '[]');
      for (const e of Array.isArray(old) ? old : []) if (e?.url) items.push({
        at: Number(e.id) || Date.now(), status: e.status || 0, ms: e.time_ms || 0,
        draft: normalizeDraft({ ...emptyDraft(), method: e.method, url: e.url, params: (e.params || []).filter(r => r.key), headers: (e.headers || []).filter(r => r.key),
          bodyType: e.bodyType === 'text' ? 'text' : e.bodyType === 'none' ? 'none' : 'json', bodies: { ...emptyBodies(), [e.bodyType === 'text' ? 'text' : 'json']: e.body || '' } }),
      });
    }
  } catch { /* unreadable: nothing to move */ }
  for (const it of items.reverse()) {
    await addEntry(it.draft, { status: it.status, ms: it.ms, error: it.error ? 'Sent before history kept responses.' : null, kind: it.error || null, text: '', headers: [], warnings: ['Saved before HitAPI kept responses: send it again to see one.'] }, { at: it.at });
  }
  try { localStorage.setItem(MIGRATED_KEY, String(Date.now())); localStorage.removeItem(RECENT_KEY); } catch { /* ignore */ }
  return items.length;
}

// ── backup file (W8) ────────────────────────────────────────────────────────

/** Every entry, for a backup file: { index: [meta], entries: { id: entry } } (secrets already removed). */
export async function exportAll() {
  const index = await listIndex();
  const entries = {};
  for (const m of index) { const e = await getEntry(m.id); if (e) entries[m.id] = e; }
  return { index, entries };
}

/** Add entries from a backup (ones already here are kept); returns how many were added. */
export async function importAll(data) {
  const have = new Set((await listIndex()).map(m => m.id));
  const list = (Array.isArray(data?.index) ? data.index : []).filter(m => m?.id && !have.has(m.id) && data.entries?.[m.id]);
  if (!list.length) return 0;
  try {
    const db = await open();
    const tx = db.transaction(['index', 'entries'], 'readwrite');
    for (const m of list) { tx.objectStore('index').put(m); tx.objectStore('entries').put(data.entries[m.id], m.id); }
    await done(tx);
  } catch {
    if (!memory) return 0;
    for (const m of list) { memory.index.set(m.id, m); memory.entries.set(m.id, data.entries[m.id]); }
  }
  await prune();
  changed();
  return list.length;
}
