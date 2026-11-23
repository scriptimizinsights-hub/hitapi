/**
 * shared/convert/har.js — HAR files ↔ requests (roadmap feature 10).
 *
 * Import: a HAR from DevTools ("Save all as HAR") → a collection with a folder per host.
 * Filters: only fetch/XHR, one host, skip repeats of the same method + URL. Headers the
 * browser sets itself are skipped (like a cURL import).
 * Export: requests captured by the extension → HAR 1.2 (without response bodies, which
 * extensions can't read).
 */

import { newCollection, newFolder, newRequest, requestName } from '../collections.js';
import { importHeaders } from '../http.js';
import { draftFrom } from './draft.js';

export const isHar = (d) => !!d?.log && Array.isArray(d.log.entries);

const hostOf = (u) => { try { return new URL(u).host; } catch { return ''; } };
const isApiType = (e) => {
  const t = String(e._resourceType || '').toLowerCase();
  if (t) return t === 'xhr' || t === 'fetch';
  // no _resourceType (Firefox, other tools): guess from the response type
  const ct = String((e.response?.content?.mimeType) || '').toLowerCase();
  return /json|xml|text\/plain|graphql/.test(ct) || ['POST', 'PUT', 'PATCH', 'DELETE'].includes(e.request?.method);
};

/** What is in the file, for the import dialog's filters. */
export function harSummary(data) {
  if (!isHar(data)) throw new Error('This is not a HAR file.');
  const hosts = new Map();
  let api = 0;
  for (const e of data.log.entries) {
    const h = hostOf(e.request?.url);
    if (h) hosts.set(h, (hosts.get(h) || 0) + 1);
    if (isApiType(e)) api++;
  }
  return { total: data.log.entries.length, api, hosts: [...hosts.entries()].sort((a, b) => b[1] - a[1]).map(([host, count]) => ({ host, count })) };
}

/**
 * @param {object} data   HAR
 * @param {{ name?: string, onlyApi?: boolean, host?: string, unique?: boolean }} o
 */
export function importHar(data, { name = 'HAR import', onlyApi = true, host = '', unique = true } = {}) {
  if (!isHar(data)) throw new Error('This is not a HAR file.');
  const c = newCollection(name);
  const folders = new Map();
  const seen = new Set();
  let count = 0; let skippedFilter = 0; let skippedDup = 0; let skippedOther = 0;
  for (const e of data.log.entries) {
    const r = e.request;
    if (!r?.url || !/^https?:/i.test(r.url)) { skippedOther++; continue; }
    if ((onlyApi && !isApiType(e)) || (host && hostOf(r.url) !== host) || r.method === 'OPTIONS') { skippedFilter++; continue; }
    const key = `${r.method} ${r.url}`;
    if (unique && seen.has(key)) { skippedDup++; continue; }
    seen.add(key);
    const { rows } = importHeaders((r.headers || []).filter(x => !x.name.startsWith(':')).map(x => [x.name, x.value]));
    const d = draftFrom({ method: r.method, url: r.url, headers: rows.map(x => [x.key, x.value, x.enabled]), body: r.postData?.text || '', contentType: r.postData?.mimeType || '' });
    if (!r.postData?.text && r.postData?.params?.length) { d.bodyType = 'urlencoded'; d.bodies.urlencoded = r.postData.params.map(p => ({ key: p.name, value: p.value ?? '', enabled: true })); }
    const status = e.response?.status;
    if (status) d.tests = [{ id: `t${Math.random().toString(36).slice(2, 9)}`, target: 'status', op: 'equals', path: '', expected: String(status), enabled: false }];
    const h = hostOf(r.url);
    if (!folders.has(h)) { const f = newFolder(h || 'other'); folders.set(h, f); c.children.push(f); }
    folders.get(h).children.push(newRequest(requestName(d), d));
    count++;
  }
  if (folders.size === 1) c.children = c.children[0].children;   // one host: no folder needed
  const notes = [];
  if (skippedFilter) notes.push(`${skippedFilter} entr${skippedFilter === 1 ? 'y was' : 'ies were'} left out by the filters (pages, scripts, images, other hosts).`);
  if (skippedDup) notes.push(`${skippedDup} repeat${skippedDup === 1 ? '' : 's'} of the same method and URL ${skippedDup === 1 ? 'was' : 'were'} left out.`);
  if (skippedOther) notes.push(`${skippedOther} non-HTTP entr${skippedOther === 1 ? 'y was' : 'ies were'} skipped.`);
  notes.push('Each request has a switched-off "status equals …" test with the status from the recording; switch it on to check it.');
  if (!count) throw new Error('No requests matched the filters.');
  return { collection: c, notes, stats: { requests: count, folders: folders.size > 1 ? folders.size : 0 } };
}

/** Requests captured by the extension → HAR 1.2 */
export function capturedToHar(requests, { creator = 'HitAPI', version = '' } = {}) {
  const list = (obj) => Object.entries(obj || {}).map(([name, value]) => ({ name, value: String(value) }));
  const query = (u) => { try { return [...new URL(u).searchParams].map(([name, value]) => ({ name, value })); } catch { return []; } };
  const entries = [...requests].sort((a, b) => (a.timestamp || 0) - (b.timestamp || 0)).map(r => {
    const ct = Object.entries(r.headers || {}).find(([k]) => k.toLowerCase() === 'content-type')?.[1] || '';
    const rct = Object.entries(r.responseHeaders || {}).find(([k]) => k.toLowerCase() === 'content-type')?.[1] || '';
    return {
      startedDateTime: new Date(r.timestamp || Date.now()).toISOString(),
      time: r.duration || 0,
      request: {
        method: r.method, url: r.url, httpVersion: 'HTTP/1.1', cookies: [], headers: list(r.headers), queryString: query(r.url),
        ...(r.body ? { postData: { mimeType: ct || 'application/octet-stream', text: r.body } } : {}),
        headersSize: -1, bodySize: r.body ? r.body.length : 0,
      },
      response: {
        status: r.status || 0, statusText: r.error || '', httpVersion: 'HTTP/1.1', cookies: [], headers: list(r.responseHeaders),
        content: { size: -1, mimeType: rct, comment: 'Response bodies are not available to browser extensions.' },
        redirectURL: '', headersSize: -1, bodySize: -1,
      },
      cache: {}, timings: { send: 0, wait: r.duration || 0, receive: 0 },
      _resourceType: 'fetch',
    };
  });
  return { log: { version: '1.2', creator: { name: creator, version }, pages: [], entries } };
}
