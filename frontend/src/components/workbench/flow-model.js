/**
 * Web Workbench (W10) — the flow builder's logic, no React.
 *
 * A flow IS a scenario: steps run in the order of scenario.steps (a straight chain).
 * The canvas only adds scenario.flow = { view: 'canvas'|'list', pos: { [stepId]: { x, y } } }.
 * Passing data from one step to another is saved the way scenarios already work, so the
 * runner, the CLI, cloud schedules and sync need no change:
 *   - a "Set vars" rule on the step that gives the value (draft.extract), and
 *   - {{name}} where the value is needed (path, query, header, body, Bearer token).
 */

import { varsIn, DYNAMIC } from '@hitapi/shared/vars.js';
import { fromProject } from '@hitapi/shared/collections.js';
import { newTest } from '@hitapi/shared/assert.js';

export const NODE_W = 300;
export const GAP = 130;   // between cards side by side (room for the line's label)
export const NODE_H = 196;
const GAP_X = GAP;
const GAP_Y = 70;

// ── layout ──────────────────────────────────────────────────────────────────

/** Where a step sits on the canvas: saved position, or a left-to-right grid by order. */
export function autoPos(i, perRow = 3) {
  return { x: 40 + (i % perRow) * (NODE_W + GAP_X), y: 70 + Math.floor(i / perRow) * (NODE_H + GAP_Y) };
}
export function positions(scenario, perRow = 3) {
  const saved = scenario.flow?.pos || {};
  const out = {};
  scenario.steps.forEach((st, i) => { out[st.id] = saved[st.id] && Number.isFinite(saved[st.id].x) ? saved[st.id] : autoPos(i, perRow); });
  return out;
}
/** Does a card at p overlap any of the others? */
export function overlaps(p, others) {
  return others.some(o => Math.abs(o.x - p.x) < NODE_W + 20 && Math.abs(o.y - p.y) < NODE_H + 30);
}
/** The first free grid slot (reading order), preferring the one given. */
export function freeSpot(others, perRow = 3, prefer = null) {
  if (prefer && !overlaps(prefer, others)) return prefer;
  for (let i = 0; i < 400; i++) { const p = autoPos(i, perRow); if (!overlaps(p, others)) return p; }
  return autoPos(others.length, perRow);
}
/** A free spot below/right of everything, for a step added without a drop point. */
export function nextFreePos(scenario) {
  const pos = Object.values(positions(scenario));
  if (!pos.length) return autoPos(0);
  return autoPos(scenario.steps.length);
}

// ── strings in a draft ──────────────────────────────────────────────────────

/** Every string field of a draft that is sent (not tests, Set vars or settings). */
function textsOf(d) {
  const out = [d.url];
  for (const r of d.params || []) if (r.enabled !== false) out.push(r.key, r.value);
  for (const r of d.headers || []) if (r.enabled !== false) out.push(r.key, r.value);
  const b = d.bodies || {};
  if (d.bodyType === 'json') out.push(b.json);
  else if (d.bodyType === 'xml') out.push(b.xml);
  else if (d.bodyType === 'text') out.push(b.text);
  else if (d.bodyType === 'urlencoded' || d.bodyType === 'form') for (const r of b[d.bodyType] || []) if (r.enabled !== false) out.push(r.key, r.value);
  else if (d.bodyType === 'graphql') out.push(b.graphql?.query, b.graphql?.variables);
  const a = d.auth || {};
  if (a.type === 'bearer') out.push(a.bearer?.token);
  if (a.type === 'basic') out.push(a.basic?.username, a.basic?.password);
  if (a.type === 'apikey') out.push(a.apikey?.value);
  if (a.type === 'custom') out.push(a.custom?.value);
  return out.filter(x => typeof x === 'string');
}

/** Replace text everywhere it is sent (URL, params, headers, body, auth). Mutates the draft. */
export function replaceInDraft(d, from, to) {
  if (!from) return d;
  const rep = (s) => (typeof s === 'string' ? s.split(from).join(to) : s);
  d.url = rep(d.url);
  for (const r of d.params || []) { r.key = rep(r.key); r.value = rep(r.value); }
  for (const r of d.headers || []) r.value = rep(r.value);
  const b = d.bodies || {};
  b.json = rep(b.json); b.xml = rep(b.xml); b.text = rep(b.text);
  for (const k of ['urlencoded', 'form']) for (const r of b[k] || []) r.value = rep(r.value);
  if (b.graphql) { b.graphql.query = rep(b.graphql.query); b.graphql.variables = rep(b.graphql.variables); }
  const a = d.auth || {};
  if (a.bearer) a.bearer.token = rep(a.bearer.token);
  if (a.basic) { a.basic.username = rep(a.basic.username); a.basic.password = rep(a.basic.password); }
  if (a.apikey) a.apikey.value = rep(a.apikey.value);
  if (a.custom) a.custom.value = rep(a.custom.value);
  return d;
}

/** Path placeholders that are not {{variables}}: /users/{id} and /users/:id */
export function pathSlots(url) {
  const path = String(url || '').replace(/\{\{[^{}]*\}\}/g, '').replace(/^[a-z][\w+.-]*:\/\/[^/]+/i, '').split(/[?#]/)[0];
  const out = [];
  for (const m of path.matchAll(/\{([A-Za-z_][\w-]*)\}/g)) out.push({ name: m[1], token: `{${m[1]}}` });
  for (const m of path.matchAll(/(?:^|\/):([A-Za-z_][\w-]*)/g)) out.push({ name: m[1], token: `:${m[1]}` });
  return out;
}

// ── a step's needs and gives ────────────────────────────────────────────────

/** Variables set by Set vars rules of the steps before index i: name → { stepId, stepIndex, rule }. */
export function producedBefore(scenario, i, reqOf) {
  const out = new Map();
  scenario.steps.slice(0, i).forEach((st, j) => {
    if (!st.enabled) return;
    const req = reqOf(st);
    for (const r of req?.draft?.extract || []) if (r.enabled !== false && String(r.name || '').trim()) out.set(r.name.trim(), { stepId: st.id, stepIndex: j, rule: r });
  });
  return out;
}

/**
 * What a step needs before it can be sent, and whether each need is filled.
 * @param {object} o
 * @param {Map} o.produced   from producedBefore()
 * @param {Set|Map} o.scope  variable names from globals / collection / environment
 * @param {string[]} o.columns  data-row column names
 * @returns {Array<{ key, where, name, token, label, filled: null|{ by, stepId?, path? } }>}
 */
export function needsOf(step, req, { produced = new Map(), scope = new Set(), columns = [] } = {}) {
  if (!req?.draft) return [];
  const d = req.draft;
  const out = [];
  const seen = new Set();
  for (const s of pathSlots(d.url)) {
    if (seen.has(`p:${s.name}`)) continue; seen.add(`p:${s.name}`);
    out.push({ key: `p:${s.name}`, where: 'path', name: s.name, token: s.token, label: `${s.name}`, filled: null });
  }
  const names = new Set();
  for (const t of textsOf(d)) for (const n of varsIn(t)) names.add(n.trim());
  for (const n of names) {
    if (DYNAMIC[n]) continue;
    const p = produced.get(n);
    const filled = p ? { by: 'step', stepId: p.stepId, path: p.rule.path, from: p.rule.from || 'json' }
      : columns.includes(n) ? { by: 'data' }
      : (scope.has ? scope.has(n) : false) ? { by: 'environment' } : null;
    out.push({ key: `v:${n}`, where: 'var', name: n, token: `{{${n}}}`, label: n, filled });
  }
  // project endpoints: required header / query parameters from the Swagger spec
  for (const p of step.spec?.params || []) {
    if (!p.required || (p.in !== 'header' && p.in !== 'query')) continue;
    const rows = p.in === 'header' ? d.headers : d.params;
    const row = (rows || []).find(r => String(r.key || '').toLowerCase() === p.name.toLowerCase() && r.enabled !== false);
    if (row && String(row.value || '').trim() && !varsIn(row.value).length) continue;          // typed in
    if (row && varsIn(row.value).length) continue;                                           // a {{var}}: listed above
    out.push({ key: `${p.in}:${p.name}`, where: p.in, name: p.name, token: null, label: p.name, filled: null });
  }
  return out;
}

const SKIP_KEYS = 60;
/** Fields of a JSON value as paths: [{ path: '$.data.token', label: 'data.token', sample }] */
export function fieldsOf(value, { max = SKIP_KEYS, depth = 4 } = {}) {
  const out = [];
  const walk = (v, path, label, d) => {
    if (out.length >= max) return;
    if (Array.isArray(v)) {
      if (label) out.push({ path, label, sample: `${v.length} item${v.length === 1 ? '' : 's'}`, kind: 'array' });
      if (v.length && d < depth) walk(v[0], `${path}[0]`, `${label}[0]`, d + 1);
      return;
    }
    if (v && typeof v === 'object') {
      for (const k of Object.keys(v)) {
        const safe = /^[A-Za-z_$][\w$-]*$/.test(k);
        const p = safe ? `${path}.${k}` : `${path}['${k.replace(/'/g, "\\'")}']`;
        const l = label ? (safe ? `${label}.${k}` : `${label}['${k}']`) : k;
        if (v[k] && typeof v[k] === 'object' && d < depth) { if (!Array.isArray(v[k])) out.push({ path: p, label: l, sample: '{…}', kind: 'object' }); walk(v[k], p, l, d + 1); }
        else out.push({ path: p, label: l, sample: v[k] && typeof v[k] === 'object' ? '[…]' : String(v[k]).slice(0, 40), kind: typeof v[k] });
        if (out.length >= max) return;
      }
      return;
    }
    if (!label) out.push({ path: '$', label: '(whole body)', sample: String(v).slice(0, 40), kind: typeof v });
  };
  walk(value, '$', '', 0);
  return out;
}

/** A JSON-schema-ish object → an example value (for fields before the first run). */
export function exampleOf(schema, d = 0) {
  if (!schema || typeof schema !== 'object' || d > 5) return undefined;
  if (schema.example !== undefined) return schema.example;
  if (schema.allOf) return Object.assign({}, ...schema.allOf.map(s => exampleOf(s, d + 1) || {}));
  const t = schema.type || (schema.properties ? 'object' : schema.items ? 'array' : undefined);
  if (t === 'object') { const o = {}; for (const [k, v] of Object.entries(schema.properties || {})) o[k] = exampleOf(v, d + 1) ?? ''; return o; }
  if (t === 'array') return [exampleOf(schema.items, d + 1) ?? ''];
  if (t === 'integer' || t === 'number') return 0;
  if (t === 'boolean') return true;
  return '';
}

/**
 * What a step gives to later steps.
 * @returns {{ source: 'run'|'spec'|null, fields: Array, headers: Array<string>, status: number|null }}
 */
export function givesOf(step, lastResponse) {
  if (lastResponse && !lastResponse.error && typeof lastResponse.text === 'string') {
    let json; try { json = JSON.parse(lastResponse.text); } catch { json = undefined; }
    const headers = (lastResponse.rawHeaders || lastResponse.headers || []).map(h => (Array.isArray(h) ? h[0] : h?.key)).filter(Boolean);
    return { source: 'run', fields: json === undefined ? [] : fieldsOf(json), headers, status: lastResponse.status ?? null };
  }
  const ex = step.spec?.response;
  if (ex !== undefined) return { source: 'spec', fields: fieldsOf(ex), headers: [], status: null };
  return { source: null, fields: [], headers: [], status: null };
}

/** Last result of each step in a report: stepId → result (last iteration/attempt wins). */
export function lastResults(report) {
  const m = new Map();
  for (const r of report?.results || []) m.set(r.stepId, r);
  return m;
}

// ── connecting ──────────────────────────────────────────────────────────────

/** A variable name from a path: $.data.user.id → userId, $.token → token, $.items[0].id → itemId */
export function suggestName(path, taken = new Set()) {
  const keys = String(path || '').replace(/\[\d+\]/g, '').replace(/^\$\.?/, '').split('.').filter(Boolean).map(k => k.replace(/[^\w]/g, ''));
  let base = keys[keys.length - 1] || 'value';
  if (/^(id|uuid|key|code)$/i.test(base) && keys.length > 1) {
    const parent = keys[keys.length - 2].replace(/s$/, '').replace(/^data$/, '');
    if (parent) base = parent + base[0].toUpperCase() + base.slice(1).toLowerCase();
  }
  base = base.replace(/^[^A-Za-z_]+/, '') || 'value';
  if (!taken.has(base)) return base;
  for (let i = 2; ; i++) if (!taken.has(`${base}${i}`)) return `${base}${i}`;
}

/**
 * Add (or reuse) a Set vars rule on the giving draft. Mutates it.
 * @returns {string} the variable name used
 */
export function ensureRule(draft, { from = 'json', path, name }) {
  draft.extract = Array.isArray(draft.extract) ? draft.extract : [];
  const same = draft.extract.find(r => r.enabled !== false && (r.from || 'json') === from && String(r.path || '') === String(path || '') && r.name);
  if (same && (!name || same.name === name)) return same.name;
  const existing = draft.extract.find(r => r.name === name);
  if (existing) { Object.assign(existing, { from, path, enabled: true }); return name; }
  draft.extract.push({ name, from, path, enabled: true });
  return name;
}

/**
 * Write a value into the needing draft for a need. Mutates it.
 * value: the text to put there ('{{token}}', a fixed value, '{{$uuid}}').
 */
export function fillNeed(draft, need, value) {
  if (need.where === 'path' || need.where === 'var') { replaceInDraft(draft, need.token, value); return; }
  const key = need.where === 'header' ? 'headers' : 'params';
  draft[key] = Array.isArray(draft[key]) ? draft[key] : [];
  const row = draft[key].find(r => String(r.key || '').toLowerCase() === need.name.toLowerCase());
  if (row) { row.value = value; row.enabled = true; } else draft[key].push({ key: need.name, value, enabled: true });
  if (key === 'params') syncQuery(draft);
}

/** Put a value somewhere new: Bearer token, a header, a query parameter or a top-level JSON body field. Mutates. */
export function passInto(draft, target, value) {
  if (target.kind === 'bearer') {
    draft.auth = { ...(draft.auth || {}), type: 'bearer', bearer: { prefix: draft.auth?.bearer?.prefix || 'Bearer', token: value } };
    return;
  }
  if (target.kind === 'header' || target.kind === 'query') { fillNeed(draft, { where: target.kind, name: target.name }, value); return; }
  if (target.kind === 'body') {
    let obj = {};
    try { obj = draft.bodies?.json?.trim() ? JSON.parse(draft.bodies.json) : {}; } catch { throw new Error('The JSON body has a mistake in it; fix it first, then pass the value.'); }
    if (!obj || typeof obj !== 'object' || Array.isArray(obj)) throw new Error('The JSON body is not an object.');
    obj[target.name] = value;
    draft.bodyType = 'json';
    draft.bodies = { ...(draft.bodies || {}), json: JSON.stringify(obj, null, 2) };
  }
}

/** Keep the URL's query string in step with draft.params (enabled rows). */
function syncQuery(d) {
  const [base, hash] = String(d.url || '').split('#');
  const path = base.split('?')[0];
  const rows = (d.params || []).filter(r => r.enabled !== false && String(r.key || '').trim());
  const q = rows.map(r => `${encodeKeep(r.key)}=${encodeKeep(r.value ?? '')}`).join('&');
  d.url = `${path}${q ? `?${q}` : ''}${hash ? `#${hash}` : ''}`;
}
const encodeKeep = (s) => String(s).split(/(\{\{[^{}]*\}\})/).map((p, i) => (i % 2 ? p : encodeURIComponent(p))).join('');

// ── data links shown on the canvas ──────────────────────────────────────────

/**
 * Lines between steps: the chain (each step → the next) and where data goes.
 * @returns {Array<{ from, to, chain: boolean, names: string[] }>}
 */
export function linksOf(scenario, reqOf) {
  const steps = scenario.steps;
  const out = [];
  const byPair = new Map();
  for (let i = 1; i < steps.length; i++) {
    const l = { from: steps[i - 1].id, to: steps[i].id, chain: true, names: [] };
    out.push(l); byPair.set(`${l.from}>${l.to}`, l);
  }
  steps.forEach((st, i) => {
    const req = reqOf(st);
    if (!req) return;
    const produced = producedBefore(scenario, i, reqOf);
    const names = new Set();
    for (const t of textsOf(req.draft)) for (const n of varsIn(t)) names.add(n.trim());
    for (const n of names) {
      const p = produced.get(n);
      if (!p) continue;
      const k = `${p.stepId}>${st.id}`;
      let l = byPair.get(k);
      if (!l) { l = { from: p.stepId, to: st.id, chain: false, names: [] }; out.push(l); byPair.set(k, l); }
      l.names.push(n);
    }
  });
  return out;
}

/** Inputs still missing in the whole flow: [{ stepId, need }] */
export function missingInputs(scenario, reqOf, { scope, columns }) {
  const out = [];
  scenario.steps.forEach((st, i) => {
    if (!st.enabled) return;
    const req = reqOf(st);
    for (const n of needsOf(st, req, { produced: producedBefore(scenario, i, reqOf), scope: scope(req), columns })) if (!n.filled) out.push({ stepId: st.id, need: n });
  });
  return out;
}

// ── project endpoints in the palette ────────────────────────────────────────

const parse = (v, fallback) => { if (v == null) return fallback; if (typeof v !== 'string') return v; try { return JSON.parse(v); } catch { return fallback; } };

/** A HitAPI project endpoint → a step's own copy of the request, with what the spec says it needs and gives. */
export function endpointStep(project, ep) {
  const req = fromProject(project, [ep]).children.flatMap(c => (c.type === 'folder' ? c.children : [c]))[0];
  const draft = structuredClone(req.draft);
  const base = String(project.base_url || '').replace(/\/+$/, '');
  if (base && !/^[a-z][\w+.-]*:\/\//i.test(draft.url)) draft.url = `${base}${draft.url.startsWith('/') ? '' : '/'}${draft.url}`;
  if (draft.auth?.type === 'inherit') draft.auth = { ...draft.auth, type: 'none' };
  draft.extract = []; draft.tests = [newTest('status', { op: 'in_range', expected: '2xx' })];
  const params = parse(ep.parameters, []).filter(p => p?.name && p.in).map(p => ({ name: p.name, in: p.in, required: !!p.required || p.in === 'path' }));
  const responses = parse(ep.responses, {}) || {};
  const ok = Object.keys(responses).find(c => /^2\d\d$/.test(c));
  const json = ok && responses[ok]?.content?.['application/json'];
  const response = json ? (json.example ?? exampleOf(json.schema)) : undefined;
  return { name: req.name, draft, spec: { endpointId: ep.id, projectId: project.id, method: draft.method, path: ep.path, params, ...(response !== undefined ? { response } : {}) } };
}
