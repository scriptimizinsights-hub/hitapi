/**
 * src/send.mjs — sends one request from Node (fetch), the way the Workbench does:
 * Auth tab headers / query, body types, settings (timeout, redirects).
 * No browser limits here: Cookie, Origin, User-Agent… are sent as written.
 */

import { authParts, addQuery, oauthTokenRequest, oauthKey } from './shared/auth.js';
import { buildBody } from './shared/body.js';
import { normalizeUrl, hasNoBody, isValidHeaderName } from './shared/http.js';

const HOP = new Set(['connection', 'keep-alive', 'transfer-encoding', 'upgrade', 'host', 'content-length', 'expect']);
const MAX_BODY = 10 * 1024 * 1024;
const tokens = new Map();   // OAuth 2.0 client-credentials tokens, for this run

async function oauthToken(o) {
  const key = oauthKey(o);
  const t = tokens.get(key);
  if (t && (!t.expires_at || Date.now() < t.expires_at - 30_000)) return t;
  if (!String(o.tokenUrl || '').trim()) throw new Error('OAuth 2.0: no token URL');
  const req = oauthTokenRequest(o);
  let res;
  try { res = await fetch(req.url, { method: 'POST', headers: req.headers, body: req.body }); } catch (e) { throw new Error(`OAuth 2.0: couldn't reach ${req.url} (${e.cause?.code || e.message})`); }
  const text = await res.text();
  let data = null; try { data = JSON.parse(text); } catch { /* not JSON */ }
  if (!res.ok || !data?.access_token) throw new Error(`OAuth 2.0: the token server said no (HTTP ${res.status}): ${data?.error_description || data?.error || text.slice(0, 200)}`);
  const tok = { access_token: data.access_token, token_type: data.token_type || 'Bearer', expires_at: data.expires_in ? Date.now() + Number(data.expires_in) * 1000 : null };
  tokens.set(key, tok);
  return tok;
}

/** draft (variables already filled in) → response record like the Workbench's, or { error, kind }. */
export async function sendDraft(draft, { timeoutMs, signal } = {}) {
  let oauth = null;
  if (draft.auth?.type === 'oauth2') {
    try { oauth = await oauthToken(draft.auth.oauth2); } catch (e) { return { error: e.message, kind: 'invalid', warnings: [] }; }
  }
  const method = String(draft.method || 'GET').trim();
  const auth = authParts(draft.auth, { oauthToken: oauth });
  if (auth.problems.length) return { error: auth.problems.join('\n'), kind: 'invalid', warnings: [] };
  const warnings = [];
  let rows = (draft.headers || []).filter(r => r.enabled !== false && String(r.key || '').trim());
  for (const ah of auth.headers) rows = rows.filter(r => String(r.key).trim().toLowerCase() !== ah.key.toLowerCase());
  rows = [...rows, ...auth.headers];
  const headers = {};
  for (const r of rows) {
    const k = String(r.key).trim();
    if (!isValidHeaderName(k)) return { error: `"${k}" is not a valid header name`, kind: 'invalid', warnings };
    if (HOP.has(k.toLowerCase())) { warnings.push(`${k} is set by the HTTP client and was not sent`); continue; }
    headers[k] = String(r.value ?? '');
  }
  let body;
  if (!hasNoBody(method)) {
    let ct = Object.keys(headers).find(k => k.toLowerCase() === 'content-type');
    if (ct && !headers[ct].trim()) { delete headers[ct]; ct = undefined; }
    const built = buildBody(draft, { binary: null, form: new Map() }, ct ? headers[ct] : '');
    if (built.problems.length) return { error: built.problems.join('\n'), kind: 'invalid', warnings };
    warnings.push(...built.warnings);
    body = built.body;
    if (built.dropContentType && ct) delete headers[ct];
    else if (!ct && body !== undefined && built.contentType && draft.bodyType !== 'form') headers['Content-Type'] = built.contentType;
  }
  const url = addQuery(normalizeUrl(draft.url), auth.query);
  const ms = timeoutMs || (draft.settings?.timeoutSec || 30) * 1000;
  const c = new AbortController();
  const onAbort = () => c.abort('cancel');
  signal?.addEventListener('abort', onAbort);
  const t = setTimeout(() => c.abort('timeout'), ms);
  const started = performance.now();
  const request = { method, url, headers };
  try {
    const res = await fetch(url, { method, headers, body, signal: c.signal, redirect: draft.settings?.followRedirects === false ? 'manual' : 'follow' });
    const headersAt = performance.now();
    const buf = new Uint8Array(await res.arrayBuffer());
    const bytes = buf.byteLength > MAX_BODY ? buf.subarray(0, MAX_BODY) : buf;
    const out = [];
    res.headers.forEach((v, k) => out.push([k, v]));
    for (const sc of res.headers.getSetCookie?.() || []) if (!out.some(([k, v]) => k === 'set-cookie' && v === sc)) out.push(['set-cookie', sc]);
    const contentType = res.headers.get('content-type') || '';
    return {
      status: res.status, statusText: res.statusText, ok: res.ok,
      ms: Math.round(performance.now() - started), ttfb: Math.round(headersAt - started),
      size: buf.byteLength, truncated: buf.byteLength > MAX_BODY,
      headers: out, rawHeaders: null, contentType, text: new TextDecoder().decode(bytes),
      redirected: res.redirected, finalUrl: res.url || url, request, warnings,
    };
  } catch (e) {
    const elapsed = Math.round(performance.now() - started);
    if (c.signal.aborted) {
      const why = c.signal.reason === 'timeout' ? 'timeout' : 'cancel';
      return { kind: why, error: why === 'timeout' ? `No response after ${Math.round(ms / 1000)} s (timeout)` : 'Cancelled', ms: elapsed, request, warnings };
    }
    const code = e.cause?.code || '';
    const msg = { ECONNREFUSED: 'Connection refused: nothing is listening at that address.', ENOTFOUND: 'The host name could not be found (DNS).', ECONNRESET: 'The server closed the connection.', CERT_HAS_EXPIRED: 'The server\'s TLS certificate has expired.', DEPTH_ZERO_SELF_SIGNED_CERT: 'The server uses a self-signed TLS certificate.', UNABLE_TO_VERIFY_LEAF_SIGNATURE: 'The server\'s TLS certificate could not be verified.' }[code];
    return { kind: 'network', code: code || null, error: msg || `Network error: ${e.cause?.message || e.message}`, ms: elapsed, request, warnings };
  } finally { clearTimeout(t); signal?.removeEventListener('abort', onAbort); }
}
