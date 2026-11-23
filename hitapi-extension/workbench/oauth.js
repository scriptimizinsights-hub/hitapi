/**
 * workbench/oauth.js — gets and caches OAuth 2.0 access tokens (client
 * credentials grant) for the Auth tab. Tokens are kept in
 * chrome.storage.session: they survive a reload of the Workbench but are
 * cleared when Chrome closes, and are never written to disk.
 */

import { oauthTokenRequest, oauthKey } from '../shared/auth.js';

const KEY = 'wb:oauthTokens';
const EARLY_MS = 30_000; // refresh 30 s before expiry

async function readCache() {
  try { return (await chrome.storage.session.get(KEY))[KEY] || {}; } catch { return {}; }
}
async function writeCache(cache) {
  try { await chrome.storage.session.set({ [KEY]: cache }); } catch { /* unavailable */ }
}

/** A cached token that is still valid, or null. */
export async function cachedToken(o) {
  const t = (await readCache())[oauthKey(o)];
  if (!t) return null;
  if (t.expires_at && Date.now() > t.expires_at - EARLY_MS) return null;
  return t;
}

/**
 * Fetch a new access token.
 * @returns {Promise<{ access_token, token_type, expires_at, scope }>}  throws with a readable message
 */
export async function fetchToken(o) {
  if (!o.tokenUrl.trim()) throw new Error('Enter the token URL.');
  if (!o.clientId.trim()) throw new Error('Enter the client ID.');
  const req = oauthTokenRequest(o);
  let res;
  try {
    res = await fetch(req.url, { method: 'POST', headers: req.headers, body: req.body, credentials: 'omit', cache: 'no-store' });
  } catch {
    throw new Error(`Couldn't reach the token URL (${req.url}). Check the address.`);
  }
  const text = await res.text();
  let data = null;
  try { data = JSON.parse(text); } catch { /* not JSON */ }
  if (!res.ok || !data?.access_token) {
    const why = data?.error_description || data?.error || (text ? text.slice(0, 200) : `HTTP ${res.status}`);
    throw new Error(`The token server said no (HTTP ${res.status}): ${why}`);
  }
  const token = {
    access_token: data.access_token,
    token_type: data.token_type || 'Bearer',
    scope: data.scope || o.scope || '',
    expires_at: data.expires_in ? Date.now() + Number(data.expires_in) * 1000 : null,
    got_at: Date.now(),
  };
  const cache = await readCache();
  cache[oauthKey(o)] = token;
  await writeCache(cache);
  return token;
}

/** A valid token: the cached one, or a new one. */
export async function ensureToken(o) {
  return (await cachedToken(o)) || fetchToken(o);
}

export async function forgetToken(o) {
  const cache = await readCache();
  delete cache[oauthKey(o)];
  await writeCache(cache);
}
