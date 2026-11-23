/**
 * shared/convert/insomnia.js — Insomnia v4 exports → Workbench collections (roadmap feature 10).
 * Workspaces become collections, request groups folders. The base environment becomes
 * collection variables; sub-environments become environments. {{ _.name }} → {{name}}.
 */

import { newCollection, newFolder, newRequest } from '../collections.js';
import { emptyAuth } from '../auth.js';
import { normalizeRows } from '../vars.js';
import { draftFrom } from './draft.js';

export const isInsomnia = (d) => d?._type === 'export' && Array.isArray(d.resources) && String(d.__export_format) === '4';

const fixVars = (s) => String(s ?? '').replace(/\{\{\s*_\.([\w.-]+)\s*\}\}/g, '{{$1}}').replace(/\{%[^%]*%\}/g, '');
const rowsOf = (data) => Object.entries(data || {}).filter(([, v]) => v == null || typeof v !== 'object').map(([key, value]) => ({ key, value: String(value ?? ''), enabled: true, secret: /token|secret|password|key/i.test(key) }));

export function importInsomnia(data) {
  if (!isInsomnia(data)) throw new Error('This is not an Insomnia export (format 4).');
  const res = data.resources;
  const byParent = new Map();
  for (const r of res) { if (!byParent.has(r.parentId)) byParent.set(r.parentId, []); byParent.get(r.parentId).push(r); }
  const notes = new Set();
  const collections = []; const envs = [];
  let requests = 0;
  const requestFrom = (r) => {
    const d = draftFrom({ method: r.method, url: fixVars(r.url), headers: (r.headers || []).map(x => [fixVars(x.name), fixVars(x.value), !x.disabled]), body: fixVars(r.body?.text || ''), contentType: r.body?.mimeType || '' });
    if (r.body?.mimeType === 'application/x-www-form-urlencoded' && r.body.params) { d.bodyType = 'urlencoded'; d.bodies.urlencoded = r.body.params.map(p => ({ key: fixVars(p.name), value: fixVars(p.value), enabled: !p.disabled })); }
    if (r.body?.mimeType === 'multipart/form-data' && r.body.params) { d.bodyType = 'form'; d.bodies.form = r.body.params.map(p => ({ id: `f${Math.random().toString(36).slice(2, 9)}`, key: fixVars(p.name), value: p.type === 'file' ? '' : fixVars(p.value), kind: p.type === 'file' ? 'file' : 'text', fileName: p.fileName ? String(p.fileName).split(/[\\/]/).pop() : '', enabled: !p.disabled })); }
    if (r.body?.mimeType === 'application/graphql' || (r.body?.mimeType === 'application/json' && /"query"\s*:/.test(r.body?.text || '') && r.body?.text?.includes('variables'))) {
      try { const g = JSON.parse(r.body.text); if (g.query) { d.bodyType = 'graphql'; d.bodies.graphql = { query: fixVars(g.query), variables: g.variables ? JSON.stringify(g.variables, null, 2) : '' }; } } catch { /* keep raw */ }
    }
    const a = r.authentication || {};
    const auth = emptyAuth();
    if (a.type === 'bearer') { auth.type = 'bearer'; auth.bearer = { token: fixVars(a.token), prefix: a.prefix || 'Bearer' }; }
    else if (a.type === 'basic') { auth.type = 'basic'; auth.basic = { username: fixVars(a.username), password: fixVars(a.password) }; }
    else if (a.type === 'apikey') { auth.type = 'apikey'; auth.apikey = { key: a.key || 'X-API-Key', value: fixVars(a.value), in: a.addTo === 'queryParams' ? 'query' : 'header' }; }
    else if (a.type && a.type !== 'none') { notes.add(`"${a.type}" auth isn't supported and was left out.`); auth.type = 'inherit'; }
    else auth.type = a.type === 'none' ? 'none' : 'inherit';
    d.auth = auth;
    requests++;
    return newRequest(r.name || `${d.method} ${d.url}`, d);
  };
  const children = (parentId) => (byParent.get(parentId) || []).sort((a, b) => (a.metaSortKey ?? 0) - (b.metaSortKey ?? 0)).flatMap((r) => {
    if (r._type === 'request') return [requestFrom(r)];
    if (r._type === 'request_group') { const f = newFolder(r.name || 'Folder'); f.children = children(r._id); return [f]; }
    if (r._type === 'grpc_request' || r._type === 'websocket_request') { notes.add('gRPC and WebSocket requests are not supported and were skipped.'); }
    return [];
  });
  for (const w of res.filter(r => r._type === 'workspace')) {
    const c = newCollection(w.name || 'Insomnia workspace');
    c.children = children(w._id);
    const baseEnv = (byParent.get(w._id) || []).find(r => r._type === 'environment');
    if (baseEnv) {
      c.settings.variables = normalizeRows(rowsOf(baseEnv.data));
      for (const sub of byParent.get(baseEnv._id) || []) if (sub._type === 'environment') envs.push({ name: sub.name || 'Environment', vars: normalizeRows(rowsOf(sub.data)) });
    }
    collections.push(c);
  }
  if (!requests) throw new Error('The Insomnia export has no requests.');
  if (res.some(r => r._type === 'request' && /\{%/.test(JSON.stringify(r)))) notes.add('Insomnia template tags ({% … %}) were removed; set those values yourself.');
  return { collections, envs, notes: [...notes], stats: { requests } };
}
