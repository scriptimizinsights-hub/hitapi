/**
 * workbench/scenarios-store.js — scenarios in chrome.storage.local (roadmap feature 9).
 * One key; every open Workbench sees changes at once. Reports are kept without bodies.
 */

import { normalizeScenarios } from '../shared/scenarios.js';

const KEY = 'wb:scenarios';

export async function loadScenarios() {
  try { return normalizeScenarios((await chrome.storage.local.get(KEY))[KEY]); } catch { return { items: [] }; }
}

/** fn(state) edits { items } in place, read fresh first. Returns fn's result. */
export async function updateScenarios(fn) {
  const state = await loadScenarios();
  const out = await fn(state);
  if (out !== false) await chrome.storage.local.set({ [KEY]: state });
  return { out, state };
}

export function onScenariosChange(fn) {
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === 'local' && changes[KEY]) fn(normalizeScenarios(changes[KEY].newValue));
  });
}
