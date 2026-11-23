/**
 * shared/convert/draft.js — helpers shared by the importers and exporters
 * (roadmap feature 10): a blank request, header/body building, safe names.
 */

import { emptyBodies, detectBody } from '../body.js';
import { emptyAuth } from '../auth.js';
import { paramsFromUrl } from '../http.js';

export function blankDraft(patch = {}) {
  return {
    method: 'GET', url: '', params: [], headers: [], bodyType: 'json', bodies: emptyBodies(),
    auth: emptyAuth(), settings: { timeoutSec: 30, followRedirects: true, withCookies: false }, extract: [], tests: [],
    ...patch,
  };
}

/** A request from plain parts: { method, url, headers: [[k, v, enabled]], body, contentType }. */
export function draftFrom({ method = 'GET', url = '', headers = [], body = '', contentType = '' }) {
  const rows = headers.map(([key, value, enabled = true]) => ({ key: String(key), value: String(value ?? ''), enabled }));
  const ct = contentType || rows.find(r => r.enabled && r.key.toLowerCase() === 'content-type')?.value || '';
  const d = blankDraft({ method: String(method || 'GET').toUpperCase(), url, headers: rows, ...detectBody(body || '', ct) });
  d.params = paramsFromUrl(url, []);
  return d;
}

/** Postman/Insomnia/OpenAPI path parameters → {{name}} */
export const colonToVars = (url) => String(url).replace(/(^|\/):([A-Za-z_][\w-]*)/g, '$1{{$2}}');
export const braceToVars = (path) => String(path).replace(/\{([^}/]+)\}/g, '{{$1}}');
export const varsToBraces = (path) => String(path).replace(/\{\{\s*([^}\s]+)\s*\}\}/g, '{$1}');

export const fileSafe = (name) => String(name || 'collection').replace(/[^\w.-]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 60) || 'collection';

/** First JSON-ish example from an OpenAPI/Postman structure, pretty-printed. */
export const pretty = (v) => (typeof v === 'string' ? v : JSON.stringify(v, null, 2));
