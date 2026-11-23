/**
 * workbench/env-store.js — environments and global variables (roadmap feature 7).
 *
 *   wb:environments  { globals: rows, envs: [{ id, name, vars: rows }] }
 *   wb:activeEnv     id of the environment in use, or ''
 *
 * Kept in chrome.storage.local; every open Workbench sees changes at once.
 */

import { normalizeRows } from '../shared/vars.js';

const KEY = 'wb:environments';
const ACTIVE = 'wb:activeEnv';

export function normalizeEnvs(v) {
  return {
    globals: normalizeRows(v?.globals),
    envs: (Array.isArray(v?.envs) ? v.envs : []).filter(e => e?.id).map(e => ({ id: e.id, name: String(e.name || 'Environment'), vars: normalizeRows(e.vars) })),
  };
}

export async function loadEnvs() {
  try {
    const got = await chrome.storage.local.get([KEY, ACTIVE]);
    const state = normalizeEnvs(got[KEY]);
    const active = state.envs.some(e => e.id === got[ACTIVE]) ? got[ACTIVE] : '';
    return { ...state, active };
  } catch { return { globals: [], envs: [], active: '' }; }
}

/** fn(state) edits { globals, envs } in place, read fresh first. */
export async function updateEnvs(fn) {
  const { active, ...state } = await loadEnvs();
  const out = await fn(state);
  if (out !== false) await chrome.storage.local.set({ [KEY]: state });
  return { ...state, active };
}

export async function setActiveEnv(id) {
  await chrome.storage.local.set({ [ACTIVE]: id || '' });
}

export function onEnvChange(fn) {
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === 'local' && (changes[KEY] || changes[ACTIVE])) loadEnvs().then(fn);
  });
}

let seq = 0;
export const newEnvId = () => `e${Date.now().toString(36)}${(seq++).toString(36)}`;
