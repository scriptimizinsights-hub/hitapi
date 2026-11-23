/**
 * shared/convert/openapi.js — OpenAPI 3 / Swagger 2 ↔ Workbench collections (roadmap feature 10).
 *
 * Import: one folder per tag, one request per operation. Base URL from servers[0]
 * (server variables use their defaults) or Swagger's host + basePath. Path parameters
 * become {{variables}} (collection variables with the spec's example, if any). Query
 * and header parameters that are required or have an example are filled in. The JSON
 * body comes from the example, or is built from the schema. Security schemes
 * (bearer, basic, API key) set the collection's auth, with {{variables}} for the secret.
 *
 * Export (best effort): an OpenAPI 3.0 document with a path per request.
 */

import { newCollection, newFolder, newRequest } from '../collections.js';
import { emptyAuth, normalizeAuth } from '../auth.js';
import { blankDraft, braceToVars, varsToBraces } from './draft.js';
import { paramsFromUrl, normalizeUrl, splitUrl } from '../http.js';

const METHODS = ['get', 'post', 'put', 'patch', 'delete', 'head', 'options'];

export const isOpenApi = (d) => !!d && typeof d === 'object' && (typeof d.openapi === 'string' || d.swagger === '2.0' || d.swagger === 2) && d.paths && typeof d.paths === 'object';

/** Follow local $refs (#/components/schemas/X, #/definitions/X), at most 12 deep. */
function resolver(spec) {
  const get = (ref) => String(ref).replace(/^#\//, '').split('/').map(p => p.replace(/~1/g, '/').replace(/~0/g, '~')).reduce((o, k) => o?.[k], spec);
  const deref = (v, depth = 0) => {
    if (!v || typeof v !== 'object' || depth > 12) return v;
    if (v.$ref && typeof v.$ref === 'string' && v.$ref.startsWith('#')) return deref(get(v.$ref), depth + 1);
    return v;
  };
  return deref;
}

/** A sample value for a schema: example / default / enum, else a placeholder by type. */
export function sampleFrom(schema, deref, depth = 0, seen = new Set()) {
  const s = deref(schema);
  if (!s || typeof s !== 'object' || depth > 6) return null;
  if (s.example !== undefined) return s.example;
  if (s.default !== undefined) return s.default;
  if (Array.isArray(s.examples) && s.examples.length) return s.examples[0];
  if (Array.isArray(s.enum) && s.enum.length) return s.enum[0];
  if (s.allOf) return Object.assign({}, ...s.allOf.map(x => sampleFrom(x, deref, depth + 1, seen)).filter(x => x && typeof x === 'object'));
  if (s.oneOf || s.anyOf) return sampleFrom((s.oneOf || s.anyOf)[0], deref, depth + 1, seen);
  const type = Array.isArray(s.type) ? s.type.find(t => t !== 'null') : s.type || (s.properties ? 'object' : s.items ? 'array' : 'string');
  if (type === 'object') {
    if (seen.has(s)) return {};
    const next = new Set(seen); next.add(s);
    return Object.fromEntries(Object.entries(s.properties || {}).slice(0, 30).map(([k, v]) => [k, sampleFrom(v, deref, depth + 1, next)]));
  }
  if (type === 'array') return [sampleFrom(s.items, deref, depth + 1, seen)].filter(x => x !== null);
  if (type === 'integer' || type === 'number') return s.minimum ?? 0;
  if (type === 'boolean') return true;
  if (s.format === 'date-time') return '2026-01-01T00:00:00Z';
  if (s.format === 'date') return '2026-01-01';
  if (s.format === 'email') return 'user@example.com';
  if (s.format === 'uuid') return '00000000-0000-4000-8000-000000000000';
  return 'string';
}

function baseUrlOf(spec, sourceUrl) {
  let base = '';
  if (spec.openapi) {
    const srv = (spec.servers || [])[0];
    if (srv?.url) {
      base = String(srv.url).replace(/\{([^}]+)\}/g, (_, n) => String(srv.variables?.[n]?.default ?? n));
    }
  } else if (spec.host) {
    base = `${(spec.schemes || ['https'])[0]}://${spec.host}${spec.basePath || ''}`;
  } else if (spec.basePath) base = spec.basePath;
  if (base && !/^[a-z][\w+.-]*:\/\//i.test(base) && sourceUrl) {
    try { base = new URL(base, sourceUrl).toString(); } catch { /* keep relative */ }
  }
  return base.replace(/\/+$/, '');
}

function securityAuth(spec, deref, notes) {
  const schemes = spec.components?.securitySchemes || spec.securityDefinitions || {};
  const wanted = Object.keys((spec.security || [])[0] || {})[0] || Object.keys(schemes)[0];
  const s = wanted && deref(schemes[wanted]);
  const a = emptyAuth();
  if (!s) return { auth: a, vars: [] };
  if ((s.type === 'http' && /bearer/i.test(s.scheme)) || (s.type === 'oauth2') || (s.type === 'openIdConnect')) {
    a.type = 'bearer'; a.bearer.token = '{{token}}';
    if (s.type !== 'http') notes.push(`The "${wanted}" ${s.type} security was set up as a Bearer token: put an access token in {{token}}.`);
    return { auth: a, vars: [{ key: 'token', value: '', secret: true, enabled: true }] };
  }
  if ((s.type === 'http' && /basic/i.test(s.scheme)) || s.type === 'basic') {
    a.type = 'basic'; a.basic = { username: '{{username}}', password: '{{password}}' };
    return { auth: a, vars: [{ key: 'username', value: '', secret: false, enabled: true }, { key: 'password', value: '', secret: true, enabled: true }] };
  }
  if (s.type === 'apiKey' && s.in !== 'cookie') {
    a.type = 'apikey'; a.apikey = { key: s.name || 'X-API-Key', value: '{{apiKey}}', in: s.in === 'query' ? 'query' : 'header' };
    return { auth: a, vars: [{ key: 'apiKey', value: '', secret: true, enabled: true }] };
  }
  notes.push(`The "${wanted}" security scheme (${s.type}) isn't supported; set the auth yourself.`);
  return { auth: a, vars: [] };
}

/**
 * @param {object} spec
 * @param {{ sourceUrl?: string }} [o]
 * @returns {{ collection, notes: string[], stats: { requests, folders } }}
 */
export function importOpenApi(spec, { sourceUrl = '' } = {}) {
  if (!isOpenApi(spec)) throw new Error('This is not an OpenAPI 3 or Swagger 2 document.');
  const deref = resolver(spec);
  const notes = [];
  const c = newCollection(String(spec.info?.title || 'API'));
  c.settings.baseUrl = baseUrlOf(spec, sourceUrl);
  if (!c.settings.baseUrl) notes.push('The spec has no server URL: set the base URL in the collection settings.');
  else if (!/^https?:\/\//i.test(c.settings.baseUrl)) notes.push(`The server URL "${c.settings.baseUrl}" is relative: set the full base URL in the collection settings.`);
  const sec = securityAuth(spec, deref, notes);
  c.settings.auth = sec.auth;
  const vars = new Map(sec.vars.map(v => [v.key, v]));
  const folders = new Map();
  let count = 0;
  for (const [path, item0] of Object.entries(spec.paths)) {
    const item = deref(item0) || {};
    for (const m of METHODS) {
      const op = item[m];
      if (!op) continue;
      const params = [...(item.parameters || []), ...(op.parameters || [])].map(p => deref(p)).filter(Boolean);
      const d = blankDraft({ method: m.toUpperCase(), auth: { ...emptyAuth(), type: op.security && !op.security.length ? 'none' : 'inherit' } });
      for (const p of params.filter(x => x.in === 'path')) {
        if (!vars.has(p.name)) {
          const ex = p.example ?? p.schema?.example ?? p['x-example'] ?? (p.schema ? sampleFrom(p.schema, deref) : '');
          vars.set(p.name, { key: p.name, value: ex === 'string' || ex == null ? '' : String(ex), secret: false, enabled: true });
        }
      }
      const query = params.filter(x => x.in === 'query' && (x.required || x.example !== undefined || x.schema?.example !== undefined || x.schema?.default !== undefined))
        .map(x => [x.name, String(x.example ?? x.schema?.example ?? x.schema?.default ?? x['x-example'] ?? '')]);
      d.url = `${braceToVars(path)}${query.length ? `?${query.map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`).join('&')}` : ''}`;
      d.params = paramsFromUrl(d.url, []);
      d.headers = params.filter(x => x.in === 'header' && !/^(authorization|content-type|accept)$/i.test(x.name) && (x.required || x.example !== undefined))
        .map(x => ({ key: x.name, value: String(x.example ?? x.schema?.example ?? ''), enabled: true }));
      // body
      let content = null; let ct = '';
      if (op.requestBody) {
        const rb = deref(op.requestBody);
        const types = Object.keys(rb?.content || {});
        ct = types.find(t => /json/.test(t)) || types.find(t => /x-www-form-urlencoded/.test(t)) || types.find(t => /xml/.test(t)) || types[0] || '';
        content = rb?.content?.[ct];
      } else {
        const bp = params.find(x => x.in === 'body');
        if (bp) { ct = (op.consumes || spec.consumes || ['application/json'])[0]; content = { schema: bp.schema, example: bp['x-example'] }; }
        const fp = params.filter(x => x.in === 'formData');
        if (fp.length) { d.bodyType = 'urlencoded'; d.bodies.urlencoded = fp.filter(x => x.type !== 'file').map(x => ({ key: x.name, value: String(x.default ?? ''), enabled: true })); }
      }
      if (content) {
        const ex = content.example ?? (content.examples ? deref(Object.values(content.examples)[0])?.value : undefined) ?? sampleFrom(content.schema, deref);
        if (/json/.test(ct) || !ct) { d.bodyType = 'json'; d.bodies.json = ex == null ? '' : JSON.stringify(ex, null, 2); }
        else if (/x-www-form-urlencoded/.test(ct) && ex && typeof ex === 'object') { d.bodyType = 'urlencoded'; d.bodies.urlencoded = Object.entries(ex).map(([key, value]) => ({ key, value: typeof value === 'string' ? value : JSON.stringify(value), enabled: true })); }
        else if (/xml/.test(ct)) { d.bodyType = 'xml'; d.bodies.xml = typeof ex === 'string' ? ex : ''; }
        else if (/multipart/.test(ct) && ex && typeof ex === 'object') { d.bodyType = 'form'; d.bodies.form = Object.entries(ex).map(([key, value]) => ({ id: `f${Math.random().toString(36).slice(2, 9)}`, key, value: typeof value === 'string' ? value : JSON.stringify(value), kind: 'text', fileName: '', enabled: true })); }
        else { d.bodyType = 'text'; d.bodies.text = typeof ex === 'string' ? ex : ''; }
        if (ct && !/json/.test(ct) && !/x-www-form-urlencoded|multipart/.test(ct)) d.headers.push({ key: 'Content-Type', value: ct, enabled: true });
      }
      const tag = (op.tags || [])[0];
      const name = String(op.summary || op.operationId || `${m.toUpperCase()} ${path}`).slice(0, 120);
      const req = newRequest(name, d);
      if (tag) {
        if (!folders.has(tag)) { const f = newFolder(tag); folders.set(tag, f); c.children.push(f); }
        folders.get(tag).children.push(req);
      } else c.children.push(req);
      count++;
    }
  }
  c.settings.variables = [...vars.values()];
  if (!count) throw new Error('The spec has no operations to import.');
  return { collection: c, notes, stats: { requests: count, folders: folders.size } };
}

// ── export ──

function schemaOf(v, depth = 0) {
  if (depth > 6) return {};
  if (v === null) return { nullable: true };
  if (Array.isArray(v)) return { type: 'array', items: v.length ? schemaOf(v[0], depth + 1) : {} };
  if (typeof v === 'object') return { type: 'object', properties: Object.fromEntries(Object.entries(v).map(([k, x]) => [k, schemaOf(x, depth + 1)])) };
  if (typeof v === 'number') return { type: Number.isInteger(v) ? 'integer' : 'number' };
  return { type: typeof v };
}

/** A Workbench collection → OpenAPI 3.0 (best effort). */
export function exportOpenApi(collection) {
  const base = String(collection.settings?.baseUrl || '').replace(/\/+$/, '');
  const spec = { openapi: '3.0.3', info: { title: collection.name, version: '1.0.0', description: 'Exported from the HitAPI Workbench.' }, servers: base ? [{ url: base }] : [], paths: {}, components: {} };
  const tags = new Set();
  const visit = (n, folder) => {
    if (n.type !== 'request') { n.children.forEach(ch => visit(ch, n.type === 'folder' ? n.name : folder)); return; }
    const d = n.draft;
    let raw = String(d.url || '');
    let path;
    if (raw.startsWith('/')) path = splitUrl(raw).base;
    else {
      const resolvedBase = base && raw.startsWith(base) ? raw.slice(base.length) : null;
      if (resolvedBase != null) path = splitUrl(resolvedBase || '/').base;
      else { try { path = new URL(normalizeUrl(raw.replace(/^\{\{[^}]+\}\}/, 'http://x'))).pathname; } catch { path = '/'; } path = decodeURI(path); }
    }
    path = varsToBraces(path || '/');
    const method = String(d.method || 'get').toLowerCase();
    if (!METHODS.includes(method)) return;
    const op = { summary: n.name, operationId: `${method}_${path.replace(/[^\w]+/g, '_').replace(/^_|_$/g, '')}`.slice(0, 80) };
    if (folder) { op.tags = [folder]; tags.add(folder); }
    const parameters = [];
    for (const m of path.matchAll(/\{([^}]+)\}/g)) parameters.push({ name: m[1], in: 'path', required: true, schema: { type: 'string' } });
    for (const p of (d.params || []).filter(x => x.key && x.enabled !== false)) parameters.push({ name: p.key, in: 'query', schema: { type: 'string' }, ...(p.value && !p.value.includes('{{') ? { example: p.value } : {}) });
    for (const h of (d.headers || []).filter(x => x.key && x.enabled !== false && !/^(authorization|content-type|accept|cookie)$/i.test(x.key))) parameters.push({ name: h.key, in: 'header', schema: { type: 'string' } });
    if (parameters.length) op.parameters = parameters;
    const b = d.bodies || {};
    if (d.bodyType === 'json' && b.json?.trim()) {
      let ex; try { ex = JSON.parse(b.json); } catch { ex = undefined; }
      op.requestBody = { content: { 'application/json': ex !== undefined ? { schema: schemaOf(ex), example: ex } : { schema: { type: 'object' } } } };
    } else if (d.bodyType === 'urlencoded' && b.urlencoded?.length) {
      op.requestBody = { content: { 'application/x-www-form-urlencoded': { schema: { type: 'object', properties: Object.fromEntries(b.urlencoded.filter(r => r.key).map(r => [r.key, { type: 'string' }])) } } } };
    } else if (['xml', 'text'].includes(d.bodyType) && b[d.bodyType]) {
      op.requestBody = { content: { [d.bodyType === 'xml' ? 'application/xml' : 'text/plain']: { schema: { type: 'string' }, example: b[d.bodyType] } } };
    }
    const status = (d.tests || []).find(t => t.enabled !== false && t.target === 'status' && t.op === 'equals')?.expected || '200';
    op.responses = { [status]: { description: 'Response' } };
    spec.paths[path] = spec.paths[path] || {};
    if (spec.paths[path][method]) return;   // same method and path saved twice: keep the first
    spec.paths[path][method] = op;
  };
  visit(collection);
  const a = normalizeAuth(collection.settings?.auth);
  if (a.type === 'bearer' || a.type === 'oauth2') spec.components.securitySchemes = { bearerAuth: { type: 'http', scheme: 'bearer' } };
  else if (a.type === 'basic') spec.components.securitySchemes = { basicAuth: { type: 'http', scheme: 'basic' } };
  else if (a.type === 'apikey') spec.components.securitySchemes = { apiKey: { type: 'apiKey', name: a.apikey.key, in: a.apikey.in } };
  if (spec.components.securitySchemes) spec.security = [{ [Object.keys(spec.components.securitySchemes)[0]]: [] }];
  else delete spec.components;
  if (tags.size) spec.tags = [...tags].map(name => ({ name }));
  return spec;
}
