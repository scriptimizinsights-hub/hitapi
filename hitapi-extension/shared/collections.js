/**
 * shared/collections.js — saved requests organised in collections and folders
 * (roadmap feature 6). Pure functions on a plain tree; storage lives in
 * workbench/collections-store.js.
 *
 *   tree = { items: [collection, …] }
 *   collection = { id, type: 'collection', name, settings: { baseUrl, headers, auth }, children: [folder|request] }
 *   folder     = { id, type: 'folder', name, settings: { headers, auth }, children: [folder|request] }
 *   request    = { id, type: 'request', name, draft }
 *
 * Inheritance, from the collection down: headers are added (a request's own
 * header with the same name wins), auth is used when the request's Auth tab
 * says "Inherit", and a request URL that starts with "/" goes after the
 * collection's base URL.
 */

import { emptyAuth, normalizeAuth } from './auth.js';
import { normalizeUrl } from './http.js';
import { maskDraft } from './history.js';
import { normalizeRows, maskRows } from './vars.js';

export const FORMAT = 'hitapi-collection';
export const FORMAT_VERSION = 1;

let seq = 0;
export const newId = (prefix = 'n') => `${prefix}${Date.now().toString(36)}${(seq++).toString(36)}${Math.random().toString(36).slice(2, 6)}`;

export function emptySettings(type) {
  const auth = emptyAuth();
  if (type === 'folder') auth.type = 'inherit';
  return type === 'collection' ? { baseUrl: '', headers: [], auth, variables: [] } : { headers: [], auth, variables: [] };
}

export function newCollection(name = 'New collection') {
  return { id: newId('c'), type: 'collection', name, settings: emptySettings('collection'), children: [] };
}
export function newFolder(name = 'New folder') {
  return { id: newId('f'), type: 'folder', name, settings: emptySettings('folder'), children: [] };
}
export function newRequest(name, draft) {
  const d = structuredClone(draft);
  delete d.source; delete d.link;
  return { id: newId('r'), type: 'request', name: name || requestName(draft), draft: d };
}

/** "GET /users/42" from a draft, for a default name. */
export function requestName(draft) {
  let path = String(draft.url || '').trim();
  if (path.includes('{{')) path = path.replace(/^\{\{[^{}]+\}\}/, '').replace(/^[a-z]+:\/\/[^/]+/i, '') || '/';   // "{{baseUrl}}/users" → "/users"
  else try { if (!path.startsWith('/')) { const u = new URL(normalizeUrl(path)); path = u.pathname + u.search; } } catch { /* keep as typed */ }
  return `${String(draft.method || 'GET').toUpperCase()} ${path || '/'}`.slice(0, 80);
}

export function normalizeTree(t) {
  const items = Array.isArray(t?.items) ? t.items : [];
  const fix = (n) => {
    if (n.type === 'request') return { ...n, name: n.name || 'Request' };
    const out = { ...n, name: n.name || (n.type === 'collection' ? 'Collection' : 'Folder'), children: (n.children || []).map(fix) };
    out.settings = { ...emptySettings(n.type), ...(n.settings || {}) };
    out.settings.headers = Array.isArray(out.settings.headers) ? out.settings.headers : [];
    out.settings.variables = normalizeRows(out.settings.variables);
    out.settings.auth = normalizeAuth(out.settings.auth);
    if (n.type === 'collection' && out.settings.auth.type === 'inherit') out.settings.auth.type = 'none';
    return out;
  };
  return { items: items.filter(n => n?.type === 'collection').map(fix) };
}

/** Walk every node: fn(node, parent, ancestors). */
export function walk(tree, fn) {
  const go = (nodes, parent, anc) => {
    for (const n of nodes) {
      fn(n, parent, anc);
      if (n.children) go(n.children, n, [...anc, n]);
    }
  };
  go(tree.items, null, []);
}

/** { node, parent, ancestors } or null. ancestors = [collection, …folders] (not the node). */
export function find(tree, id) {
  let hit = null;
  walk(tree, (n, parent, ancestors) => { if (!hit && n.id === id) hit = { node: n, parent, ancestors }; });
  return hit;
}

const siblings = (tree, parent) => (parent ? parent.children : tree.items);

export function remove(tree, id) {
  const f = find(tree, id);
  if (!f) return null;
  const list = siblings(tree, f.parent);
  list.splice(list.indexOf(f.node), 1);
  return f.node;
}

/** Deep copy with new ids. */
export function cloneNode(node, rename = true) {
  const copy = structuredClone(node);
  const renew = (n) => { n.id = newId(n.type[0]); (n.children || []).forEach(renew); };
  renew(copy);
  if (rename) copy.name = `${node.name} copy`;
  return copy;
}

export function duplicate(tree, id) {
  const f = find(tree, id);
  if (!f) return null;
  const copy = cloneNode(f.node);
  const list = siblings(tree, f.parent);
  list.splice(list.indexOf(f.node) + 1, 0, copy);
  return copy;
}

const isInside = (node, id) => node.id === id || (node.children || []).some(c => isInside(c, id));

/**
 * Can `id` be dropped at `targetId`?
 * where 'inside' (into a collection/folder, at the end), 'before' or 'after' a sibling.
 */
export function canMove(tree, id, targetId, where) {
  const f = find(tree, id); const t = find(tree, targetId);
  if (!f || !t || id === targetId) return false;
  if (isInside(f.node, targetId)) return false;                      // into itself
  if (where === 'inside') return t.node.type !== 'request' && f.node.type !== 'collection';
  if (f.node.type === 'collection') return t.node.type === 'collection';   // collections only reorder
  return t.node.type !== 'collection';
}

export function move(tree, id, targetId, where) {
  if (!canMove(tree, id, targetId, where)) return false;
  const node = remove(tree, id);
  const t = find(tree, targetId);
  if (where === 'inside') t.node.children.push(node);
  else {
    const list = siblings(tree, t.parent);
    list.splice(list.indexOf(t.node) + (where === 'after' ? 1 : 0), 0, node);
  }
  return true;
}

export function countRequests(node) {
  if (node.type === 'request') return 1;
  return (node.children || []).reduce((n, c) => n + countRequests(c), 0);
}

/** Requests under a node, in tree order, with their ancestors. */
export function requestsIn(tree, id) {
  const f = find(tree, id);
  if (!f) return [];
  const out = [];
  const go = (n, anc) => {
    if (n.type === 'request') out.push({ node: n, ancestors: anc });
    else for (const c of n.children) go(c, [...anc, n]);
  };
  go(f.node, f.ancestors);
  return out;
}

/** Collections and folders as indented options for a "save into" picker. */
export function containerOptions(tree) {
  const out = [];
  walk(tree, (n, _p, anc) => { if (n.type !== 'request') out.push({ id: n.id, label: n.name, depth: anc.length, type: n.type }); });
  return out;
}

/** "Collection / Folder / Request" */
export const breadcrumb = (found) => [...found.ancestors, found.node].map(n => n.name);

// ── Inheritance ─────────────────────────────────────────────────────────────

/** The auth a request with "Inherit" gets: nearest folder/collection that sets one. */
export function inheritedAuth(ancestors) {
  for (let i = ancestors.length - 1; i >= 0; i--) {
    const a = ancestors[i].settings?.auth;
    if (a && a.type !== 'inherit') return { auth: normalizeAuth(a), from: ancestors[i] };
  }
  return { auth: emptyAuth(), from: ancestors[0] || null };
}

/** Headers added by the collection and folders (later ones win), each with where it came from. */
export function inheritedHeaders(ancestors) {
  const byName = new Map();
  for (const a of ancestors) {
    for (const r of a.settings?.headers || []) {
      if (r.enabled === false || !String(r.key || '').trim()) continue;
      byName.set(String(r.key).trim().toLowerCase(), { key: String(r.key).trim(), value: r.value ?? '', enabled: true, from: a.name });
    }
  }
  return [...byName.values()];
}

export function baseUrlOf(ancestors) {
  return String(ancestors[0]?.settings?.baseUrl || '').trim().replace(/\/+$/, '');
}

/** URL that will be sent: "/users" + base URL → full URL. */
export function resolveUrl(url, ancestors) {
  const u = String(url || '').trim();
  const base = baseUrlOf(ancestors);
  if (base && u.startsWith('/') && !u.startsWith('//')) return base + u;
  return u;
}

/**
 * The draft as it will be sent: base URL, inherited headers and auth applied.
 * The request's own values always win.
 */
export function effectiveDraft(draft, ancestors) {
  if (!ancestors?.length) return draft;
  const d = structuredClone(draft);
  d.url = resolveUrl(draft.url, ancestors);
  const own = new Set(d.headers.filter(r => r.enabled !== false && String(r.key || '').trim()).map(r => String(r.key).trim().toLowerCase()));
  const added = inheritedHeaders(ancestors).filter(r => !own.has(r.key.toLowerCase())).map(({ from, ...r }) => r);
  d.headers = [...added, ...d.headers];
  if (normalizeAuth(d.auth).type === 'inherit') d.auth = inheritedAuth(ancestors).auth;
  return d;
}

/** Is the open draft different from what is saved? (ignores UI-only fields) */
/** JSON with object keys sorted (chrome.storage hands objects back with their keys reordered). */
export function stableJson(v) {
  if (Array.isArray(v)) return `[${v.map(stableJson).join(',')}]`;
  if (v && typeof v === 'object') return `{${Object.keys(v).sort().filter(k => v[k] !== undefined).map(k => `${JSON.stringify(k)}:${stableJson(v[k])}`).join(',')}}`;
  return JSON.stringify(v ?? null);
}

export function isDirty(draft, saved) {
  if (!saved) return false;
  const pick = (d) => stableJson({ m: d.method, u: d.url, p: d.params, h: d.headers, bt: d.bodyType, b: d.bodies, a: d.auth, s: d.settings, x: d.extract || [], t: d.tests || [] });
  return pick(draft) !== pick(saved);
}

// ── Export / import (HitAPI's own format; Postman and HAR are roadmap feature 10) ──

export function exportCollection(node, { secrets = false } = {}) {
  const strip = (n) => {
    const c = { ...n };
    if (n.type === 'request') {
      c.draft = secrets ? structuredClone(n.draft) : maskDraft(n.draft, { keepVars: true }).draft;
    } else {
      c.settings = structuredClone(n.settings);
      if (!secrets) {
        c.settings.headers = maskDraft({ headers: c.settings.headers }, { keepVars: true }).draft.headers;
        c.settings.auth = maskDraft({ headers: [], auth: c.settings.auth }, { keepVars: true }).draft.auth;
        c.settings.variables = maskRows(c.settings.variables);
      }
      c.children = n.children.map(strip);
    }
    return c;
  };
  return { format: FORMAT, version: FORMAT_VERSION, exportedAt: new Date().toISOString(), secrets, collection: strip(node) };
}

/** Parse an exported file → a collection with new ids. Throws with a readable message. */
export function importCollection(text) {
  let data;
  try { data = typeof text === 'string' ? JSON.parse(text) : text; } catch { throw new Error('This file is not JSON.'); }
  if (data?.info?.schema && /getpostman/.test(data.info.schema)) throw new Error('This is a Postman collection. Postman import is coming in a later update; for now import HitAPI collection files.');
  if (data?.format !== FORMAT || !data.collection || data.collection.type !== 'collection') throw new Error('This is not a HitAPI collection file.');
  if (data.version > FORMAT_VERSION) throw new Error('This file was made by a newer version of HitAPI. Update the extension first.');
  const [c] = normalizeTree({ items: [data.collection] }).items;
  return cloneNode(c, false);
}

// ── HitAPI projects (push / pull) ───────────────────────────────────────────

/**
 * Saved requests → HitAPI endpoints for a project with this base URL.
 * Path is relative to the project's base URL. Requests that are not under it
 * (another host or path) are marked outside: true and should not be sent.
 */
export function toEndpoints(tree, id, projectBaseUrl = '') {
  const base = String(projectBaseUrl || '').replace(/\/+$/, '');
  return requestsIn(tree, id).map(({ node, ancestors }) => {
    const d = effectiveDraft(node.draft, ancestors);
    let full;
    try { full = new URL(normalizeUrl(d.url)); } catch { return null; }
    let path = decodeURI(full.pathname);
    let outside = false;
    if (base) {
      try {
        const b = new URL(normalizeUrl(base));
        const bp = b.pathname.replace(/\/+$/, '');
        if (b.origin === full.origin && (path === bp || path.startsWith(`${bp}/`))) path = path.slice(bp.length) || '/';
        else outside = true;
      } catch { /* keep full path */ }
    }
    const parameters = (d.params || []).filter(p => p.enabled !== false && p.key)
      .map(p => ({ name: p.key, in: 'query', required: false, example: p.value ?? '' }));
    let requestBody = null;
    if (['json', 'xml', 'text'].includes(d.bodyType) && d.bodies?.[d.bodyType]) {
      const ct = { json: 'application/json', xml: 'application/xml', text: 'text/plain' }[d.bodyType];
      let example = d.bodies[d.bodyType];
      if (d.bodyType === 'json') { try { example = JSON.parse(example); } catch { /* keep text */ } }
      requestBody = { content: { [ct]: { example } } };
    }
    const folders = ancestors.slice(1).map(a => a.name);
    return {
      method: String(d.method).toUpperCase(), path, summary: node.name,
      description: `Saved in the HitAPI Workbench (${[...ancestors.map(a => a.name), node.name].join(' / ')}).`,
      parameters, request_body: requestBody, tags: folders.length ? [folders[folders.length - 1]] : [],
      ...(outside ? { outside: true, url: full.origin + path } : {}),
    };
  }).filter(Boolean);
}

/** A HitAPI project and its endpoints → a new collection (one folder per tag). */
export function fromProject(project, endpoints) {
  const c = newCollection(project.name || 'HitAPI project');
  c.settings.baseUrl = String(project.base_url || '').replace(/\/+$/, '');
  c.hitapiProjectId = project.id;
  const folders = new Map();
  const parse = (v, fallback) => { if (v == null) return fallback; if (typeof v !== 'string') return v; try { return JSON.parse(v); } catch { return fallback; } };
  for (const ep of endpoints) {
    const tags = parse(ep.tags, []);
    const params = parse(ep.parameters, []).filter(p => p?.in === 'query').map(p => ({ key: p.name, value: String(p.example ?? p.schema?.example ?? ''), enabled: true }));
    const rb = parse(ep.request_body, null);
    const json = rb?.content?.['application/json'];
    const example = json?.example ?? json?.schema?.example;
    const query = params.length ? `?${params.map(p => `${encodeURIComponent(p.key)}=${encodeURIComponent(p.value)}`).join('&')}` : '';
    const draft = {
      method: String(ep.method || 'GET').toUpperCase(), url: `${ep.path || '/'}${query}`, params, headers: [],
      bodyType: example !== undefined ? 'json' : 'json',
      bodies: { json: example !== undefined ? JSON.stringify(example, null, 2) : '', xml: '', text: '', urlencoded: [], form: [], binary: { fileName: '', size: 0, type: '' }, graphql: { query: '', variables: '' } },
      auth: { ...emptyAuth(), type: 'inherit' }, settings: { timeoutSec: 30, followRedirects: true, withCookies: false },
    };
    const req = newRequest(ep.summary || `${draft.method} ${ep.path}`, draft);
    const tag = tags[0];
    if (tag) {
      if (!folders.has(tag)) { const f = newFolder(tag); folders.set(tag, f); c.children.push(f); }
      folders.get(tag).children.push(req);
    } else c.children.push(req);
  }
  return c;
}
