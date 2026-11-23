/**
 * shared/auth.js — the Workbench's Auth tab (roadmap feature 3). Pure functions.
 *
 *   draft.auth = {
 *     type: 'none' | 'bearer' | 'basic' | 'apikey' | 'custom' | 'oauth2' | 'inherit',
 *     ('inherit': a saved request or folder uses its folder's / collection's auth, see shared/collections.js)
 *     bearer: { token, prefix },
 *     basic:  { username, password },
 *     apikey: { key, value, in: 'header' | 'query' },
 *     custom: { name, value },
 *     oauth2: { tokenUrl, clientId, clientSecret, scope, audience, clientAuth: 'body' | 'basic' },
 *   }
 *
 * Secrets stay in this browser (chrome.storage.local, like the rest of the draft).
 */

export const AUTH_TYPES = [
  { id: 'none', label: 'No auth' },
  { id: 'bearer', label: 'Bearer token' },
  { id: 'basic', label: 'Basic auth' },
  { id: 'apikey', label: 'API key' },
  { id: 'custom', label: 'Custom header' },
  { id: 'oauth2', label: 'OAuth 2.0' },
];

/** Shown only for requests and folders inside a collection. */
export const INHERIT_TYPE = { id: 'inherit', label: 'Inherit' };

export function emptyAuth() {
  return {
    type: 'none',
    bearer: { token: '', prefix: 'Bearer' },
    basic: { username: '', password: '' },
    apikey: { key: 'X-API-Key', value: '', in: 'header' },
    custom: { name: '', value: '' },
    oauth2: { tokenUrl: '', clientId: '', clientSecret: '', scope: '', audience: '', clientAuth: 'body' },
  };
}

export function normalizeAuth(a) {
  const base = emptyAuth();
  const out = { ...base, ...(a || {}) };
  for (const k of ['bearer', 'basic', 'apikey', 'custom', 'oauth2']) out[k] = { ...base[k], ...(out[k] || {}) };
  if (out.type !== 'inherit' && !AUTH_TYPES.some(t => t.id === out.type)) out.type = 'none';
  return out;
}

/** UTF-8 safe base64 (btoa alone fails on non-Latin-1 characters). */
export function base64(text) {
  const bytes = new TextEncoder().encode(String(text));
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin);
}

/** "eyJhbGciOi…x9Q" — for showing a secret without revealing it. */
export function maskSecret(value) {
  const v = String(value || '');
  if (v.length <= 8) return v ? '•'.repeat(v.length) : '';
  return `${v.slice(0, 4)}…${v.slice(-4)}`;
}

/**
 * What the auth settings add to the request.
 * @param {object} auth
 * @param {{ oauthToken?: { access_token: string, token_type?: string } }} [ctx]
 * @returns {{ headers: Array<{key, value}>, query: Array<[string, string]>, problems: string[] }}
 */
export function authParts(auth, ctx = {}) {
  const a = normalizeAuth(auth);
  const headers = [];
  const query = [];
  const problems = [];
  switch (a.type) {
    case 'bearer': {
      const token = a.bearer.token.trim();
      if (!token) problems.push('Auth: enter a bearer token, or choose "No auth".');
      else headers.push({ key: 'Authorization', value: `${(a.bearer.prefix || 'Bearer').trim()} ${token}`.trim() });
      break;
    }
    case 'basic': {
      if (!a.basic.username && !a.basic.password) problems.push('Auth: enter a username and password, or choose "No auth".');
      else headers.push({ key: 'Authorization', value: `Basic ${base64(`${a.basic.username}:${a.basic.password}`)}` });
      break;
    }
    case 'apikey': {
      const key = a.apikey.key.trim();
      if (!key) problems.push('Auth: enter the API key name (e.g. X-API-Key or api_key).');
      else if (a.apikey.in === 'query') query.push([key, a.apikey.value]);
      else headers.push({ key, value: a.apikey.value });
      break;
    }
    case 'custom': {
      const name = a.custom.name.trim();
      if (!name) problems.push('Auth: enter the header name.');
      else headers.push({ key: name, value: a.custom.value });
      break;
    }
    case 'oauth2': {
      const t = ctx.oauthToken;
      if (!t?.access_token) problems.push('Auth: no OAuth 2.0 access token yet. Press "Get token" in the Auth tab.');
      else {
        const type = /^bearer$/i.test(t.token_type || 'Bearer') ? 'Bearer' : (t.token_type || 'Bearer');
        headers.push({ key: 'Authorization', value: `${type} ${t.access_token}` });
      }
      break;
    }
    default: break;
  }
  return { headers, query, problems };
}

/** Add query params to a URL string without touching the rest of it. */
export function addQuery(url, pairs) {
  if (!pairs.length) return url;
  const hashAt = url.indexOf('#');
  const hash = hashAt >= 0 ? url.slice(hashAt) : '';
  const base = hashAt >= 0 ? url.slice(0, hashAt) : url;
  const extra = pairs.map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v ?? '')}`).join('&');
  return `${base}${base.includes('?') ? (base.endsWith('?') || base.endsWith('&') ? '' : '&') : '?'}${extra}${hash}`;
}

/** Short description of what will be sent, for the Headers tab and the Auth tab (secrets masked). */
export function authSummary(auth, ctx = {}) {
  const a = normalizeAuth(auth);
  if (a.type === 'none') return null;
  const { headers, query } = authParts(a, ctx);
  if (a.type === 'oauth2' && !headers.length) return { text: 'Authorization: Bearer <token from OAuth 2.0>', where: 'header' };
  if (query.length) return { text: `?${query[0][0]}=${maskSecret(query[0][1])}`, where: 'query' };
  if (!headers.length) return null;
  const h = headers[0];
  const shown = /^authorization$/i.test(h.key)
    ? h.value.replace(/^(\S+\s+)?(.*)$/, (_, scheme = '', secret) => `${scheme}${maskSecret(secret)}`)
    : maskSecret(h.value);
  return { text: `${h.key}: ${shown}`, where: 'header', key: h.key };
}

// ── OAuth 2.0 client credentials ────────────────────────────────────────────

/** The token request for the client-credentials grant (RFC 6749 §4.4). */
export function oauthTokenRequest(o) {
  const body = new URLSearchParams({ grant_type: 'client_credentials' });
  if (o.scope) body.set('scope', o.scope);
  if (o.audience) body.set('audience', o.audience);
  const headers = { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' };
  if (o.clientAuth === 'basic') {
    headers.Authorization = `Basic ${base64(`${encodeURIComponent(o.clientId)}:${encodeURIComponent(o.clientSecret)}`)}`;
  } else {
    body.set('client_id', o.clientId);
    if (o.clientSecret) body.set('client_secret', o.clientSecret);
  }
  return { url: o.tokenUrl.trim(), method: 'POST', headers, body: body.toString() };
}

/** Cache key: a token belongs to one token URL + client + scope. */
export const oauthKey = (o) => `${o.tokenUrl}|${o.clientId}|${o.scope}|${o.audience}`;
