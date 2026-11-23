/**
 * shared/body.js — request bodies for the Workbench (roadmap feature 2).
 *
 *   draft.bodyType   'none' | 'json' | 'xml' | 'text' | 'form' | 'urlencoded' | 'binary' | 'graphql'
 *   draft.bodies     what was typed for every type, so switching type loses nothing:
 *     { json, xml, text: string,
 *       urlencoded: [{ key, value, enabled }],
 *       form: [{ id, key, value, kind: 'text'|'file', fileName, enabled }],
 *       binary: { fileName, size, type },
 *       graphql: { query, variables } }
 *
 * Files are never saved (chrome.storage can't hold them): the page keeps the
 * File objects in memory and the draft only remembers the file name.
 */

import { parseQuery } from './http.js';

export const BODY_TYPES = [
  { id: 'none', label: 'None' },
  { id: 'json', label: 'JSON' },
  { id: 'xml', label: 'XML' },
  { id: 'text', label: 'Text' },
  { id: 'form', label: 'Form data' },
  { id: 'urlencoded', label: 'URL-encoded' },
  { id: 'binary', label: 'Binary file' },
  { id: 'graphql', label: 'GraphQL' },
];

/** Content-Type sent for each type when you don't set one yourself. */
export const AUTO_CONTENT_TYPE = {
  json: 'application/json',
  xml: 'application/xml',
  text: 'text/plain',
  urlencoded: 'application/x-www-form-urlencoded',
  graphql: 'application/json',
  form: 'multipart/form-data', // the browser adds the boundary itself
};

let seq = 0;
export const rowId = () => `f${Date.now().toString(36)}${(seq++).toString(36)}`;

export function emptyBodies() {
  return {
    json: '', xml: '', text: '',
    urlencoded: [],
    form: [],
    binary: { fileName: '', size: 0, type: '' },
    graphql: { query: '', variables: '' },
  };
}

/** Fill in anything missing in a saved draft's bodies. */
export function normalizeBodies(b) {
  const base = emptyBodies();
  const out = { ...base, ...(b || {}) };
  for (const k of ['json', 'xml', 'text']) out[k] = typeof out[k] === 'string' ? out[k] : '';
  out.urlencoded = Array.isArray(out.urlencoded) ? out.urlencoded : [];
  out.form = Array.isArray(out.form) ? out.form.map(r => ({ id: r.id || rowId(), kind: 'text', enabled: true, ...r })) : [];
  out.binary = { ...base.binary, ...(out.binary || {}) };
  out.graphql = { ...base.graphql, ...(out.graphql || {}) };
  return out;
}

const looksJson = (s) => {
  const t = String(s || '').trim();
  if (!/^[[{]/.test(t)) return false;
  try { JSON.parse(t); return true; } catch { return false; }
};

/**
 * A raw body string (captured request, cURL, an older draft) → bodyType + bodies.
 * @param {string} body
 * @param {string} contentType  the request's Content-Type header, if any
 */
export function detectBody(body, contentType = '') {
  const bodies = emptyBodies();
  const text = String(body ?? '');
  const ct = String(contentType || '').toLowerCase();
  if (!text) return { bodyType: 'json', bodies }; // nothing yet: ready for pasted JSON
  if (/json/.test(ct) || (!ct && looksJson(text)) || (/text\/plain/.test(ct) && looksJson(text))) {
    bodies.json = text;
    return { bodyType: 'json', bodies };
  }
  if (/xml/.test(ct) || (!ct && /^\s*<\?xml|^\s*<[a-z]/i.test(text))) { bodies.xml = text; return { bodyType: 'xml', bodies }; }
  if (/x-www-form-urlencoded/.test(ct)) { bodies.urlencoded = parseQuery(text); return { bodyType: 'urlencoded', bodies }; }
  bodies.text = text;
  return { bodyType: 'text', bodies };
}

/** True when the selected body has something to send. */
export function hasBodyContent(draft, files = {}) {
  const b = draft.bodies;
  switch (draft.bodyType) {
    case 'json': case 'xml': case 'text': return !!b[draft.bodyType];
    case 'urlencoded': return b.urlencoded.some(r => r.enabled !== false && r.key);
    case 'form': return b.form.some(r => r.enabled !== false && r.key);
    case 'binary': return !!(files.binary || b.binary.fileName);
    case 'graphql': return !!b.graphql.query.trim();
    default: return false;
  }
}

// ── JSON ────────────────────────────────────────────────────────────────────

/** {{variables}} outside strings aren't JSON; swap them for a same-length number to check the rest. */
const maskVars = (s) => s.replace(/\{\{[^}\n]*\}\}/g, (m) => '0'.padEnd(m.length, ' '));

function lineCol(text, pos) {
  const before = text.slice(0, Math.max(0, Math.min(pos, text.length)));
  const lines = before.split('\n');
  return { line: lines.length, col: lines[lines.length - 1].length + 1 };
}

/**
 * @returns {{ ok: true } | { ok: false, message: string, line: number, col: number, pos: number }}
 */
export function checkJson(text) {
  if (!String(text).trim()) return { ok: true, empty: true };
  try { JSON.parse(maskVars(text)); return { ok: true }; } catch (e) {
    const msg = String(e.message || 'Invalid JSON');
    const lc = /line (\d+) column (\d+)/.exec(msg);
    const at = /position (\d+)/.exec(msg);
    let pos = at ? Number(at[1]) : text.length;
    let line; let col;
    if (lc) { line = Number(lc[1]); col = Number(lc[2]); }
    else ({ line, col } = lineCol(text, pos));
    if (lc && !at) {
      const lines = text.split('\n');
      pos = lines.slice(0, line - 1).reduce((n, l) => n + l.length + 1, 0) + col - 1;
    }
    const reason = msg
      .replace(/^JSON\.parse: /, '')
      .replace(/\s*\(line \d+ column \d+\)/, '')
      .replace(/ in JSON at position \d+/, '')
      .replace(/, ".*" is not valid JSON$/s, '')
      .replace(/^Unexpected end of JSON input$/, 'The JSON ends too early (a missing } ] or ")');
    return { ok: false, message: reason, line, col, pos };
  }
}

export function formatJson(text, indent = 2) {
  return JSON.stringify(JSON.parse(text), null, indent);
}

export function minifyJson(text) {
  return JSON.stringify(JSON.parse(text));
}

// ── XML ─────────────────────────────────────────────────────────────────────

/** Indent XML one tag per line; a tag that only holds text stays on one line. */
export function formatXml(text) {
  const tokens = String(text).replace(/>\s+</g, '><').trim().split(/(<[^>]+>)/).filter(t => t.trim() !== '');
  const out = [];
  let depth = 0;
  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i];
    const isClose = t.startsWith('</');
    const isOpen = t.startsWith('<') && !isClose && !t.endsWith('/>') && !t.startsWith('<?') && !t.startsWith('<!');
    if (isClose) depth = Math.max(0, depth - 1);
    const pad = '  '.repeat(depth);
    // <tag>text</tag> on one line
    if (isOpen && tokens[i + 1] !== undefined && !tokens[i + 1].startsWith('<') && tokens[i + 2]?.startsWith('</')) {
      out.push(pad + t + tokens[i + 1].trim() + tokens[i + 2]);
      i += 2;
      continue;
    }
    out.push(pad + (t.startsWith('<') ? t : t.trim()));
    if (isOpen) depth++;
  }
  return out.join('\n');
}

// ── Building what is sent ───────────────────────────────────────────────────

/**
 * The body to pass to fetch() and the Content-Type to send with it.
 * @param {object} draft
 * @param {{ binary?: File, form?: Map<string, File> }} files  in-memory files
 * @param {boolean} manualContentType  the user set a Content-Type header
 * @returns {{ body, contentType: string|null, problems: string[], warnings: string[], dropContentType?: boolean }}
 */
export function buildBody(draft, files = {}, manualContentType = '') {
  const problems = [];
  const warnings = [];
  const b = draft.bodies;
  const type = draft.bodyType;
  let body;
  let contentType = AUTO_CONTENT_TYPE[type] || null;
  let dropContentType = false;

  switch (type) {
    case 'json': {
      body = b.json;
      if (body.trim()) {
        const c = checkJson(body);
        if (!c.ok) warnings.push(`The body is not valid JSON (line ${c.line}, column ${c.col}: ${c.message}). It was sent exactly as written.`);
      }
      break;
    }
    case 'xml': case 'text': body = b[type]; break;
    case 'urlencoded': {
      const p = new URLSearchParams();
      for (const r of b.urlencoded) if (r.enabled !== false && r.key) p.append(r.key, r.value ?? '');
      body = p.toString();
      break;
    }
    case 'form': {
      const fd = new FormData();
      for (const r of b.form) {
        if (r.enabled === false || !r.key) continue;
        if (r.kind === 'file') {
          const f = files.form?.get(r.id);
          if (!f) { problems.push(`Pick the file for form field "${r.key}" again (files are not saved between sessions).`); continue; }
          fd.append(r.key, f, f.name);
        } else fd.append(r.key, r.value ?? '');
      }
      body = fd;
      // The browser must write multipart/form-data itself (with its boundary)
      contentType = null;
      if (manualContentType && /multipart\/form-data/i.test(manualContentType) && !/boundary=/i.test(manualContentType)) {
        dropContentType = true;
        warnings.push('Your Content-Type: multipart/form-data header was left out so the browser could add the boundary it needs.');
      }
      break;
    }
    case 'binary': {
      const f = files.binary;
      if (!f) { if (b.binary.fileName) problems.push(`Pick "${b.binary.fileName}" again (files are not saved between sessions).`); body = undefined; break; }
      body = f;
      contentType = f.type || 'application/octet-stream';
      break;
    }
    case 'graphql': {
      const payload = { query: b.graphql.query };
      const vars = b.graphql.variables.trim();
      if (vars) {
        try { payload.variables = JSON.parse(vars); } catch (e) { problems.push(`GraphQL variables are not valid JSON: ${checkJson(vars).message}`); }
      }
      const op = /^\s*(?:query|mutation|subscription)\s+([A-Za-z_]\w*)/m.exec(b.graphql.query);
      if (op) payload.operationName = op[1];
      body = JSON.stringify(payload);
      break;
    }
    default: body = undefined; contentType = null;
  }
  if (body === '' ) body = undefined;
  return { body, contentType, problems, warnings, dropContentType };
}

/** cURL arguments for the body (Copy as cURL). */
export function curlBodyArgs(draft, files = {}) {
  const b = draft.bodies;
  switch (draft.bodyType) {
    case 'json': case 'xml': case 'text': return b[draft.bodyType] ? [['--data-raw', b[draft.bodyType]]] : [];
    case 'urlencoded': return b.urlencoded.filter(r => r.enabled !== false && r.key).map(r => ['--data-urlencode', `${r.key}=${r.value ?? ''}`]);
    case 'form': return b.form.filter(r => r.enabled !== false && r.key).map(r =>
      ['-F', r.kind === 'file' ? `${r.key}=@${files.form?.get(r.id)?.name || r.fileName || 'file'}` : `${r.key}=${r.value ?? ''}`]);
    case 'binary': return (files.binary || b.binary.fileName) ? [['--data-binary', `@${files.binary?.name || b.binary.fileName}`]] : [];
    case 'graphql': { const built = buildBody(draft, files); return built.body ? [['--data-raw', built.body]] : []; }
    default: return [];
  }
}
