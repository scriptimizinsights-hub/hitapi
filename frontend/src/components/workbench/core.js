/**
 * Web Workbench — the request model and what gets sent (no React here).
 *
 * The draft has the same shape as the HitAPI extension's Workbench draft, and
 * the logic comes from the extension's shared code (@hitapi/shared), so a
 * request behaves the same on the website, in the extension and in the CLI.
 */

import { normalizeUrl, urlProblem, methodProblem, hasNoBody, headerKind, isValidHeaderName } from '@hitapi/shared/http.js';
import { emptyBodies, normalizeBodies, detectBody, buildBody, hasBodyContent, AUTO_CONTENT_TYPE, curlBodyArgs } from '@hitapi/shared/body.js';
import { emptyAuth, normalizeAuth, authParts, addQuery } from '@hitapi/shared/auth.js';
import { toCurl } from '@hitapi/shared/curl.js';

export const DRAFT_KEY = 'hitapi:web:draft';
export const RECENT_KEY = 'hitapi:web:recent';          // W1's Recent list, moved into History (W2) once
export const OLD_HISTORY_KEY = 'apiforge.playground.history';
export const DEFAULT_SETTINGS = Object.freeze({ timeoutSec: 30, followRedirects: true, withCookies: false });

export function emptyDraft() {
  return { method: 'GET', url: '', params: [], headers: [], bodyType: 'json', bodies: emptyBodies(), auth: emptyAuth(), settings: { ...DEFAULT_SETTINGS }, extract: [], tests: [] };
}

/** Fill in anything missing (older drafts, imported requests). Same rules as the extension. */
export function normalizeDraft(d) {
  const draft = { ...emptyDraft(), ...(d || {}) };
  draft.method = String(draft.method || 'GET').trim() || 'GET';
  draft.params = Array.isArray(draft.params) ? draft.params : [];
  draft.headers = Array.isArray(draft.headers) ? draft.headers : [];
  draft.settings = { ...DEFAULT_SETTINGS, ...(draft.settings || {}) };
  draft.extract = Array.isArray(draft.extract) ? draft.extract : [];
  draft.tests = Array.isArray(draft.tests) ? draft.tests : [];
  if (!d?.bodies) {
    const ct = draft.headers.find(r => r.enabled !== false && String(r.key).trim().toLowerCase() === 'content-type')?.value || '';
    Object.assign(draft, detectBody(typeof draft.body === 'string' ? draft.body : '', ct));
  } else { draft.bodies = normalizeBodies(draft.bodies); draft.bodyType = draft.bodyType || 'json'; }
  delete draft.body;
  draft.auth = normalizeAuth(draft.auth);
  return draft;
}

const ls = () => { try { return typeof window !== 'undefined' ? window.localStorage : null; } catch { return null; } };

export function loadDraft() {
  try { const v = ls()?.getItem(DRAFT_KEY); return v ? normalizeDraft(JSON.parse(v)) : null; } catch { return null; }
}
export function saveDraft(d) {
  try { ls()?.setItem(DRAFT_KEY, JSON.stringify(d)); } catch { /* storage full or blocked */ }
}

// ── send modes ──────────────────────────────────────────────────────────────

export const MODES = [
  { id: 'cloud', label: 'HitAPI cloud', short: 'Cloud', hint: 'Sent from HitAPI\'s servers: no CORS problems. Public URLs only, 15 s, 1 MB request / 2 MB response.' },
  { id: 'browser', label: 'This browser', short: 'Browser', hint: 'Sent from your browser: reaches localhost, but the API must allow CORS. Browsers drop Cookie, Origin and User-Agent.' },
  { id: 'extension', label: 'HitAPI extension', short: 'Extension', hint: 'Sent by the HitAPI Chrome extension: localhost, no CORS limits, any header.' },
];

/** localhost, *.local, private IPs: the cloud can't reach them. */
export function isLocalUrl(url) {
  let host = '';
  try { host = new URL(normalizeUrl(url)).hostname.toLowerCase().replace(/^\[|\]$/g, ''); } catch { return false; }
  if (host === 'localhost' || host.endsWith('.localhost') || host.endsWith('.local') || host.endsWith('.internal') || host === '0.0.0.0' || host === '::1') return true;
  const m = /^(\d+)\.(\d+)\.\d+\.\d+$/.exec(host);
  if (!m) return false;
  const [a, b] = [Number(m[1]), Number(m[2])];
  return a === 10 || a === 127 || (a === 192 && b === 168) || (a === 172 && b >= 16 && b <= 31) || (a === 169 && b === 254) || (a === 100 && b >= 64 && b <= 127);
}

/** The mode to use when the user hasn't picked one. */
export function autoMode(url, ext) {
  if (ext?.allowed) return 'extension';
  return isLocalUrl(url) ? 'browser' : 'cloud';
}

/**
 * The draft → what will be sent, or the problems that stop it.
 * mode decides which headers can be sent (browsers refuse some).
 * @returns {{ problems, warnings, request: { method, url, headers: [[k,v]], body, contentType } }}
 */
export function prepare(draft, files = {}, { oauthToken = null, mode = 'cloud' } = {}) {
  const problems = [];
  const warnings = [];
  const method = String(draft.method || 'GET').trim();
  const mp = methodProblem(method); if (mp) problems.push(mp);
  const up = urlProblem(draft.url); if (up) problems.push(up);
  // the extension handles OAuth itself; here the token comes from the page
  const auth = draft.auth?.type === 'oauth2' && mode === 'extension' ? { headers: [], query: [], problems: [] } : authParts(draft.auth, { oauthToken });
  problems.push(...auth.problems);
  let rows = draft.headers.filter(r => r.enabled !== false && String(r.key || '').trim());
  for (const ah of auth.headers) {
    const before = rows.length;
    rows = rows.filter(r => String(r.key).trim().toLowerCase() !== ah.key.toLowerCase());
    if (rows.length !== before) warnings.push(`Your ${ah.key} header (Headers tab) was replaced by the one from the Auth tab.`);
  }
  rows = [...rows, ...auth.headers];
  const headers = [];
  for (const r of rows) {
    const key = String(r.key).trim();
    if (!isValidHeaderName(key)) { problems.push(`"${key}" is not a valid header name`); continue; }
    const kind = headerKind(key);
    if (kind === 'blocked') { warnings.push(`${key} is set by the HTTP client itself and was not sent.`); continue; }
    if (kind === 'rule' && mode === 'browser') { warnings.push(`${key} can't be set from a web page, so it was not sent. Use "HitAPI cloud" or the extension to send it.`); continue; }
    headers.push([key, String(r.value ?? '')]);
  }
  let body; let bodyKind = 'none';
  if (hasNoBody(method)) {
    if (hasBodyContent(draft, files)) warnings.push(`The body was not sent: ${method.toUpperCase()} requests have no body. Switch the method to POST, PUT or PATCH.`);
  } else {
    let ct = headers.find(([k]) => k.toLowerCase() === 'content-type');
    if (ct && !ct[1].trim()) { headers.splice(headers.indexOf(ct), 1); ct = undefined; }
    const built = buildBody(draft, files, ct ? ct[1] : '');
    problems.push(...built.problems); warnings.push(...built.warnings);
    body = built.body;
    bodyKind = body === undefined ? 'none' : draft.bodyType;
    if (built.dropContentType && ct) headers.splice(headers.indexOf(ct), 1);
    else if (!ct && body !== undefined && built.contentType && draft.bodyType !== 'form') headers.push(['Content-Type', built.contentType]);
  }
  return { problems, warnings, request: { method, url: addQuery(normalizeUrl(draft.url), auth.query), headers, body, bodyKind } };
}

/** The request as code-generator input and as a cURL command (Code, Copy as cURL). */
export function finalRequest(draft, files = {}, oauthToken = null) {
  const auth = authParts(draft.auth, { oauthToken: draft.auth.type === 'oauth2' ? (oauthToken || { access_token: '<access-token>' }) : null });
  const names = new Set(auth.headers.map(a => a.key.toLowerCase()));
  const has = (name) => draft.headers.some(r => r.enabled !== false && String(r.key).trim().toLowerCase() === name && String(r.value).trim());
  const headers = [...draft.headers.filter(r => !names.has(String(r.key).trim().toLowerCase())), ...auth.headers.map(a => ({ ...a, enabled: true }))];
  if (!hasNoBody(draft.method) && !has('content-type') && ['json', 'xml', 'text', 'graphql'].includes(draft.bodyType)) headers.push({ key: 'Content-Type', value: AUTO_CONTENT_TYPE[draft.bodyType], enabled: true });
  const url = addQuery(normalizeUrl(draft.url), auth.query);
  const curl = toCurl({ method: draft.method, url, headers, bodyArgs: hasNoBody(draft.method) ? [] : curlBodyArgs(draft, files) });
  let body = null; let form = null;
  if (!hasNoBody(draft.method)) {
    const b = draft.bodies;
    if (['json', 'xml', 'text'].includes(draft.bodyType) && b[draft.bodyType]) body = b[draft.bodyType];
    else if (draft.bodyType === 'urlencoded') { const p = new URLSearchParams(); for (const r of b.urlencoded) if (r.enabled !== false && r.key) p.append(r.key, r.value ?? ''); body = p.toString() || null; if (body && !has('content-type')) headers.push({ key: 'Content-Type', value: 'application/x-www-form-urlencoded', enabled: true }); }
    else if (draft.bodyType === 'graphql') body = curlBodyArgs(draft, files)[0]?.[1] ?? null;
    else if (draft.bodyType === 'form') form = b.form.filter(r => r.enabled !== false && r.key).map(r => (r.kind === 'file' ? { key: r.key, file: files.form?.get(r.id)?.name || r.fileName || 'file' } : { key: r.key, value: r.value ?? '' }));
  }
  return { method: draft.method, url, headers: headers.filter(r => r.enabled !== false && String(r.key).trim()).map(r => [String(r.key).trim(), String(r.value ?? '')]), body, form, curl };
}

export const BINARY_TYPE = /^(image\/|audio\/|video\/|font\/|application\/(pdf|octet-stream|zip|gzip|x-protobuf|protobuf|msgpack|wasm))/i;

export function bytesToBase64(bytes) {
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
  return btoa(bin);
}
export function base64ToBytes(b64) {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}
export async function fileToBase64(file) {
  return bytesToBase64(new Uint8Array(await file.arrayBuffer()));
}
