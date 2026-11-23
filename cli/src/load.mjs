/**
 * src/load.mjs — reads test files and variable files.
 *
 * Test files (detected by content):
 *   HitAPI collection   (extension: ⋯ → Export to a file, or Publish to GitHub)
 *   HitAPI scenario     (extension: scenario ⋯ → Export for the CLI)
 *   HitAPI backup       (extension: ☁ Backup → Export all): its scenarios, or its collections
 *   Postman collection  v2.0 / v2.1
 * Each becomes one or more suites: { name, file, kind, steps, lookup, data, globals, envs }.
 */

import { readFileSync } from 'node:fs';
import { basename, extname } from 'node:path';
import { FORMAT as COLLECTION_FORMAT, normalizeTree, requestsIn, find, newCollection } from './shared/collections.js';
import { normalizeRows, isValidVarName } from './shared/vars.js';
import { parseData } from './shared/scenarios.js';
import { importPostman, isPostmanCollection, isPostmanEnvironment, importPostmanEnvironment } from './shared/convert/postman.js';
import { SCENARIO_FORMAT } from './shared/ci.js';

export class UsageError extends Error {}

const SECRET_NAME = /token|secret|password|passwd|pwd|key|auth|cookie|session/i;

function readJson(file) {
  let text;
  try { text = readFileSync(file, 'utf8'); } catch (e) { throw new UsageError(`Can't read ${file}: ${e.code === 'ENOENT' ? 'no such file' : e.message}`); }
  try { return JSON.parse(text); } catch (e) { throw new UsageError(`${file} is not valid JSON: ${e.message}`); }
}

/** Secret variables are blanked in exported files: leave them out, so CI must provide them. */
const withoutBlankSecrets = (rows) => normalizeRows(rows).filter(r => !(r.secret && r.value === ''));
function cleanAncestors(ancestors) {
  return ancestors.map(a => ({ ...a, settings: { ...a.settings, variables: withoutBlankSecrets(a.settings?.variables) } }));
}

function collectionSuite(file, collection, { folder, delayMs, onFail }) {
  const tree = normalizeTree({ items: [collection] });
  const c = tree.items[0];
  let rootId = c.id; let name = c.name;
  if (folder) {
    const want = String(folder).toLowerCase();
    let hit = null;
    const walk = (n, path) => { for (const ch of n.children || []) { if (ch.type === 'folder') { const p = [...path, ch.name]; if (!hit && (ch.name.toLowerCase() === want || p.join('/').toLowerCase() === want)) hit = { ch, p }; walk(ch, p); } } };
    walk(c, []);
    if (!hit) throw new UsageError(`No folder "${folder}" in ${basename(file)}`);
    rootId = hit.ch.id; name = `${c.name} / ${hit.p.join(' / ')}`;
  }
  const items = requestsIn(tree, rootId);
  const lookup = new Map();
  const steps = items.map((it, i) => {
    const id = `r${i}`;
    lookup.set(id, { draft: it.node.draft, ancestors: cleanAncestors(it.ancestors), name: it.node.name });
    return { id, kind: 'inline', name: it.node.name, enabled: true, delayMs, repeat: 1, onFail };
  });
  return { name, file, kind: 'collection', steps, lookup, data: null };
}

function scenarioSuite(file, s, { delayMs, onFail, tree = null }) {
  const lookup = new Map();
  const steps = [];
  (s.steps || []).forEach((st, i) => {
    const id = st.id || `s${i}`;
    if (st.kind === 'saved') {           // a scenario inside a backup: its saved request
      const f = tree && find(tree, st.requestId);
      if (!f || f.node.type !== 'request') { lookup.set(id, { missing: 'The saved request for this step was deleted.', name: st.name || 'Deleted request' }); }
      else lookup.set(id, { draft: f.node.draft, ancestors: cleanAncestors(f.ancestors), name: f.node.name });
    } else {
      const holder = newCollection('scenario file');
      holder.settings.variables = withoutBlankSecrets(st.variables);
      lookup.set(id, { draft: st.draft, ancestors: [holder], name: st.name || 'Request' });
    }
    steps.push({ id, kind: 'inline', name: st.name || lookup.get(id).name, enabled: st.enabled !== false, delayMs: (Number(st.delayMs) || 0) + delayMs, repeat: Math.max(1, Number(st.repeat) || 1), onFail: onFail === 'stop' ? 'stop' : (st.onFail === 'continue' ? 'continue' : 'stop') });
  });
  return { name: s.name || 'Scenario', file, kind: 'scenario', steps, lookup, data: s.data || null };
}

/**
 * @returns {Array<suite>}
 */
export function loadSuites(file, o = {}) {
  const opts = { folder: o.folder || null, delayMs: Number(o.delay) || 0, onFail: o.bail ? 'stop' : 'continue' };
  const data = readJson(file);
  const pick = (list, want, what) => {
    if (!want) return list;
    const hit = list.filter(x => x.name.toLowerCase() === String(want).toLowerCase());
    if (!hit.length) throw new UsageError(`No ${what} "${want}" in ${basename(file)}. There is: ${list.map(x => x.name).join(', ') || 'nothing'}`);
    return hit;
  };
  if (data?.format === COLLECTION_FORMAT && data.collection) return [collectionSuite(file, data.collection, opts)];
  if (data?.format === SCENARIO_FORMAT && data.scenario) return [scenarioSuite(file, data.scenario, opts)];
  if (data?.format === 'hitapi-backup') {
    const tree = normalizeTree(data.collections || { items: [] });
    const scen = data.scenarios?.items || [];
    const extra = { globals: normalizeRows(data.environments?.globals), envs: data.environments?.envs || [] };
    if (o.collection || (!scen.length && !o.scenario)) {
      return pick(tree.items, o.collection, 'collection').map(c => ({ ...collectionSuite(file, c, opts), ...extra }));
    }
    return pick(scen, o.scenario, 'scenario').map(s => ({ ...scenarioSuite(file, s, { ...opts, tree }), ...extra }));
  }
  if (isPostmanCollection(data)) {
    const { collection, notes } = importPostman(data);
    return [{ ...collectionSuite(file, collection, opts), notes }];
  }
  if (data?.format === 'hitapi-collection') throw new UsageError(`${basename(file)} was made by a newer HitAPI. Update hitapi-cli.`);
  throw new UsageError(`${basename(file)} is not a HitAPI collection, scenario or backup, or a Postman collection.`);
}

/** Data rows for data-driven runs: a CSV or JSON file. */
export function loadData(file) {
  let text;
  try { text = readFileSync(file, 'utf8'); } catch (e) { throw new UsageError(`Can't read ${file}: ${e.message}`); }
  const format = extname(file).toLowerCase() === '.json' || /^\s*\[/.test(text) ? 'json' : 'csv';
  try { return parseData({ text, format }); } catch (e) { throw new UsageError(`${basename(file)}: ${e.message}`); }
}

const row = (key, value, secret) => ({ key, value: String(value ?? ''), enabled: true, secret: !!secret || SECRET_NAME.test(key) });

/**
 * Variables from a file: Postman environment, HitAPI backup (pick one with envName),
 * { "name": "value" } JSON, [{ key, value }] JSON, or KEY=value lines (.env).
 * @returns {{ name, vars: rows, globals?: rows }}
 */
export function loadEnvFile(file, envName) {
  let text;
  try { text = readFileSync(file, 'utf8'); } catch (e) { throw new UsageError(`Can't read ${file}: ${e.code === 'ENOENT' ? 'no such file' : e.message}`); }
  let data = null;
  try { data = JSON.parse(text); } catch { /* .env style */ }
  if (data === null) {
    const vars = [];
    for (const raw of text.split(/\r?\n/)) {
      const line = raw.trim();
      if (!line || line.startsWith('#')) continue;
      const m = /^(?:export\s+)?([^=\s]+)\s*=\s*(.*)$/.exec(line);
      if (!m) throw new UsageError(`${basename(file)}: can't read the line "${line.slice(0, 60)}" (expected NAME=value)`);
      vars.push(row(m[1], m[2].replace(/^(['"])(.*)\1$/, '$2')));
    }
    return { name: basename(file), vars };
  }
  if (isPostmanEnvironment(data)) { const e = importPostmanEnvironment(data); return { name: e.name, vars: e.vars.map(v => ({ ...v, secret: v.secret || SECRET_NAME.test(v.key) })) }; }
  if (data?.format === 'hitapi-backup') {
    const envs = data.environments?.envs || [];
    const e = envName ? envs.find(x => x.name.toLowerCase() === String(envName).toLowerCase()) : envs[0];
    if (envName && !e) throw new UsageError(`No environment "${envName}" in ${basename(file)}. There is: ${envs.map(x => x.name).join(', ') || 'none'}`);
    return { name: e?.name || 'Globals', vars: normalizeRows(e?.vars), globals: normalizeRows(data.environments?.globals) };
  }
  if (Array.isArray(data)) return { name: basename(file), vars: normalizeRows(data) };
  if (data && typeof data === 'object') return { name: basename(file), vars: Object.entries(data).map(([k, v]) => row(k, typeof v === 'string' ? v : JSON.stringify(v))) };
  throw new UsageError(`${basename(file)} is not a variables file`);
}

/** HITAPI_VAR_token=… → token (CI secrets). */
export function varsFromProcessEnv(env = process.env) {
  return Object.entries(env).filter(([k]) => k.startsWith('HITAPI_VAR_') && k.length > 11).map(([k, v]) => row(k.slice(11), v, true));
}

/** --var name=value */
export function parseVarArg(s) {
  const i = String(s).indexOf('=');
  if (i < 1) throw new UsageError(`--var needs name=value, got "${s}"`);
  const key = s.slice(0, i).trim();
  if (!isValidVarName(key)) throw new UsageError(`"${key}" is not a valid variable name`);
  return row(key, s.slice(i + 1));
}
