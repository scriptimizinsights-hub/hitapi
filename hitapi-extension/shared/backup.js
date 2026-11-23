/**
 * shared/backup.js — one file with all the Workbench data (roadmap feature 11).
 * Pure functions; the Workbench page reads and writes the stores.
 *
 *   { format: 'hitapi-backup', version: 1, exportedAt, secrets,
 *     collections: { items }, environments: { globals, envs, active }, scenarios: { items },
 *     settings: { history }, history?: { index, entries: { id: entry } } }
 */

import { exportCollection, normalizeTree } from './collections.js';
import { maskRows, normalizeRows } from './vars.js';
import { maskDraft } from './history.js';
import { normalizeScenarios } from './scenarios.js';

export const BACKUP_FORMAT = 'hitapi-backup';
export const BACKUP_VERSION = 1;

export function makeBackup({ tree, envs, scenarios, historySettings, history = null }, { secrets = false } = {}) {
  const out = {
    format: BACKUP_FORMAT, version: BACKUP_VERSION, exportedAt: new Date().toISOString(), secrets: !!secrets,
    collections: { items: (tree?.items || []).map(c => (secrets ? structuredClone(c) : exportCollection(c).collection)) },
    environments: {
      globals: secrets ? normalizeRows(envs?.globals) : maskRows(envs?.globals),
      envs: (envs?.envs || []).map(e => ({ id: e.id, name: e.name, vars: secrets ? normalizeRows(e.vars) : maskRows(e.vars) })),
      active: envs?.active || '',
    },
    scenarios: {
      items: (scenarios?.items || []).map(s => ({
        ...structuredClone(s),
        steps: (s.steps || []).map(st => (st.kind === 'inline' && st.draft && !secrets ? { ...st, draft: maskDraft(st.draft).draft } : st)),
      })),
    },
    settings: { history: historySettings || null },
  };
  if (history) out.history = history;   // history entries are kept as stored (secrets already removed unless turned off)
  return out;
}

export function parseBackup(text) {
  let data;
  try { data = typeof text === 'string' ? JSON.parse(text) : text; } catch { throw new Error('This file is not JSON.'); }
  if (data?.format !== BACKUP_FORMAT) {
    if (data?.format === 'hitapi-collection') throw new Error('This is a single collection, not a backup. Import it from the Collections tab.');
    throw new Error('This is not a HitAPI backup file.');
  }
  if (data.version > BACKUP_VERSION) throw new Error('This backup was made by a newer version of HitAPI. Update the extension first.');
  return {
    ...data,
    collections: normalizeTree(data.collections),
    environments: { globals: normalizeRows(data.environments?.globals), envs: (data.environments?.envs || []).filter(e => e?.id).map(e => ({ id: e.id, name: String(e.name || 'Environment'), vars: normalizeRows(e.vars) })), active: data.environments?.active || '' },
    scenarios: normalizeScenarios(data.scenarios),
  };
}

const byId = (list) => new Map(list.map(x => [x.id, x]));
function diff(current, incoming, mode) {
  const cur = byId(current); const inc = byId(incoming);
  const added = incoming.filter(x => !cur.has(x.id)).length;
  const updated = incoming.filter(x => cur.has(x.id)).length;
  const removed = mode === 'replace' ? current.filter(x => !inc.has(x.id)).length : 0;
  return { added, updated, removed, kept: mode === 'merge' ? current.filter(x => !inc.has(x.id)).length : 0 };
}

/** What importing would change: counts per kind. */
export function previewImport(current, backup, mode = 'merge') {
  return {
    collections: diff(current.tree.items, backup.collections.items, mode),
    environments: diff(current.envs.envs, backup.environments.envs, mode),
    globals: backup.environments.globals.filter(v => v.key).length,
    scenarios: diff(current.scenarios.items, backup.scenarios.items, mode),
    history: backup.history ? Object.keys(backup.history.entries || {}).length : 0,
    secrets: !!backup.secrets,
  };
}

function mergeList(current, incoming, mode) {
  if (mode === 'replace') return structuredClone(incoming);
  const inc = byId(incoming);
  const out = current.map(x => (inc.has(x.id) ? structuredClone(inc.get(x.id)) : x));
  for (const x of incoming) if (!current.some(c => c.id === x.id)) out.push(structuredClone(x));
  return out;
}

/** The new store contents after an import. */
export function applyImport(current, backup, mode = 'merge') {
  const globals = mode === 'replace' ? backup.environments.globals : (() => {
    const g = normalizeRows(current.envs.globals);
    for (const v of backup.environments.globals) { const i = g.findIndex(x => x.key === v.key); if (i >= 0) g[i] = v; else g.push(v); }
    return g;
  })();
  const envs = mergeList(current.envs.envs, backup.environments.envs, mode);
  const active = mode === 'replace' ? (envs.some(e => e.id === backup.environments.active) ? backup.environments.active : '') : current.envs.active;
  return {
    tree: { items: mergeList(current.tree.items, backup.collections.items, mode) },
    envs: { globals, envs, active },
    scenarios: { items: mergeList(current.scenarios.items, backup.scenarios.items, mode) },
    historySettings: backup.settings?.history || null,
  };
}

/** chrome.storage.local keys → which part of the data they are (for the storage meter). */
export function storageGroup(key) {
  if (key === 'wb:collections') return 'Collections';
  if (key === 'wb:scenarios') return 'Scenarios';
  if (key === 'wb:environments' || key === 'wb:activeEnv') return 'Environments';
  if (key === 'wb:history' || key.startsWith('wb:h:') || key === 'wb:historySettings') return 'History';
  return 'Other';
}
