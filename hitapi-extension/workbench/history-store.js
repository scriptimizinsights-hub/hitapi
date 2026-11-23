/**
 * workbench/history-store.js — request history in chrome.storage.local.
 *
 *   wb:history          index, newest first: [{ id, at, method, url, host, status, ms, size, error, bytes, search }]
 *   wb:h:<id>           one entry: { draft (secrets removed), masked, response }
 *   wb:historySettings  { enabled, maskSecrets, skipHosts }
 *
 * The sidebar only reads the index; an entry is loaded when it is opened.
 * Kept to MAX_ENTRIES and about MAX_TOTAL_BYTES; the oldest go first.
 */

import { normalizeUrl } from '../shared/http.js';
import { MAX_ENTRIES, MAX_TOTAL_BYTES, DEFAULT_HISTORY_SETTINGS, maskDraft, storableResponse, searchText, hostOf, isSkippedHost } from '../shared/history.js';

const INDEX = 'wb:history';
const SETTINGS = 'wb:historySettings';
const entryKey = (id) => `wb:h:${id}`;
const sizeOf = (v) => JSON.stringify(v).length;
let seq = 0;

export async function listIndex() {
  try { return (await chrome.storage.local.get(INDEX))[INDEX] || []; } catch { return []; }
}

export async function getSettings() {
  try { return { ...DEFAULT_HISTORY_SETTINGS, ...((await chrome.storage.local.get(SETTINGS))[SETTINGS] || {}) }; }
  catch { return { ...DEFAULT_HISTORY_SETTINGS }; }
}

export async function setSettings(patch) {
  const next = { ...(await getSettings()), ...patch };
  await chrome.storage.local.set({ [SETTINGS]: next });
  return next;
}

/** Replace secret values (from {{secret}} variables) wherever they appear in the kept response. */
function redactResponse(r, values) {
  const list = (values || []).filter(v => v && v.length >= 4);
  if (!r || !list.length) return r;
  const scrub = (s) => list.reduce((t, v) => t.split(v).join('••••••'), String(s ?? ''));
  return {
    ...r, text: scrub(r.text), error: r.error ? scrub(r.error) : r.error, finalUrl: scrub(r.finalUrl),
    headers: (r.headers || []).map(([k, v]) => [k, scrub(v)]), rawHeaders: r.rawHeaders ? r.rawHeaders.map(([k, v]) => [k, scrub(v)]) : null,
    // a test's actual / expected value can be the secret itself (e.g. an echoed Authorization header)
    tests: Array.isArray(r.tests) ? JSON.parse(scrub(JSON.stringify(r.tests))) : r.tests,
  };
}

/** Drop the oldest entries until the index fits the limits. Returns the ids dropped. */
function prune(index) {
  const dropped = [];
  let total = index.reduce((n, m) => n + (m.bytes || 0), 0);
  while (index.length > MAX_ENTRIES || (total > MAX_TOTAL_BYTES && index.length > 1)) {
    const old = index.pop();
    total -= old.bytes || 0;
    dropped.push(old.id);
  }
  return dropped;
}

/**
 * Record one send. Returns the index entry, or null when not recorded
 * (history off, host skipped, or a request that could not be sent at all).
 * draft keeps its {{variables}}; resolvedUrl is the URL that was actually sent.
 */
export async function addEntry(draft, res, { at = Date.now(), resolvedUrl = '', redact = [] } = {}) {
  const settings = await getSettings();
  if (!settings.enabled || !draft?.url || res?.kind === 'invalid') return null;
  const sentUrl = (redact || []).filter(v => v && v.length >= 4).reduce((t, v) => t.split(v).join('••••••'), normalizeUrl(resolvedUrl || draft.url));
  if (isSkippedHost(sentUrl, settings.skipHosts)) return null;
  const { draft: kept, masked } = settings.maskSecrets ? maskDraft(draft) : { draft: (({ source, link, ...d }) => structuredClone(d))(draft), masked: [] };
  const response = redactResponse(storableResponse(res), redact);
  const entry = { draft: kept, masked, response };
  const id = `${at.toString(36)}${(seq++).toString(36)}${Math.random().toString(36).slice(2, 6)}`;
  const meta = {
    id, at, method: draft.method, url: sentUrl, host: hostOf(sentUrl),
    status: response?.status || 0, ms: response?.ms || 0, size: response?.size || 0,
    error: response?.error ? (response.kind || 'error') : null,
    tests: response?.tests?.length ? { passed: response.tests.filter(r => r.pass).length, total: response.tests.length } : null,
    search: `${searchText(draft, response)} ${sentUrl.toLowerCase()}`,
  };
  meta.bytes = sizeOf(entry) + sizeOf(meta) + 20;
  const index = [meta, ...(await listIndex())];
  const dropped = prune(index);
  try {
    await chrome.storage.local.set({ [entryKey(id)]: entry, [INDEX]: index });
  } catch {
    // storage full: make room and try once more without the response body
    index.splice(Math.max(1, Math.floor(index.length / 2)));
    entry.response = response && { ...response, text: '', notKept: 'space' };
    try { await chrome.storage.local.set({ [entryKey(id)]: entry, [INDEX]: index }); } catch { return null; }
  }
  if (dropped.length) await chrome.storage.local.remove(dropped.map(entryKey)).catch(() => {});
  return meta;
}

export async function getEntry(id) {
  try { return (await chrome.storage.local.get(entryKey(id)))[entryKey(id)] || null; } catch { return null; }
}

async function removeIds(ids) {
  if (!ids.length) return;
  const drop = new Set(ids);
  const index = (await listIndex()).filter(m => !drop.has(m.id));
  await chrome.storage.local.set({ [INDEX]: index });
  await chrome.storage.local.remove(ids.map(entryKey)).catch(() => {});
}

export const removeEntry = (id) => removeIds([id]);

const allEntryKeys = async () => {
  const keys = chrome.storage.local.getKeys ? await chrome.storage.local.getKeys() : Object.keys(await chrome.storage.local.get(null));
  return keys.filter(k => k.startsWith('wb:h:'));
};

export async function clearAll() {
  await chrome.storage.local.set({ [INDEX]: [] });
  await chrome.storage.local.remove(await allEntryKeys()).catch(() => {});
}

/**
 * Remove entries the index no longer lists (left behind when two Workbench
 * tabs wrote at the same moment). Run once when the page opens.
 */
export async function sweepOrphans() {
  try {
    const known = new Set((await listIndex()).map(m => entryKey(m.id)));
    const orphans = (await allEntryKeys()).filter(k => !known.has(k));
    if (orphans.length) await chrome.storage.local.remove(orphans);
    return orphans.length;
  } catch { return 0; }
}

/** Remove entries older than `days` days. Returns how many were removed. */
export async function clearOlderThan(days, now = Date.now()) {
  const cutoff = now - days * 86400000;
  const ids = (await listIndex()).filter(m => m.at < cutoff).map(m => m.id);
  await removeIds(ids);
  return ids.length;
}

/** fn(index) whenever the history changes (in this tab, another tab or the DevTools panel). */
export function onHistoryChange(fn) {
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === 'local' && changes[INDEX]) fn(changes[INDEX].newValue || []);
  });
}

/** Everything in history, for a backup (roadmap feature 11): { index, entries: { id: entry } }. */
export async function exportHistory() {
  const index = await listIndex();
  const keys = index.map(m => entryKey(m.id));
  const got = keys.length ? await chrome.storage.local.get(keys) : {};
  const entries = {};
  for (const m of index) if (got[entryKey(m.id)]) entries[m.id] = got[entryKey(m.id)];
  return { index, entries };
}

/** Add a backup's history (entries already here are skipped), newest first, within the limits. */
export async function importHistory({ index = [], entries = {} } = {}) {
  const current = await listIndex();
  const have = new Set(current.map(m => m.id));
  const add = index.filter(m => m?.id && !have.has(m.id) && entries[m.id]);
  if (!add.length) return 0;
  const merged = [...current, ...add].sort((a, b) => b.at - a.at);
  const dropped = prune(merged);
  const keep = new Set(merged.map(m => m.id));
  const values = { [INDEX]: merged };
  for (const m of add) if (keep.has(m.id)) values[entryKey(m.id)] = entries[m.id];
  await chrome.storage.local.set(values);
  if (dropped.length) await chrome.storage.local.remove(dropped.filter(id => have.has(id)).map(entryKey)).catch(() => {});
  return add.filter(m => keep.has(m.id)).length;
}
