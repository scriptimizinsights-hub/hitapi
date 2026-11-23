/**
 * shared/http.js — URL, query-param and header helpers for the Workbench.
 * Pure functions (no chrome.* calls), so they are easy to test.
 */

export const METHODS = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS'];

// Browsers refuse these methods in fetch().
const FORBIDDEN_METHODS = new Set(['CONNECT', 'TRACE', 'TRACK']);
const METHOD_TOKEN = /^[A-Za-z0-9!#$%&'*+.^_`|~-]+$/;

/** Problem with a custom method name, or null if it's fine. */
export function methodProblem(method) {
  const m = String(method || '').trim();
  if (!m) return 'Enter a method name';
  if (!METHOD_TOKEN.test(m)) return 'A method name can only contain letters, digits and - _ . ! ~ * \' etc.';
  if (FORBIDDEN_METHODS.has(m.toUpperCase())) return `Browsers do not allow ${m.toUpperCase()} requests`;
  return null;
}

/** Methods that normally carry no body. */
export const hasNoBody = (method) => ['GET', 'HEAD'].includes(String(method).toUpperCase());

const LOCAL_HOST = /^(localhost|127\.\d+\.\d+\.\d+|0\.0\.0\.0|\[::1\]|10\.\d+\.\d+\.\d+|192\.168\.\d+\.\d+|172\.(1[6-9]|2\d|3[01])\.\d+\.\d+|[\w-]+\.(local|test|internal|localhost))(:\d+)?([/?#]|$)/i;

/** Adds a scheme when it is missing: http:// for local hosts, https:// otherwise. */
export function normalizeUrl(input) {
  const s = String(input || '').trim();
  if (!s) return '';
  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(s)) return s;
  if (s.startsWith('//')) return `https:${s}`;
  return (LOCAL_HOST.test(s) ? 'http://' : 'https://') + s;
}

/** Problem with a URL, or null. */
export function urlProblem(input) {
  const s = normalizeUrl(input);
  if (!s) return 'Enter a URL';
  let u;
  try { u = new URL(s); } catch { return 'This is not a valid URL'; }
  if (!/^https?:$/.test(u.protocol)) return 'Only http:// and https:// URLs can be sent';
  if (!u.hostname) return 'The URL has no host';
  return null;
}

/** Split a URL into the part before "?", the query string and the hash. */
export function splitUrl(url) {
  const s = String(url || '');
  const hashAt = s.indexOf('#');
  const hash = hashAt >= 0 ? s.slice(hashAt) : '';
  const rest = hashAt >= 0 ? s.slice(0, hashAt) : s;
  const q = rest.indexOf('?');
  return q >= 0 ? { base: rest.slice(0, q), query: rest.slice(q + 1), hash } : { base: rest, query: '', hash };
}

function decode(s) {
  try { return decodeURIComponent(s.replace(/\+/g, ' ')); } catch { return s; }
}

/** "a=1&b=x%20y" → [{ key: 'a', value: '1', enabled: true }, …] */
export function parseQuery(query) {
  if (!query) return [];
  return query.split('&').filter(Boolean).map(pair => {
    const eq = pair.indexOf('=');
    const key = eq >= 0 ? pair.slice(0, eq) : pair;
    const value = eq >= 0 ? pair.slice(eq + 1) : '';
    return { key: decode(key), value: decode(value), enabled: true };
  });
}

/** Encode a query key/value, but leave {{variables}} readable. */
export function encodeQueryPart(text) {
  return String(text ?? '').split(/(\{\{[^}]*\}\})/).map(part =>
    (/^\{\{[^}]*\}\}$/.test(part) ? part : encodeURIComponent(part))).join('');
}

/** Rebuild a URL from its base, the enabled param rows and the hash. */
export function buildUrl(base, params, hash = '') {
  const query = params
    .filter(p => p.enabled !== false && String(p.key ?? '').length)
    .map(p => (p.value === '' || p.value == null ? encodeQueryPart(p.key) : `${encodeQueryPart(p.key)}=${encodeQueryPart(p.value)}`))
    .join('&');
  return base + (query ? `?${query}` : '') + hash;
}

/**
 * New param rows after the URL was edited: the URL's params (enabled), then
 * the rows that were switched off before (kept so nothing is lost).
 */
export function paramsFromUrl(url, previous = []) {
  return [...parseQuery(splitUrl(url).query), ...previous.filter(p => p.enabled === false)];
}

// ── Headers ─────────────────────────────────────────────────────────────────

// fetch() silently drops these; the Workbench sets them with a
// declarativeNetRequest rule instead (see background/workbench/protected-headers.js).
const VIA_RULE = new Set(['cookie', 'origin', 'referer', 'user-agent', 'dnt', 'date', 'via', 'accept-charset', 'accept-encoding']);

// The browser itself owns these; nobody can set them.
const BROWSER_OWNED = new Set([
  'host', 'content-length', 'connection', 'keep-alive', 'transfer-encoding', 'te', 'trailer', 'upgrade',
  'expect', 'cookie2', 'set-cookie', 'access-control-request-headers', 'access-control-request-method',
]);

/**
 * How a header can be sent.
 * @returns {'normal'|'rule'|'blocked'}
 */
export function headerKind(name) {
  const n = String(name || '').trim().toLowerCase();
  if (VIA_RULE.has(n)) return 'rule';
  if (BROWSER_OWNED.has(n) || n.startsWith('proxy-') || n.startsWith('sec-')) return 'blocked';
  return 'normal';
}

const HEADER_NAME = /^[A-Za-z0-9!#$%&'*+.^_`|~-]+$/;
export const isValidHeaderName = (name) => HEADER_NAME.test(String(name || '').trim());

// Set by the browser on every request; copying them from a capture or a
// "Copy as cURL" command is just noise.
const NOISE_HEADER = /^(host|connection|content-length|accept-encoding|accept-language|priority|pragma|cache-control|upgrade-insecure-requests|sec-.*)$/i;
// Also set by the browser, but some APIs check them: imported switched off.
const OFF_HEADER = /^(user-agent|origin|referer)$/i;

/**
 * Headers from a captured request or a pasted cURL command → Workbench rows.
 * @param {Array<[string,string]>} pairs
 * @returns {{ rows: Array<{key,value,enabled}>, skipped: string[] }}
 */
export function importHeaders(pairs) {
  const rows = [];
  const skipped = [];
  for (const [key, value] of pairs) {
    const k = String(key || '').trim();
    if (!k) continue;
    if (NOISE_HEADER.test(k) || headerKind(k) === 'blocked') { skipped.push(k); continue; }
    rows.push({ key: k, value: String(value ?? ''), enabled: !OFF_HEADER.test(k) });
  }
  return { rows, skipped };
}

/** Header names offered while typing. */
export const COMMON_HEADERS = [
  'Accept', 'Accept-Language', 'Authorization', 'Cache-Control', 'Content-Type', 'Cookie', 'If-Match',
  'If-None-Match', 'If-Modified-Since', 'Origin', 'Pragma', 'Referer', 'User-Agent', 'X-API-Key',
  'X-Request-Id', 'X-Correlation-Id', 'X-Requested-With', 'X-Forwarded-For',
];

/** Suggested values for a header name. */
export const COMMON_VALUES = {
  'accept': ['application/json', 'application/xml', 'text/plain', 'text/html', '*/*'],
  'content-type': ['application/json', 'application/xml', 'text/plain', 'application/x-www-form-urlencoded', 'multipart/form-data'],
  'cache-control': ['no-cache', 'no-store', 'max-age=0'],
  'authorization': ['Bearer ', 'Basic '],
  'accept-language': ['en-US,en;q=0.9'],
  'x-requested-with': ['XMLHttpRequest'],
};

/** Human-readable size: 1234 → "1.2 KB". */
export function formatBytes(n) {
  if (n == null) return '';
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 / 1024).toFixed(2)} MB`;
}
