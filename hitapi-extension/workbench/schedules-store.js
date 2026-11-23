/**
 * workbench/schedules-store.js — scheduled runs in chrome.storage.local (roadmap feature 12).
 * The service worker runs them (background/workbench/scheduler.js) and writes each run back.
 */

import { KEY, normalizeSchedules } from '../shared/schedules.js';

export async function loadSchedules() {
  try { return normalizeSchedules((await chrome.storage.local.get(KEY))[KEY]); } catch { return { items: [] }; }
}

/** fn(state) edits { items } in place, read fresh first. */
export async function updateSchedules(fn) {
  const state = await loadSchedules();
  const out = await fn(state);
  if (out !== false) await chrome.storage.local.set({ [KEY]: state });
  return { out, state };
}

export function onSchedulesChange(fn) {
  const l = (changes, area) => { if (area === 'local' && changes[KEY]) fn(normalizeSchedules(changes[KEY].newValue)); };
  chrome.storage.onChanged.addListener(l);
  return () => chrome.storage.onChanged.removeListener(l);
}
