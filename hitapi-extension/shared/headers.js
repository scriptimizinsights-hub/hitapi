/**
 * shared/headers.js — what to keep, drop or hide when a captured request's
 * headers leave the browser (saved as a test step, or put in a bug report).
 */

// Set by the browser itself; replaying them is noise (or breaks the request).
const BROWSER_HEADERS = new Set([
  'host', 'connection', 'content-length', 'keep-alive', 'proxy-connection', 'te', 'upgrade',
  'user-agent', 'accept-encoding', 'accept-language', 'cache-control', 'pragma', 'priority',
  'dnt', 'origin', 'referer', 'upgrade-insecure-requests',
]);

// Credentials: never saved into a step; masked in bug reports.
const SECRET_HEADER = /^(authorization|proxy-authorization|cookie|set-cookie|x-api-key|api-key|apikey|x-auth-token|x-access-token|x-csrf-token|x-xsrf-token)$/i;

export function isSecretHeader(name) {
  return SECRET_HEADER.test(String(name || '').trim());
}

function isBrowserHeader(name) {
  const n = String(name || '').toLowerCase();
  return BROWSER_HEADERS.has(n) || n.startsWith('sec-');
}

/** webRequest gives [{name, value}] — turn it into a plain object. */
export function headerListToObject(list = []) {
  const out = {};
  for (const h of list) if (h?.name) out[h.name] = h.value ?? '';
  return out;
}

/** The Bearer token in a header object, or null. */
export function bearerFrom(headers = {}) {
  for (const [k, v] of Object.entries(headers)) {
    if (k.toLowerCase() === 'authorization' && /^bearer\s+/i.test(v || '')) {
      return v.replace(/^bearer\s+/i, '').trim() || null;
    }
  }
  return null;
}

/**
 * Headers worth saving in a test step: drops browser-set headers and every
 * credential. Authentication is set once on the suite instead (see
 * flows.quickCreate), so tokens don't end up copied into every step.
 */
export function headersForStep(headers = {}) {
  const out = {};
  for (const [k, v] of Object.entries(headers)) {
    if (isBrowserHeader(k) || isSecretHeader(k)) continue;
    out[k] = v;
  }
  return out;
}

/** Copy with credential values replaced, for showing or reporting. */
export function maskSecrets(headers = {}) {
  const out = {};
  for (const [k, v] of Object.entries(headers)) {
    out[k] = isSecretHeader(k) ? mask(v) : v;
  }
  return out;
}

export function mask(value) {
  const s = String(value ?? '');
  const scheme = s.match(/^(bearer|basic|token)\s+(.+)$/i);
  if (scheme) return `${scheme[1]} ${mask(scheme[2])}`;
  if (s.length <= 12) return '••••••';
  return `${s.slice(0, 4)}••••••${s.slice(-4)}`;
}
