/**
 * background/capture/store.js — per-tab capture state.
 *
 * State lives in memory for speed and is mirrored to chrome.storage.session,
 * so it survives Chrome stopping the service worker after ~30 s of idle time
 * (the old version kept it only in memory and silently stopped capturing).
 *
 * Shape of one tab:
 *   { active, origin, startedAt, requests: [newest first], token }
 */

import { CAPTURE } from '../../shared/config.js';
import { EVENT } from '../../shared/messages.js';
import { tabKey, isTabKey, tabIdFromKey } from '../storage.js';
import { publish } from '../live.js';
import * as badge from '../ui/badge.js';

const tabs = new Map();
const persistTimers = new Map();
let hydrating = null;

/** Resolves once state saved before a worker restart has been loaded. */
export function ready() {
  hydrating ??= (async () => {
    try {
      const all = await chrome.storage.session.get(null);
      for (const [key, value] of Object.entries(all)) {
        if (isTabKey(key) && value) tabs.set(tabIdFromKey(key), value);
      }
    } catch (e) {
      console.warn('[HitAPI] Could not restore capture state', e);
    }
  })();
  return hydrating;
}

export function get(tabId) {
  return tabs.get(tabId) || null;
}

export function isActive(tabId) {
  return !!tabs.get(tabId)?.active;
}

export async function start(tabId, origin) {
  const prev = tabs.get(tabId);
  tabs.set(tabId, {
    active: true,
    origin,
    startedAt: Date.now(),
    requests: prev?.requests || [],
    token: prev?.token || null,
  });
  await persistNow(tabId);
  badge.showCaptureCount(tabId, tabs.get(tabId).requests.length);
  announceMonitor(tabId);
}

export async function stop(tabId) {
  const s = tabs.get(tabId);
  if (!s) return;
  s.active = false;
  await persistNow(tabId);
  badge.clearTab(tabId);
  announceMonitor(tabId);
}

export async function clear(tabId) {
  const s = tabs.get(tabId);
  if (!s) return;
  s.requests = [];
  await persistNow(tabId);
  if (s.active) badge.showCaptureCount(tabId, 0);
  publish(EVENT.REQUESTS, { tabId, requests: [] }, tabId);
}

/** Tab closed: forget everything about it. */
export async function forget(tabId) {
  tabs.delete(tabId);
  clearTimeout(persistTimers.get(tabId));
  persistTimers.delete(tabId);
  await chrome.storage.session.remove(tabKey(tabId)).catch(() => {});
}

export function addRequest(tabId, entry) {
  const s = tabs.get(tabId);
  if (!s?.active) return;
  s.requests.unshift(entry);
  if (s.requests.length > CAPTURE.MAX_REQUESTS) s.requests.length = CAPTURE.MAX_REQUESTS;
  badge.showCaptureCount(tabId, s.requests.length);
  publish(EVENT.REQUESTS, { tabId, requests: s.requests }, tabId);
  schedulePersist(tabId);
}

export function setToken(tabId, token) {
  const s = tabs.get(tabId);
  if (!s?.active || !token || s.token?.value === token.value) return;
  s.token = token;
  schedulePersist(tabId);
  announceMonitor(tabId);
}

/** What the UI needs to draw the monitor bar. */
export function snapshot(tabId) {
  const s = tabs.get(tabId);
  return {
    active: !!s?.active,
    origin: s?.origin || null,
    requests: s?.requests || [],
    token: s?.token || null,
  };
}

function announceMonitor(tabId) {
  const s = tabs.get(tabId);
  publish(EVENT.MONITOR, { tabId, active: !!s?.active, origin: s?.origin || null, token: s?.token || null }, tabId);
}

function schedulePersist(tabId) {
  if (persistTimers.has(tabId)) return;
  persistTimers.set(tabId, setTimeout(() => {
    persistTimers.delete(tabId);
    persistNow(tabId);
  }, CAPTURE.PERSIST_DEBOUNCE_MS));
}

async function persistNow(tabId) {
  const s = tabs.get(tabId);
  if (!s) return;
  try {
    await chrome.storage.session.set({ [tabKey(tabId)]: s });
  } catch (e) {
    // storage.session is limited (10 MB). Keep the newest half and try once more.
    console.warn('[HitAPI] Capture storage full, trimming', e?.message);
    s.requests = s.requests.slice(0, Math.ceil(s.requests.length / 2));
    await chrome.storage.session.set({ [tabKey(tabId)]: s }).catch(() => {});
  }
}
