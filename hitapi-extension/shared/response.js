/**
 * shared/response.js — helpers for the Workbench's response viewer (roadmap
 * feature 4). Pure functions, no DOM.
 */

/** What kind of body this is, from its Content-Type and first bytes. */
export function bodyKind(contentType = '', text = '') {
  const ct = String(contentType).toLowerCase();
  if (/^image\//.test(ct)) return 'image';
  if (/application\/pdf/.test(ct)) return 'pdf';
  if (/json/.test(ct)) return 'json';
  if (/html/.test(ct)) return 'html';
  if (/xml/.test(ct)) return 'xml';
  if (/^(audio|video)\//.test(ct) || /octet-stream|zip|protobuf|msgpack/.test(ct)) return 'binary';
  const t = String(text).trimStart();
  if (/^[[{]/.test(t)) { try { JSON.parse(text); return 'json'; } catch { /* not JSON */ } }
  if (/^<!doctype html|^<html/i.test(t)) return 'html';
  if (/^<\?xml|^<[a-z][\w:.-]*[\s>]/i.test(t)) return 'xml';
  return 'text';
}

/** JSONPath for a list of keys: ['data', 0, 'first name'] → $.data[0]['first name'] */
export function jsonPath(keys) {
  return '$' + keys.map(k => (typeof k === 'number' ? `[${k}]`
    : /^[A-Za-z_$][\w$]*$/.test(k) ? `.${k}` : `['${String(k).replace(/\\/g, '\\\\').replace(/'/g, "\\'")}']`)).join('');
}

const URL_RE = /^https?:\/\/[^\s"'<>]+$/i;
const LINKY_KEY = /(^|_|-)(href|url|uri|link|next|prev|previous|self|first|last|location)$/i;

/**
 * A URL to open from a JSON string value, or null.
 * Absolute http(s) URLs always; "/relative" paths when the key looks like a link (href, next, self…).
 */
export function linkFromValue(value, key, baseUrl) {
  if (typeof value !== 'string' || value.length > 2000) return null;
  if (URL_RE.test(value)) return value;
  if (value.startsWith('/') && !value.startsWith('//') && LINKY_KEY.test(String(key ?? '')) && baseUrl) {
    try { return new URL(value, baseUrl).toString(); } catch { return null; }
  }
  return null;
}

/** Link: <https://api/x?page=2>; rel="next", <…>; rel="last"  →  [{ url, rel }] */
export function parseLinkHeader(value, baseUrl) {
  const out = [];
  for (const part of String(value || '').split(/,(?=\s*<)/)) {
    const m = /<([^>]+)>(.*)/.exec(part.trim());
    if (!m) continue;
    let url = m[1];
    try { url = new URL(url, baseUrl).toString(); } catch { /* keep as is */ }
    const rel = /rel="?([^";]+)"?/i.exec(m[2])?.[1] || '';
    out.push({ url, rel });
  }
  return out;
}

/** Set-Cookie header values → [{ name, value, domain, path, expires, maxAge, secure, httpOnly, sameSite }] */
export function parseSetCookies(values) {
  return values.map((line) => {
    const [pair, ...attrs] = String(line).split(';');
    const eq = pair.indexOf('=');
    const c = {
      name: (eq >= 0 ? pair.slice(0, eq) : pair).trim(),
      value: eq >= 0 ? pair.slice(eq + 1).trim() : '',
      domain: '', path: '', expires: '', maxAge: '', secure: false, httpOnly: false, sameSite: '',
    };
    for (const a of attrs) {
      const i = a.indexOf('=');
      const k = (i >= 0 ? a.slice(0, i) : a).trim().toLowerCase();
      const v = i >= 0 ? a.slice(i + 1).trim() : '';
      if (k === 'domain') c.domain = v;
      else if (k === 'path') c.path = v;
      else if (k === 'expires') c.expires = v;
      else if (k === 'max-age') c.maxAge = v;
      else if (k === 'secure') c.secure = true;
      else if (k === 'httponly') c.httpOnly = true;
      else if (k === 'samesite') c.sameSite = v;
    }
    return c;
  }).filter(c => c.name);
}

/** A file name for saving a body: last URL segment + an extension from the Content-Type. */
export function fileNameFor(url, contentType = '') {
  const EXT = { json: 'json', html: 'html', xml: 'xml', csv: 'csv', pdf: 'pdf', png: 'png', jpeg: 'jpg', gif: 'gif', webp: 'webp', 'svg+xml': 'svg', plain: 'txt', javascript: 'js', zip: 'zip' };
  let base = 'response';
  try {
    const last = new URL(url).pathname.split('/').filter(Boolean).pop();
    if (last) base = decodeURIComponent(last).replace(/[^\w.-]+/g, '_').slice(0, 80) || base;
  } catch { /* keep default */ }
  const sub = (/\/([\w.+-]+)/.exec(String(contentType).split(';')[0]) || [])[1] || '';
  const ext = EXT[sub] || (sub.endsWith('+json') ? 'json' : sub.endsWith('+xml') ? 'xml' : '');
  if (ext && !base.toLowerCase().endsWith(`.${ext}`)) base = `${base.replace(/\.[^.]{1,5}$/, '')}.${ext}`;
  return base;
}

/** Approximate size of the response headers on the wire. */
export function headersSize(list) {
  return list.reduce((n, [k, v]) => n + k.length + String(v).length + 4, 0);
}

/**
 * Timing phases from a PerformanceResourceTiming entry. Cross-origin servers that
 * don't send Timing-Allow-Origin hide the detail (zeros); then only total is known.
 */
export function timingPhases(e) {
  if (!e) return null;
  const d = (a, b) => (e[a] > 0 && e[b] > 0 && e[b] >= e[a] ? Math.round(e[b] - e[a]) : null);
  const phases = [
    ['Waiting to start', d('startTime', 'domainLookupStart') ?? d('startTime', 'fetchStart')],
    ['DNS lookup', d('domainLookupStart', 'domainLookupEnd')],
    ['Connecting', d('connectStart', 'connectEnd')],
    ['TLS handshake', e.secureConnectionStart > 0 ? d('secureConnectionStart', 'connectEnd') : null],
    ['Waiting for the server (TTFB)', d('requestStart', 'responseStart')],
    ['Downloading', d('responseStart', 'responseEnd')],
  ].filter(([, v]) => v != null);
  return { phases, detailed: e.requestStart > 0 && e.responseStart > 0, protocol: e.nextHopProtocol || '' };
}
