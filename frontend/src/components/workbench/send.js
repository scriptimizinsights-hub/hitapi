/**
 * Web Workbench — sending a request in one of three ways (see core.js MODES):
 *   cloud      POST /api/public/request (HitAPI's servers)
 *   browser    fetch() from this page (CORS rules apply)
 *   extension  the HitAPI Chrome extension (bridge.js)
 * All three return the same response record:
 *   { status, statusText, ok, ms, ttfb, size, truncated, headers: [[k, v]], contentType,
 *     text, base64, redirects, finalUrl, request, warnings, mode, headersLimited }
 *   or { error, kind, warnings, mode }
 */

import { prepare, isLocalUrl, BINARY_TYPE, bytesToBase64, fileToBase64 } from './core.js';
import { oauthTokenRequest, oauthKey } from '@hitapi/shared/auth.js';
import { normalizeUrl } from '@hitapi/shared/http.js';
import { sendViaExtension, cancelViaExtension } from './bridge.js';
import { API_BASE, getToken } from '../../store/index.js';

export const CLOUD_LIMITS = { timeoutSec: 15, requestBytes: 1024 * 1024, responseBytes: 2 * 1024 * 1024 };

// ── OAuth 2.0 client credentials (cached in sessionStorage until it expires) ──
const TOKENS_KEY = 'hitapi:web:oauth';
function readTokens() { try { return JSON.parse(sessionStorage.getItem(TOKENS_KEY) || '{}'); } catch { return {}; } }
export function cachedToken(o) {
  const t = readTokens()[oauthKey(o)];
  return t && (!t.expires_at || Date.now() < t.expires_at - 30_000) ? t : null;
}
export async function fetchToken(o, mode) {
  if (!String(o.tokenUrl || '').trim()) throw new Error('Enter the token URL.');
  if (!String(o.clientId || '').trim()) throw new Error('Enter the client ID.');
  const req = oauthTokenRequest(o);
  const draft = { method: 'POST', url: req.url, headers: Object.entries(req.headers).map(([key, value]) => ({ key, value, enabled: true })), bodyType: 'text', bodies: { text: req.body }, auth: { type: 'none' }, settings: { timeoutSec: 15, followRedirects: true } };
  const res = mode === 'browser' ? await viaBrowser(draft, {}, {}) : await viaCloud(draft, {}, {});
  if (res.error) throw new Error(`Couldn't reach the token URL: ${res.error}`);
  let data = null; try { data = JSON.parse(res.text); } catch { /* not JSON */ }
  if (res.status >= 400 || !data?.access_token) throw new Error(`The token server said no (HTTP ${res.status}): ${data?.error_description || data?.error || res.text?.slice(0, 200) || ''}`);
  const token = { access_token: data.access_token, token_type: data.token_type || 'Bearer', scope: data.scope || o.scope || '', expires_at: data.expires_in ? Date.now() + Number(data.expires_in) * 1000 : null };
  try { const all = readTokens(); all[oauthKey(o)] = token; sessionStorage.setItem(TOKENS_KEY, JSON.stringify(all)); } catch { /* ignore */ }
  return token;
}
export function forgetToken(o) {
  try { const all = readTokens(); delete all[oauthKey(o)]; sessionStorage.setItem(TOKENS_KEY, JSON.stringify(all)); } catch { /* ignore */ }
}

// ── cloud ──
async function viaCloud(draft, files, { signal, oauthToken }) {
  const { request, problems, warnings } = prepare(draft, files, { oauthToken, mode: 'cloud' });
  if (problems.length) return { error: problems.join('\n'), kind: 'invalid', warnings };
  if (isLocalUrl(request.url)) return { error: 'HitAPI cloud can\'t reach localhost or private network addresses. Send it from "This browser" or with the HitAPI extension.', kind: 'local', warnings };
  const input = { method: request.method, url: request.url, headers: {}, follow_redirects: draft.settings?.followRedirects !== false };
  for (const [k, v] of request.headers) input.headers[k] = v;
  const b = request.body;
  if (typeof b === 'string') input.body = b;
  else if (b instanceof FormData) {
    input.form = [];
    for (const [name, value] of b.entries()) {
      if (typeof value === 'string') input.form.push({ name, value });
      else input.form.push({ name, filename: value.name, content_type: value.type || 'application/octet-stream', base64: await fileToBase64(value) });
    }
  } else if (b instanceof Blob) input.body_base64 = await fileToBase64(b);
  const started = performance.now();
  let res;
  try {
    const token = getToken();
    res = await fetch(`${API_BASE}/public/request`, { method: 'POST', headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) }, body: JSON.stringify(input), signal });
  } catch (e) {
    if (signal?.aborted) return aborted(signal, started, warnings, 'cloud', CLOUD_LIMITS.timeoutSec);
    return { error: 'Couldn\'t reach HitAPI cloud. Check your connection.', kind: 'network', warnings, mode: 'cloud' };
  }
  const data = await res.json().catch(() => null);
  if (!res.ok || data?.success === false || !data) {
    const msg = data?.error || `HitAPI cloud error ${res.status}`;
    return { error: msg, kind: res.status === 429 ? 'rate' : res.status === 504 ? 'timeout' : 'cloud', warnings, mode: 'cloud' };
  }
  const r = data.data;
  const headers = r.header_list || Object.entries(r.headers || {});
  return {
    status: r.status, statusText: r.status_text || '', ok: r.ok, ms: r.time_ms, ttfb: r.ttfb_ms ?? r.time_ms, size: r.size_bytes, truncated: !!r.truncated,
    headers, contentType: r.content_type || '', text: r.body || '', base64: r.body_base64 || null,
    redirects: r.redirects || [], finalUrl: r.final_url, request: { method: request.method, url: request.url, headers: request.headers, body: typeof b === 'string' ? b : b ? `(${request.bodyKind} body)` : null },
    warnings, mode: 'cloud', remaining: data.meta?.rate_limit_remaining ?? null,
  };
}

function aborted(signal, started, warnings, mode, limitSec) {
  const why = signal.reason === 'timeout' ? 'timeout' : 'cancel';
  return { kind: why, error: why === 'timeout' ? `No response after ${limitSec} seconds (timeout).` : 'Request cancelled.', ms: Math.round(performance.now() - started), warnings, mode };
}

// ── browser ──
async function viaBrowser(draft, files, { signal, oauthToken }) {
  const { request, problems, warnings } = prepare(draft, files, { oauthToken, mode: 'browser' });
  if (problems.length) return { error: problems.join('\n'), kind: 'invalid', warnings };
  const started = performance.now();
  let res;
  try {
    res = await fetch(request.url, { method: request.method, headers: request.headers, body: request.body, signal, redirect: draft.settings?.followRedirects === false ? 'manual' : 'follow', credentials: 'omit', cache: 'no-store', mode: 'cors' });
  } catch (e) {
    if (signal?.aborted) return aborted(signal, started, warnings, 'browser', draft.settings?.timeoutSec || 30);
    return { error: explainBrowserFailure(request.url), kind: 'cors', warnings, mode: 'browser', ms: Math.round(performance.now() - started) };
  }
  const ttfb = Math.round(performance.now() - started);
  if (res.type === 'opaqueredirect') {
    return { status: 0, statusText: 'Redirect not followed', redirectBlocked: true, ms: ttfb, ttfb, size: 0, headers: [], contentType: '', text: '', base64: null, redirects: [], finalUrl: request.url, request: { ...request, body: null }, warnings: [...warnings, 'Browsers hide where a redirect goes. Use "HitAPI cloud" or the extension to see it.'], mode: 'browser' };
  }
  const bytes = new Uint8Array(await res.arrayBuffer());
  const headers = []; res.headers.forEach((v, k) => headers.push([k, v]));
  const contentType = res.headers.get('content-type') || '';
  const binary = BINARY_TYPE.test(contentType);
  return {
    status: res.status, statusText: res.statusText, ok: res.ok, ms: Math.round(performance.now() - started), ttfb, size: bytes.byteLength, truncated: false,
    headers, contentType, text: binary ? '' : new TextDecoder().decode(bytes), base64: binary ? bytesToBase64(bytes) : null,
    redirects: [], redirected: res.redirected, finalUrl: res.url || request.url, request: { method: request.method, url: request.url, headers: request.headers, body: typeof request.body === 'string' ? request.body : request.body ? `(${request.bodyKind} body)` : null },
    warnings, mode: 'browser', headersLimited: true,
  };
}

export function explainBrowserFailure(url) {
  let u = null; try { u = new URL(normalizeUrl(url)); } catch { /* invalid */ }
  const pageHttps = typeof location !== 'undefined' && location.protocol === 'https:';
  if (u && pageHttps && u.protocol === 'http:' && !isLocalUrl(url)) return `The browser blocked it: this page is https and ${u.host} is plain http (mixed content). Use "HitAPI cloud" or the extension.`;
  return `The browser couldn't get a response from ${u?.host || 'the server'}. Most often the API doesn't allow requests from other websites (CORS)${u && isLocalUrl(url) ? ', or nothing is running at that address' : ''}. Send it with the HitAPI extension (no CORS limits)${u && !isLocalUrl(url) ? ' or "HitAPI cloud"' : ''}.`;
}

// ── extension ──
async function viaExtension(draft, files, { id }) {
  const { problems, warnings } = prepare(draft, files, { mode: 'extension' });
  if (problems.length) return { error: problems.join('\n'), kind: 'invalid', warnings };
  const payload = { id, draft: { method: draft.method, url: draft.url, headers: draft.headers, bodyType: draft.bodyType, bodies: draft.bodies, auth: draft.auth, settings: draft.settings }, files: {} };
  if (files.binary) payload.files.binary = { name: files.binary.name, type: files.binary.type, base64: await fileToBase64(files.binary) };
  if (files.form?.size) { payload.files.form = {}; for (const [rid, f] of files.form) payload.files.form[rid] = { name: f.name, type: f.type, base64: await fileToBase64(f) }; }
  const r = await sendViaExtension(payload);
  if (r.error) return { ...r, warnings: [...warnings, ...(r.warnings || [])], mode: 'extension' };
  const headers = r.rawHeaders || r.headers || [];
  return {
    status: r.status, statusText: r.statusText || '', ok: r.ok, ms: r.ms, ttfb: r.ttfb ?? r.ms, size: r.size, truncated: !!r.truncated,
    headers, contentType: r.contentType || '', text: r.body_base64 ? '' : (r.text || ''), base64: r.body_base64 || null,
    redirects: r.redirects || [], finalUrl: r.finalUrl, request: r.request, warnings: [...warnings, ...(r.warnings || [])].filter((w, i, a) => a.indexOf(w) === i), mode: 'extension', redirectBlocked: r.redirectBlocked,
  };
}

/**
 * @param {object} draft
 * @param {{ mode, files, signal, id }} o
 */
export async function send(draft, { mode, files = {}, signal, id } = {}) {
  let oauthToken = null;
  if (draft.auth?.type === 'oauth2' && mode !== 'extension') {
    try { oauthToken = cachedToken(draft.auth.oauth2) || await fetchToken(draft.auth.oauth2, mode); }
    catch (e) { return { error: `OAuth 2.0: ${e.message}`, kind: 'invalid', warnings: [], mode }; }
  }
  if (mode === 'extension') {
    const onAbort = () => cancelViaExtension(id);
    signal?.addEventListener('abort', onAbort);
    try { return await viaExtension(draft, files, { id }); } finally { signal?.removeEventListener('abort', onAbort); }
  }
  return mode === 'browser' ? viaBrowser(draft, files, { signal, oauthToken }) : viaCloud(draft, files, { signal, oauthToken });
}
