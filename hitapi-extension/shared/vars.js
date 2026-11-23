/**
 * shared/vars.js — {{variables}} and environments (roadmap feature 7). Pure functions.
 *
 *   rows   [{ key, value, secret, enabled }]  — the same shape everywhere:
 *          globals, each environment, a collection's and a folder's variables.
 *
 * Which value is used, most specific first:
 *   data row (scenario data-driven runs) → active environment → folder (innermost first) → collection → globals
 * (the collection gives defaults; the environment you pick overrides them).
 *
 * Dynamic variables ({{$uuid}}, {{$timestamp}}, …) get a new value at every use.
 */

export const VAR_RE = /\{\{\s*([^{}\s][^{}]*?)\s*\}\}/g;
const MAX_DEPTH = 5;   // a value may itself contain {{vars}}

const pick = (a) => a[Math.floor(Math.random() * a.length)];
const FIRST = ['Asha', 'Ben', 'Chen', 'Diego', 'Elif', 'Farah', 'Gita', 'Hugo', 'Ines', 'Jonas', 'Kiri', 'Leila', 'Mateo', 'Noor', 'Omar', 'Priya'];
const LAST = ['Khan', 'Silva', 'Novak', 'Okafor', 'Rossi', 'Tanaka', 'Weber', 'Patel', 'Garcia', 'Larsen', 'Moreau', 'Ivanova'];

export const DYNAMIC = {
  $uuid: { about: 'A random UUID v4', make: () => crypto.randomUUID() },
  $guid: { about: 'Same as $uuid', make: () => crypto.randomUUID() },
  $timestamp: { about: 'Unix time in seconds', make: () => String(Math.floor(Date.now() / 1000)) },
  $timestampMs: { about: 'Unix time in milliseconds', make: () => String(Date.now()) },
  $isoDate: { about: 'Now as ISO 8601, e.g. 2026-11-22T12:30:00.000Z', make: () => new Date().toISOString() },
  $isoTimestamp: { about: 'Same as $isoDate', make: () => new Date().toISOString() },
  $randomInt: { about: 'A whole number from 0 to 1000', make: () => String(Math.floor(Math.random() * 1001)) },
  $randomEmail: { about: 'A random email at example.com', make: () => `${pick(FIRST).toLowerCase()}.${pick(LAST).toLowerCase()}${Math.floor(Math.random() * 1000)}@example.com` },
  $randomName: { about: 'A random full name', make: () => `${pick(FIRST)} ${pick(LAST)}` },
  $randomFirstName: { about: 'A random first name', make: () => pick(FIRST) },
  $randomBoolean: { about: 'true or false', make: () => String(Math.random() < 0.5) },
};

export const isValidVarName = (name) => /^[A-Za-z_][\w.-]{0,99}$/.test(String(name || ''));

export function normalizeRows(rows) {
  return (Array.isArray(rows) ? rows : []).map(r => ({ key: String(r?.key ?? ''), value: String(r?.value ?? ''), secret: !!r?.secret, enabled: r?.enabled !== false }));
}

/**
 * The variables a request can use.
 * @param {{ globals?: Array, env?: { name, vars }|null, ancestors?: Array }} s  ancestors: [collection, …folders]
 * @returns {Map<string, { value: string, secret: boolean, from: string, scope: string }>}
 */
export function buildScope({ globals = [], env = null, ancestors = [], local = null } = {}) {
  const map = new Map();
  const add = (rows, from, scope) => {
    for (const r of normalizeRows(rows)) {
      if (!r.enabled || !r.key.trim()) continue;
      map.set(r.key.trim(), { value: r.value, secret: r.secret, from, scope });
    }
  };
  add(globals, 'Globals', 'globals');
  for (const a of ancestors) add(a.settings?.variables, a.name, a.type);   // collection, then folders (inner wins)
  if (env) add(env.vars, env.name, 'environment');
  if (local) for (const [k, v] of Object.entries(local)) if (k.trim()) map.set(k.trim(), { value: String(v ?? ''), secret: false, from: 'the data row', scope: 'data' });
  return map;
}

/** Names used in a string: ['baseUrl', '$uuid'] */
export function varsIn(text) {
  const out = [];
  for (const m of String(text ?? '').matchAll(VAR_RE)) out.push(m[1]);
  return out;
}

/**
 * Replace {{vars}} in a string.
 * @returns {{ value: string, missing: Set<string>, used: Set<string> }}
 */
export function resolveString(text, scope, acc = { missing: new Set(), used: new Set() }, depth = 0) {
  const value = String(text ?? '').replace(VAR_RE, (whole, name) => {
    if (DYNAMIC[name]) { acc.used.add(name); return DYNAMIC[name].make(); }
    const v = scope.get(name);
    if (!v) { acc.missing.add(name); return whole; }
    acc.used.add(name);
    return depth < MAX_DEPTH && v.value.includes('{{') ? resolveString(v.value, scope, acc, depth + 1).value : v.value;
  });
  return { value, missing: acc.missing, used: acc.used };
}

/** Every string of the request that may hold {{vars}}, as [get, set] pairs. */
function slots(d) {
  const out = [];
  const field = (obj, key) => { if (obj && typeof obj[key] === 'string') out.push([() => obj[key], (v) => { obj[key] = v; }]); };
  field(d, 'url');
  for (const r of d.headers || []) if (r.enabled !== false) { field(r, 'key'); field(r, 'value'); }
  const b = d.bodies || {};
  if (['json', 'xml', 'text'].includes(d.bodyType)) field(b, d.bodyType);
  if (d.bodyType === 'urlencoded') for (const r of b.urlencoded || []) { field(r, 'key'); field(r, 'value'); }
  if (d.bodyType === 'form') for (const r of b.form || []) { field(r, 'key'); if (r.kind !== 'file') field(r, 'value'); }
  if (d.bodyType === 'graphql' && b.graphql) { field(b.graphql, 'query'); field(b.graphql, 'variables'); }
  const a = d.auth || {};
  const sec = { bearer: ['token', 'prefix'], basic: ['username', 'password'], apikey: ['key', 'value'], custom: ['name', 'value'], oauth2: ['tokenUrl', 'clientId', 'clientSecret', 'scope', 'audience'] }[a.type];
  for (const k of sec || []) field(a[a.type], k);
  return out;
}

/**
 * The request with every {{var}} replaced. The params rows follow the URL, which is what is sent.
 * @returns {{ draft, missing: string[], used: string[] }}
 */
export function resolveDraft(draft, scope) {
  const d = structuredClone(draft);
  const acc = { missing: new Set(), used: new Set() };
  for (const [get, set] of slots(d)) {
    const t = get();
    if (t.includes('{{')) set(resolveString(t, scope, acc).value);
  }
  return { draft: d, missing: [...acc.missing], used: [...acc.used] };
}

/** Variables a request uses, in order, each with what it resolves to (for the "Variables" line). */
export function usedVars(draft, scope) {
  const names = [];
  for (const [get] of slots(structuredClone(draft))) for (const n of varsIn(get())) if (!names.includes(n)) names.push(n);
  return names.map(name => {
    if (DYNAMIC[name]) return { name, dynamic: true, about: DYNAMIC[name].about };
    const v = scope.get(name);
    return v ? { name, value: v.value, secret: v.secret, from: v.from, scope: v.scope } : { name, missing: true };
  });
}

/** Hide secret values: for display. */
export const shown = (v) => (v.secret ? (v.value ? '•'.repeat(Math.min(8, v.value.length)) : '') : v.value);

// ── Setting variables from a response ───────────────────────────────────────

/**
 * Read a value with a small JSONPath: $.data[0].token, $['a b'].c, $.items.length
 * @returns {{ found: boolean, value?: any }}
 */
export function readPath(obj, path) {
  let p = String(path || '').trim();
  if (!p.startsWith('$')) p = `$.${p}`;
  const keys = [];
  const re = /\.([A-Za-z_$][\w$-]*)|\[(\d+)\]|\['((?:[^'\\]|\\.)*)'\]|\["((?:[^"\\]|\\.)*)"\]/g;
  let m; let pos = 1;
  while ((m = re.exec(p)) && m.index === pos) {
    keys.push(m[1] ?? (m[2] !== undefined ? Number(m[2]) : (m[3] ?? m[4]).replace(/\\(.)/g, '$1')));
    pos = re.lastIndex;
  }
  if (pos !== p.length) return { found: false, error: `Can't read the path "${path}". Use e.g. $.data.token or $.items[0].id` };
  let cur = obj;
  for (const k of keys) {
    if (k === 'length' && (Array.isArray(cur) || typeof cur === 'string')) { cur = cur.length; continue; }
    if (cur == null || typeof cur !== 'object' || !(k in cur)) return { found: false };
    cur = cur[k];
  }
  return { found: true, value: cur };
}

/**
 * Rules on a request: draft.extract = [{ name, from: 'json'|'header'|'status', path, enabled }]
 * @returns {Array<{ name, value?: string, ok: boolean, reason?: string }>}
 */
export function runExtract(rules, res) {
  const out = [];
  let json; let parsed = false;
  for (const r of rules || []) {
    if (r.enabled === false || !String(r.name || '').trim()) continue;
    const name = r.name.trim();
    if (!res || res.error) { out.push({ name, ok: false, reason: 'the request failed' }); continue; }
    if (r.from === 'status') { out.push({ name, ok: true, value: String(res.status) }); continue; }
    if (r.from === 'header') {
      const want = String(r.path || '').trim().toLowerCase();
      const hit = (res.rawHeaders || res.headers || []).find(([k]) => k.toLowerCase() === want);
      out.push(hit ? { name, ok: true, value: String(hit[1]) } : { name, ok: false, reason: `no ${r.path} header` });
      continue;
    }
    if (!parsed) { parsed = true; try { json = JSON.parse(res.text); } catch { json = undefined; } }
    if (json === undefined) { out.push({ name, ok: false, reason: 'the response is not JSON' }); continue; }
    const got = readPath(json, r.path);
    if (got.error) { out.push({ name, ok: false, reason: got.error }); continue; }
    if (!got.found) { out.push({ name, ok: false, reason: `${r.path} is not in the response` }); continue; }
    out.push({ name, ok: true, value: typeof got.value === 'string' ? got.value : JSON.stringify(got.value) });
  }
  return out;
}

/** Set (or add) a variable in rows; returns new rows. Keeps the secret flag of an existing row. */
export function setVar(rows, name, value, { secret } = {}) {
  const list = normalizeRows(rows);
  const i = list.findIndex(r => r.key.trim() === name);
  if (i >= 0) list[i] = { ...list[i], value, enabled: true, ...(secret !== undefined ? { secret } : {}) };
  else list.push({ key: name, value, secret: secret ?? /token|secret|password|key/i.test(name), enabled: true });
  return list;
}

/** Rows with secret values blanked (exports, history). */
export const maskRows = (rows) => normalizeRows(rows).map(r => (r.secret ? { ...r, value: '' } : r));
