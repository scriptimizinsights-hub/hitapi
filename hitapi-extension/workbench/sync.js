/**
 * workbench/sync.js — keeps collections, environments and scenarios the same on every
 * device signed in to the same HitAPI account (roadmap feature 11). Opt-in.
 *
 *   wb:sync = { enabled, device, kinds: { [kind]: { version, base: { id: hash } } }, lastSyncAt, lastError, lastResult }
 *
 * A sync, for each kind: download the cloud copy; if only this device changed, upload;
 * if only the cloud changed, take it; if both changed, merge item by item (see
 * shared/sync.js), save the result here and upload it. Uploads name the version they
 * replace, so two devices saving at once can't overwrite each other: the second one
 * gets a conflict, merges again and retries.
 */

import { MSG, ERR } from '../shared/messages.js';
import { call } from '../ui/core/bridge.js';
import { SYNC_KINDS, itemsOf, hashes, sameItems, merge3, applyItems } from '../shared/sync.js';

const KEY = 'wb:sync';

export async function loadSyncState() {
  try {
    const s = (await chrome.storage.local.get(KEY))[KEY] || {};
    return { enabled: false, device: defaultDevice(), kinds: {}, lastSyncAt: 0, lastError: '', lastResult: null, ...s };
  } catch { return { enabled: false, device: defaultDevice(), kinds: {}, lastSyncAt: 0, lastError: '', lastResult: null }; }
}

export async function saveSyncState(patch) {
  const next = { ...(await loadSyncState()), ...patch };
  await chrome.storage.local.set({ [KEY]: next });
  return next;
}

export function onSyncStateChange(fn) {
  chrome.storage.onChanged.addListener((changes, area) => { if (area === 'local' && changes[KEY]) loadSyncState().then(fn); });
}

function defaultDevice() {
  const ua = navigator.userAgent;
  const os = /Mac OS X/.test(ua) ? 'Mac' : /Windows/.test(ua) ? 'Windows' : /CrOS/.test(ua) ? 'ChromeOS' : /Linux/.test(ua) ? 'Linux' : 'Computer';
  return `Chrome on ${os}`;
}

let running = null;

/**
 * @param {{ load: (kind) => Promise<object>, save: (kind, data) => Promise<void> }} io  the page's stores
 * @returns {Promise<{ ok: boolean, uploaded: string[], downloaded: string[], conflicts: string[], error?: string, signedOut?: boolean }>}
 */
export function syncNow(io, { force = false } = {}) {
  if (running) return running;
  running = (async () => {
    const state = await loadSyncState();
    if (!state.enabled && !force) return { ok: false, skipped: true };
    const result = { ok: true, uploaded: [], downloaded: [], conflicts: [] };
    try {
      const { docs } = await call(MSG.WB_SYNC_GET);
      const kinds = { ...state.kinds };
      for (const kind of SYNC_KINDS) {
        kinds[kind] = await syncKind(kind, docs[kind] || null, kinds[kind] || { version: 0, base: {} }, io, state.device, result);
      }
      await saveSyncState({ kinds, lastSyncAt: Date.now(), lastError: '', lastResult: { uploaded: result.uploaded, downloaded: result.downloaded, conflicts: result.conflicts } });
    } catch (e) {
      result.ok = false;
      result.error = e.message;
      result.signedOut = e.code === ERR.NOT_LOGGED_IN || e.code === ERR.AUTH_EXPIRED;
      await saveSyncState({ lastError: result.signedOut ? 'Signed out: sign in from the HitAPI popup to keep syncing.' : e.message });
    }
    return result;
  })().finally(() => { running = null; });
  return running;
}

async function syncKind(kind, doc, mine, io, device, result, attempt = 0) {
  const localData = await io.load(kind);
  const local = itemsOf(kind, localData);
  const remoteVersion = doc?.version || 0;
  const remote = doc?.data?.items || [];
  let items = local;
  if (remoteVersion !== mine.version) {
    // the cloud copy changed since this device last synced
    const m = merge3({ base: mine.base, local, remote });
    items = m.items;
    if (m.fromRemote || m.removed || m.conflicts.length) {
      await io.save(kind, applyItems(kind, items, localData));
      result.downloaded.push(kind);
    }
    result.conflicts.push(...m.conflicts);
    if (sameItems(items, hashes(remote)) && remoteVersion) return { version: remoteVersion, base: hashes(items) };
  } else if (sameItems(local, mine.base) && remoteVersion) {
    return mine;   // nothing changed anywhere
  }
  const put = await call(MSG.WB_SYNC_PUT, { kind, data: { items }, baseVersion: remoteVersion, device });
  if (put.conflict) {
    if (attempt >= 3) throw new Error('Another device keeps saving at the same time. Try again in a moment.');
    return syncKind(kind, put.current, { version: remoteVersion, base: hashes(items) }, io, device, result, attempt + 1);
  }
  result.uploaded.push(kind);
  return { version: put.version, base: hashes(items) };
}

/** Stop syncing on this device; optionally delete the cloud copy for every device. */
export async function stopSync({ deleteCloud = false } = {}) {
  if (deleteCloud) await call(MSG.WB_SYNC_DELETE);
  return saveSyncState({ enabled: false, kinds: {}, lastResult: null, lastError: '' });
}
