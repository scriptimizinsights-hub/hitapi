/**
 * Web Workbench (W4) — environments and global variables, kept in this browser.
 *
 *   hitapi:web:environments  { globals: rows, envs: [{ id, name, vars: rows }] }   (same shape as the extension's wb:environments)
 *   hitapi:web:activeEnv     id of the environment in use, or ''
 *
 * Every open tab sees changes at once.
 */

import { normalizeRows } from '@hitapi/shared/vars.js';

export const KEY = 'hitapi:web:environments';
export const ACTIVE = 'hitapi:web:activeEnv';

const ls = () => { try { return typeof window !== 'undefined' ? window.localStorage : null; } catch { return null; } };
const listeners = new Set();

export function normalizeEnvs(v) {
  return {
    globals: normalizeRows(v?.globals),
    envs: (Array.isArray(v?.envs) ? v.envs : []).filter(e => e?.id).map(e => ({ id: String(e.id), name: String(e.name || 'Environment'), vars: normalizeRows(e.vars) })),
  };
}

/** { globals, envs, active } */
export function loadEnvs() {
  try {
    const store = ls();
    const state = normalizeEnvs(JSON.parse(store?.getItem(KEY) || 'null'));
    const a = store?.getItem(ACTIVE) || '';
    return { ...state, active: state.envs.some(e => e.id === a) ? a : '' };
  } catch { return { globals: [], envs: [], active: '' }; }
}

const notify = () => { const s = loadEnvs(); for (const fn of listeners) fn(s); return s; };

function write(key, value) {
  const store = ls();
  if (!store) throw new Error('Saving isn\'t available in this browser mode (private window or storage blocked).');
  try { store.setItem(key, value); } catch { throw new Error('This browser\'s storage is full, so it wasn\'t saved.'); }
}

/** fn(state) edits { globals, envs } in place (read fresh first). Returns the new { globals, envs, active }. */
export function updateEnvs(fn) {
  const { active, ...state } = loadEnvs();
  if (fn(state) === false) return { ...state, active };
  write(KEY, JSON.stringify({ globals: state.globals, envs: state.envs }));
  return notify();
}

export function setActiveEnv(id) {
  write(ACTIVE, id || '');
  return notify();
}

/** fn({ globals, envs, active }) after any change, here or in another tab. */
export function onEnvChange(fn) {
  listeners.add(fn);
  const onStorage = (e) => { if (e.key === KEY || e.key === ACTIVE) fn(loadEnvs()); };
  if (typeof window !== 'undefined') window.addEventListener('storage', onStorage);
  return () => { listeners.delete(fn); if (typeof window !== 'undefined') window.removeEventListener('storage', onStorage); };
}

let seq = 0;
export const newEnvId = () => `e${Date.now().toString(36)}${(seq++).toString(36)}${Math.random().toString(36).slice(2, 5)}`;

/** Postman environment / globals JSON (secret values left out). */
export function postmanEnv(name, vars, scope = 'environment') {
  return {
    id: typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : newEnvId(), name,
    values: normalizeRows(vars).filter(v => v.key).map(v => ({ key: v.key, value: v.secret ? '' : v.value, type: v.secret ? 'secret' : 'default', enabled: v.enabled !== false })),
    _postman_variable_scope: scope, _postman_exported_at: new Date().toISOString(), _postman_exported_using: 'HitAPI Workbench',
  };
}
