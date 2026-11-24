/**
 * Web Workbench (W6) — scenarios, kept in this browser (localStorage). Same
 * shape as the HitAPI extension's `wb:scenarios`. Reports are kept without
 * response bodies. Every open tab sees changes at once.
 */

import { normalizeScenarios } from '@hitapi/shared/scenarios.js';

export const KEY = 'hitapi:web:scenarios';

const ls = () => { try { return typeof window !== 'undefined' ? window.localStorage : null; } catch { return null; } };
const listeners = new Set();

export function loadScenarios() {
  try { return normalizeScenarios(JSON.parse(ls()?.getItem(KEY) || 'null')); } catch { return { items: [] }; }
}

/** fn(state) edits { items } in place (read fresh first). fn returning false = no change. Throws a readable error. */
export function updateScenarios(fn) {
  const state = loadScenarios();
  const result = fn(state);
  if (result === false) return { result, state };
  const store = ls();
  if (!store) throw new Error('Saving isn\'t available in this browser mode (private window or storage blocked).');
  try { store.setItem(KEY, JSON.stringify({ items: state.items })); } catch {
    throw new Error('This browser\'s storage is full, so the scenario wasn\'t saved. Export it for the CLI, or delete old ones.');
  }
  const next = normalizeScenarios({ items: state.items });
  for (const l of listeners) l(next);
  return { result, state: next };
}

export function onScenariosChange(fn) {
  listeners.add(fn);
  const onStorage = (e) => { if (e.key === KEY) fn(loadScenarios()); };
  if (typeof window !== 'undefined') window.addEventListener('storage', onStorage);
  return () => { listeners.delete(fn); if (typeof window !== 'undefined') window.removeEventListener('storage', onStorage); };
}
