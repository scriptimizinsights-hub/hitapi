/**
 * shared/convert/postman.js — Postman collections v2.0 / v2.1 and Postman
 * environments ↔ Workbench collections (roadmap feature 10).
 *
 * Import: folders, requests, headers, query, path variables, bodies (raw JSON/XML/text,
 * urlencoded, form-data, GraphQL), auth (collection, folder, request; "inherit"),
 * collection variables, and simple test scripts:
 *   pm.response.to.have.status(200)  → Tests: status equals 200
 *   pm.environment.set("token", pm.response.json().token) → Set vars: token ← $.token
 * Other script lines are skipped (and counted in the notes).
 *
 * Export: Postman v2.1 JSON. Tests and Set vars rules become pm.test / pm.environment.set
 * scripts, so they keep working in Postman.
 */

import { newCollection, newFolder, newRequest } from '../collections.js';
import { normalizeAuth, emptyAuth } from '../auth.js';
import { normalizeRows } from '../vars.js';
import { newTest } from '../assert.js';
import { blankDraft, colonToVars } from './draft.js';
import { paramsFromUrl, normalizeUrl } from '../http.js';

export const SCHEMA_21 = 'https://schema.getpostman.com/json/collection/v2.1.0/collection.json';

export const isPostmanCollection = (d) => !!d?.info && /getpostman\.com\/json\/collection\/v2/.test(String(d.info.schema || '')) && Array.isArray(d.item);
export const isPostmanEnvironment = (d) => !!d && Array.isArray(d.values) && (d._postman_variable_scope === 'environment' || d._postman_variable_scope === 'globals' || ('name' in d && !d.info));

// ── auth ──
/** v2.1 lists [{ key, value }] and v2.0 objects { key: value } → plain object */
const kv = (x) => (Array.isArray(x) ? Object.fromEntries(x.map(p => [p.key, p.value])) : (x || {}));

function authFrom(pa, notes) {
  if (!pa) return null;   // not set: inherit
  const a = emptyAuth();
  const t = pa.type;
  const v = kv(pa[t]);
  if (t === 'noauth') return a;
  if (t === 'inherit') { a.type = 'inherit'; return a; }
  if (t === 'bearer') { a.type = 'bearer'; a.bearer.token = String(v.token ?? ''); return a; }
  if (t === 'basic') { a.type = 'basic'; a.basic = { username: String(v.username ?? ''), password: String(v.password ?? '') }; return a; }
  if (t === 'apikey') { a.type = 'apikey'; a.apikey = { key: String(v.key ?? 'X-API-Key'), value: String(v.value ?? ''), in: v.in === 'query' ? 'query' : 'header' }; return a; }
  if (t === 'oauth2' && (v.grant_type === 'client_credentials' || v.accessTokenUrl)) {
    a.type = 'oauth2';
    a.oauth2 = { ...a.oauth2, tokenUrl: String(v.accessTokenUrl ?? ''), clientId: String(v.clientId ?? ''), clientSecret: String(v.clientSecret ?? ''), scope: String(v.scope ?? ''), clientAuth: v.client_authentication === 'header' ? 'basic' : 'body' };
    if (v.grant_type && v.grant_type !== 'client_credentials') notes.push(`OAuth 2.0 "${v.grant_type}" grant isn't supported; it was set up as client credentials.`);
    return a;
  }
  if (t === 'oauth2' && v.accessToken) { a.type = 'bearer'; a.bearer.token = String(v.accessToken); return a; }
  notes.push(`"${t}" auth isn't supported and was left out.`);
  return a;
}

function authTo(a) {
  const x = normalizeAuth(a);
  const list = (o) => Object.entries(o).map(([key, value]) => ({ key, value, type: 'string' }));
  switch (x.type) {
    case 'bearer': return { type: 'bearer', bearer: list({ token: x.bearer.token }) };
    case 'basic': return { type: 'basic', basic: list({ username: x.basic.username, password: x.basic.password }) };
    case 'apikey': return { type: 'apikey', apikey: list({ key: x.apikey.key, value: x.apikey.value, in: x.apikey.in }) };
    case 'custom': return null;   // exported as a header instead
    case 'oauth2': return { type: 'oauth2', oauth2: list({ grant_type: 'client_credentials', accessTokenUrl: x.oauth2.tokenUrl, clientId: x.oauth2.clientId, clientSecret: x.oauth2.clientSecret, scope: x.oauth2.scope, client_authentication: x.oauth2.clientAuth === 'basic' ? 'header' : 'body' }) };
    case 'none': return { type: 'noauth' };
    default: return undefined;   // inherit: leave out
  }
}

// ── scripts ──
/** Recognise simple Postman test scripts. Returns { tests, extract, skipped } */
export function parseScripts(events) {
  const tests = []; const extract = []; let skipped = 0;
  for (const ev of events || []) {
    if (ev.listen !== 'test') { if ((ev.script?.exec || []).some(l => l.trim() && !l.trim().startsWith('//'))) skipped++; continue; }
    const lines = [].concat(ev.script?.exec || []).join('\n').split('\n');
    let jsonVar = null;
    for (const raw of lines) {
      const l = raw.trim();
      if (!l || l.startsWith('//') || /^pm\.test\(|^\}\);?$|^\}\)/.test(l) && !/\.status|\.to\.|set\(/.test(l)) continue;
      let m;
      if ((m = /(?:var|let|const)\s+(\w+)\s*=\s*pm\.response\.json\(\)/.exec(l))) { jsonVar = m[1]; continue; }
      if ((m = /pm\.response\.to\.have\.status\((\d{3})\)/.exec(l))) { tests.push(newTest('status', { op: 'equals', expected: m[1] })); continue; }
      if ((m = /pm\.expect\(pm\.response\.code\)\.to\.(?:eql|equal|be\.oneOf)\(\[?(\d{3})/.exec(l))) { tests.push(newTest('status', { op: 'equals', expected: m[1] })); continue; }
      if ((m = /pm\.expect\(pm\.response\.responseTime\)\.to\.be\.below\((\d+)\)/.exec(l))) { tests.push(newTest('time', { expected: m[1] })); continue; }
      if ((m = /pm\.response\.to\.have\.header\(["']([^"']+)["']\)/.exec(l))) { tests.push(newTest('header', { path: m[1], op: 'exists' })); continue; }
      const jsonRef = jsonVar ? `(?:pm\\.response\\.json\\(\\)|${jsonVar})` : 'pm\\.response\\.json\\(\\)';
      if ((m = new RegExp(`pm\\.(?:environment|globals|collectionVariables|variables)\\.set\\(\\s*["']([\\w.-]+)["']\\s*,\\s*${jsonRef}((?:\\.[A-Za-z_$][\\w$]*|\\[\\d+\\])*)\\s*\\)`).exec(l))) {
        extract.push({ name: m[1], from: 'json', path: `$${m[2] || ''}`, enabled: true }); continue;
      }
      if ((m = /pm\.(?:environment|globals|collectionVariables|variables)\.set\(\s*["']([\w.-]+)["']\s*,\s*pm\.response\.headers\.get\(["']([^"']+)["']\)\s*\)/.exec(l))) {
        extract.push({ name: m[1], from: 'header', path: m[2], enabled: true }); continue;
      }
      if ((m = new RegExp(`pm\\.expect\\(${jsonRef}((?:\\.[A-Za-z_$][\\w$]*|\\[\\d+\\])+)\\)\\.to\\.(?:eql|equal)\\((.+)\\);?$`).exec(l))) {
        tests.push(newTest('json', { path: `$${m[1]}`, op: 'equals', expected: m[2].replace(/^["']|["']\)?;?$/g, '').replace(/\)$/, '') })); continue;
      }
      if ((m = new RegExp(`pm\\.expect\\(${jsonRef}((?:\\.[A-Za-z_$][\\w$]*|\\[\\d+\\])+)\\)\\.to\\.(?:exist|not\\.be\\.undefined)`).exec(l))) {
        tests.push(newTest('json', { path: `$${m[1]}`, op: 'exists' })); continue;
      }
      if (/^pm\.test\(/.test(l) || /^\}\);?$/.test(l)) continue;
      skipped++;
    }
  }
  return { tests, extract, skipped };
}

function scriptsFor(d) {
  const lines = [];
  const js = (s) => JSON.stringify(s);
  const path = (p) => String(p || '$').replace(/^\$/, '');
  for (const t of (d.tests || []).filter(x => x.enabled !== false)) {
    if (t.target === 'status' && t.op === 'equals') lines.push(`pm.test(${js(`Status is ${t.expected}`)}, function () {`, `    pm.response.to.have.status(${Number(t.expected) || 200});`, '});');
    else if (t.target === 'time') lines.push(`pm.test(${js(`Response time is below ${t.expected} ms`)}, function () {`, `    pm.expect(pm.response.responseTime).to.be.below(${Number(t.expected) || 1000});`, '});');
    else if (t.target === 'header' && t.op === 'exists') lines.push(`pm.test(${js(`${t.path} header is present`)}, function () {`, `    pm.response.to.have.header(${js(t.path)});`, '});');
    else if (t.target === 'json' && t.op === 'exists' && /^\$(\.[A-Za-z_$][\w$]*|\[\d+\])*$/.test(t.path)) lines.push(`pm.test(${js(`${t.path} exists`)}, function () {`, `    pm.expect(pm.response.json()${path(t.path)}).to.exist;`, '});');
    else if (t.target === 'json' && t.op === 'equals' && /^\$(\.[A-Za-z_$][\w$]*|\[\d+\])*$/.test(t.path)) {
      let v; try { v = JSON.stringify(JSON.parse(t.expected)); } catch { v = js(t.expected); }
      lines.push(`pm.test(${js(`${t.path} equals ${t.expected}`)}, function () {`, `    pm.expect(pm.response.json()${path(t.path)}).to.eql(${v});`, '});');
    } else lines.push(`// HitAPI check not converted: ${t.target} ${t.op} ${t.path || ''} ${t.expected || ''}`.trim());
  }
  for (const r of (d.extract || []).filter(x => x.enabled !== false && x.name)) {
    if (r.from === 'json' && /^\$(\.[A-Za-z_$][\w$]*|\[\d+\])*$/.test(r.path || '$')) lines.push(`pm.environment.set(${js(r.name)}, pm.response.json()${path(r.path)});`);
    else if (r.from === 'header') lines.push(`pm.environment.set(${js(r.name)}, pm.response.headers.get(${js(r.path)}));`);
    else if (r.from === 'status') lines.push(`pm.environment.set(${js(r.name)}, String(pm.response.code));`);
  }
  return lines.length ? [{ listen: 'test', script: { type: 'text/javascript', exec: lines } }] : undefined;
}

// ── import ──
function urlOf(u) {
  if (!u) return '';
  if (typeof u === 'string') return colonToVars(u);
  let raw = u.raw;
  if (!raw) {
    const host = Array.isArray(u.host) ? u.host.join('.') : (u.host || '');
    const path = Array.isArray(u.path) ? u.path.join('/') : (u.path || '');
    const q = (u.query || []).filter(x => !x.disabled).map(x => `${x.key}${x.value != null ? `=${x.value}` : ''}`).join('&');
    raw = `${u.protocol ? `${u.protocol}://` : ''}${host}${path ? `/${path}` : ''}${q ? `?${q}` : ''}`;
  }
  for (const v of u.variable || []) if (v.key && v.value != null && v.value !== '') raw = raw.replace(new RegExp(`(^|/):${v.key}(?=/|\\?|$)`), `$1${v.value}`);
  return colonToVars(raw);
}

function requestFrom(item, notes) {
  const r = typeof item.request === 'string' ? { url: item.request, method: 'GET' } : (item.request || {});
  const d = blankDraft({ method: String(r.method || 'GET').toUpperCase(), url: urlOf(r.url) });
  d.params = paramsFromUrl(d.url, []);
  // switched-off query rows from Postman's url.query
  if (r.url && typeof r.url === 'object') for (const q of r.url.query || []) if (q.disabled) d.params.push({ key: q.key, value: q.value ?? '', enabled: false });
  d.headers = (Array.isArray(r.header) ? r.header : []).map(x => ({ key: String(x.key ?? ''), value: String(x.value ?? ''), enabled: !x.disabled }));
  const b = r.body;
  if (b?.mode === 'raw') {
    const lang = b.options?.raw?.language || '';
    const ct = d.headers.find(x => x.key.toLowerCase() === 'content-type')?.value || '';
    const type = lang === 'json' || /json/.test(ct) ? 'json' : lang === 'xml' || /xml/.test(ct) ? 'xml' : (() => { try { JSON.parse(b.raw); return 'json'; } catch { return 'text'; } })();
    d.bodyType = type; d.bodies[type] = String(b.raw ?? '');
  } else if (b?.mode === 'urlencoded') {
    d.bodyType = 'urlencoded'; d.bodies.urlencoded = (b.urlencoded || []).map(x => ({ key: x.key, value: x.value ?? '', enabled: !x.disabled }));
  } else if (b?.mode === 'formdata') {
    d.bodyType = 'form';
    d.bodies.form = (b.formdata || []).map(x => ({ id: `f${Math.random().toString(36).slice(2, 9)}`, key: x.key, value: x.type === 'file' ? '' : (x.value ?? ''), kind: x.type === 'file' ? 'file' : 'text', fileName: x.type === 'file' ? String(x.src || '').split(/[\\/]/).pop() : '', enabled: !x.disabled }));
    if ((b.formdata || []).some(x => x.type === 'file')) notes.add('File fields in form-data were imported without their files: pick them again.');
  } else if (b?.mode === 'graphql') {
    d.bodyType = 'graphql'; d.bodies.graphql = { query: String(b.graphql?.query ?? ''), variables: String(b.graphql?.variables ?? '') };
  } else if (b?.mode === 'file') {
    d.bodyType = 'binary'; d.bodies.binary = { fileName: String(b.file?.src || '').split(/[\\/]/).pop(), size: 0, type: '' };
    notes.add('Binary file bodies were imported without their files: pick them again.');
  } else d.bodyType = 'json';
  const list = [];
  const a = authFrom(r.auth, list);
  list.forEach(n => notes.add(n));
  d.auth = a || { ...emptyAuth(), type: 'inherit' };
  const s = parseScripts(item.event);
  d.tests = s.tests; d.extract = s.extract;
  return { draft: d, skipped: s.skipped };
}

/**
 * @returns {{ collection, notes: string[], stats: { requests, folders, skippedScripts } }}
 */
export function importPostman(data) {
  if (!isPostmanCollection(data)) throw new Error('This is not a Postman collection (v2.0 or v2.1).');
  const notes = new Set();
  const stats = { requests: 0, folders: 0, skippedScripts: 0 };
  const c = newCollection(String(data.info.name || 'Postman collection'));
  const ca = authFrom(data.auth, []);
  if (ca && ca.type !== 'inherit') c.settings.auth = ca;
  c.settings.variables = normalizeRows((data.variable || []).map(v => ({ key: v.key, value: v.value ?? '', enabled: !v.disabled, secret: v.type === 'secret' })));
  // a {{baseUrl}}-style variable stays a variable; requests use it as written
  const pre = parseScripts(data.event); stats.skippedScripts += pre.skipped;
  const walkItems = (items, into) => {
    for (const it of items || []) {
      if (Array.isArray(it.item)) {
        const f = newFolder(String(it.name || 'Folder'));
        const fa = authFrom(it.auth, []);
        if (fa) f.settings.auth = fa;
        stats.skippedScripts += parseScripts(it.event).skipped;
        stats.folders++;
        walkItems(it.item, f.children);
        into.push(f);
      } else {
        const { draft, skipped } = requestFrom(it, notes);
        stats.skippedScripts += skipped; stats.requests++;
        into.push(newRequest(String(it.name || `${draft.method} ${draft.url}`), draft));
      }
    }
  };
  walkItems(data.item, c.children);
  if (stats.skippedScripts) notes.add(`${stats.skippedScripts} script line${stats.skippedScripts === 1 ? '' : 's'} (pre-request or test code) couldn't be converted and were skipped. Status, response time, header, JSON equals/exists checks and pm.environment.set(…) from the JSON body or a header were converted.`);
  return { collection: c, notes: [...notes], stats };
}

/** Postman environment or globals file → { name, vars, scope } */
export function importPostmanEnvironment(data) {
  if (!isPostmanEnvironment(data)) throw new Error('This is not a Postman environment.');
  return {
    name: String(data.name || (data._postman_variable_scope === 'globals' ? 'Globals' : 'Environment')),
    scope: data._postman_variable_scope === 'globals' ? 'globals' : 'environment',
    vars: normalizeRows(data.values.map(v => ({ key: v.key, value: v.value ?? '', enabled: v.enabled !== false, secret: v.type === 'secret' }))),
  };
}

// ── export ──
function urlTo(raw, params) {
  const u = String(raw || '');
  const out = { raw: u };
  const m = /^(?:([a-z][\w+.-]*):\/\/)?([^/?#]*)([^?#]*)(?:\?([^#]*))?/i.exec(u.startsWith('{{') ? u.replace(/^(\{\{[^}]+\}\})/, 'x-var://$1') : u);
  if (m) {
    if (m[1] && m[1] !== 'x-var') out.protocol = m[1];
    out.host = m[1] === 'x-var' ? [m[2]] : m[2] ? m[2].split('.') : [];
    const path = m[3].replace(/^\//, '');
    if (path) out.path = path.split('/');
    const q = (params || []).filter(p => p.key);
    if (q.length) out.query = q.map(p => ({ key: p.key, value: p.value ?? '', ...(p.enabled === false ? { disabled: true } : {}) }));
  }
  return out;
}

function requestTo(node, base) {
  const d = node.draft;
  const url = String(d.url || '').startsWith('/') && base ? `{{baseUrl}}${d.url}` : String(d.url || '');
  const header = (d.headers || []).filter(h => String(h.key || '').trim()).map(h => ({ key: h.key, value: h.value ?? '', ...(h.enabled === false ? { disabled: true } : {}) }));
  const a = normalizeAuth(d.auth);
  if (a.type === 'custom' && a.custom.name) header.push({ key: a.custom.name, value: a.custom.value });
  const req = { method: String(d.method || 'GET').toUpperCase(), header, url: urlTo(url, d.params) };
  const auth = authTo(a);
  if (auth) req.auth = auth;
  const b = d.bodies || {};
  if (['json', 'xml', 'text'].includes(d.bodyType) && b[d.bodyType]) req.body = { mode: 'raw', raw: b[d.bodyType], options: { raw: { language: d.bodyType === 'text' ? 'text' : d.bodyType } } };
  else if (d.bodyType === 'urlencoded' && b.urlencoded?.length) req.body = { mode: 'urlencoded', urlencoded: b.urlencoded.map(r => ({ key: r.key, value: r.value ?? '', ...(r.enabled === false ? { disabled: true } : {}) })) };
  else if (d.bodyType === 'form' && b.form?.length) req.body = { mode: 'formdata', formdata: b.form.map(r => (r.kind === 'file' ? { key: r.key, type: 'file', src: r.fileName || '' } : { key: r.key, value: r.value ?? '', type: 'text' })) };
  else if (d.bodyType === 'graphql' && b.graphql?.query) req.body = { mode: 'graphql', graphql: { query: b.graphql.query, variables: b.graphql.variables || '' } };
  const item = { name: node.name, request: req };
  const ev = scriptsFor(d);
  if (ev) item.event = ev;
  return item;
}

/** A Workbench collection → Postman v2.1 JSON. Secrets are blanked unless { secrets: true }. */
export function exportPostman(collection) {
  const base = String(collection.settings?.baseUrl || '').replace(/\/+$/, '');
  const folderTo = (n) => {
    if (n.type === 'request') return requestTo(n, base);
    const f = { name: n.name, item: n.children.map(folderTo) };
    const auth = authTo(n.settings?.auth);
    if (auth) f.auth = auth;
    const hdrs = (n.settings?.headers || []).filter(h => h.enabled !== false && h.key);
    if (hdrs.length) f.description = `Headers for every request in this folder (HitAPI): ${hdrs.map(h => `${h.key}: ${h.value}`).join('; ')}`;
    return f;
  };
  const variable = (collection.settings?.variables || []).filter(v => v.key).map(v => ({ key: v.key, value: v.value, ...(v.secret ? { type: 'secret' } : {}), ...(v.enabled ? {} : { disabled: true }) }));
  if (base && !variable.some(v => v.key === 'baseUrl')) variable.unshift({ key: 'baseUrl', value: base });
  const out = {
    info: { _postman_id: crypto.randomUUID(), name: collection.name, schema: SCHEMA_21, description: 'Exported from the HitAPI Workbench.' },
    item: collection.children.map(folderTo),
    variable,
  };
  const auth = authTo(collection.settings?.auth);
  if (auth) out.auth = auth;
  const hdrs = (collection.settings?.headers || []).filter(h => h.enabled !== false && h.key);
  if (hdrs.length) out.event = [{ listen: 'prerequest', script: { type: 'text/javascript', exec: hdrs.map(h => `pm.request.headers.upsert({ key: ${JSON.stringify(h.key)}, value: ${JSON.stringify(h.value)} });`) } }];
  return out;
}

export { normalizeUrl };
