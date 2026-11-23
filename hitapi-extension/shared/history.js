/**
 * shared/history.js — pure helpers for the Workbench's request history
 * (roadmap feature 5): hiding secrets, putting them back, filtering, grouping.
 * Storage lives in workbench/history-store.js.
 */

import { isSecretHeader } from './headers.js';
import { bodyKind } from './response.js';
import { normalizeUrl } from './http.js';

export const MAX_ENTRIES = 500;
export const MAX_TOTAL_BYTES = 5 * 1024 * 1024;   // chrome.storage.local holds ~10 MB in all
export const MAX_BODY_CHARS = 256 * 1024;          // response bodies kept per entry

export const DEFAULT_HISTORY_SETTINGS = Object.freeze({ enabled: true, maskSecrets: true, skipHosts: '' });

const AUTH_SECRETS = [['bearer', 'token'], ['basic', 'password'], ['apikey', 'value'], ['custom', 'value'], ['oauth2', 'clientSecret']];

/** A copy of the draft with secret values removed, and a list of what was removed. */
/** "{{token}}", "Bearer {{token}}": only a reference to a variable, no secret in it. */
export const onlyVarRefs = (v) => /\{\{/.test(String(v)) && String(v).replace(/\{\{\s*[^{}]+?\s*\}\}/g, '').replace(/^\s*(Bearer|Basic|Token)\b/i, '').trim() === '';

/**
 * keepVars: keep values that are only {{variable}} references (exports: the
 * secret itself lives in an environment, not in the request).
 */
export function maskDraft(draft, { keepVars = false } = {}) {
  const d = structuredClone(draft);
  delete d.source;
  delete d.link;   // the saved request it came from (collections)
  const masked = [];
  d.headers = (d.headers || []).map(r => {
    if (isSecretHeader(r.key) && r.value && !(keepVars && onlyVarRefs(r.value))) { masked.push(`header:${String(r.key).trim().toLowerCase()}`); return { ...r, value: '' }; }
    return r;
  });
  for (const [section, field] of AUTH_SECRETS) {
    if (d.auth?.[section]?.[field] && !(keepVars && onlyVarRefs(d.auth[section][field]))) { masked.push(`auth:${section}.${field}`); d.auth[section][field] = ''; }
  }
  return { draft: d, masked };
}

/**
 * Put secrets back into a draft opened from history, from the request being
 * edited now (same header name, same auth field). Returns what is still missing.
 */
export function restoreSecrets(entryDraft, masked, current) {
  const d = structuredClone(entryDraft);
  const missing = [];
  for (const m of masked || []) {
    if (m.startsWith('header:')) {
      const name = m.slice(7);
      const now = (current?.headers || []).find(r => String(r.key).trim().toLowerCase() === name && r.value);
      const row = d.headers.find(r => String(r.key).trim().toLowerCase() === name);
      if (now && row) row.value = now.value; else missing.push(row?.key || name);
    } else if (m.startsWith('auth:')) {
      const [section, field] = m.slice(5).split('.');
      const now = current?.auth?.[section]?.[field];
      if (now) d.auth[section][field] = now; else missing.push(`Auth ${section === 'oauth2' ? 'client secret' : section === 'basic' ? 'password' : section === 'apikey' ? 'API key' : section === 'custom' ? 'header value' : 'token'}`);
    }
  }
  return { draft: d, missing };
}

export function hostOf(url) {
  try { return new URL(normalizeUrl(url)).host; } catch { return ''; }
}

/** "*.bank.com, internal.corp" → does this URL's host match? */
export function isSkippedHost(url, patterns) {
  const host = hostOf(url).toLowerCase().replace(/:\d+$/, '');
  if (!host) return false;
  return String(patterns || '').split(/[\s,]+/).map(p => p.trim().toLowerCase()).filter(Boolean).some(p => {
    if (p.startsWith('*.')) return host === p.slice(2) || host.endsWith(p.slice(1));
    return host === p.replace(/:\d+$/, '');
  });
}

/** The response as kept in history: no raw bytes, body text capped. */
export function storableResponse(res) {
  if (!res) return null;
  const kind = res.error ? 'text' : bodyKind(res.contentType, res.text);
  const binary = kind === 'image' || kind === 'pdf' || kind === 'binary';
  const text = binary ? '' : String(res.text || '');
  return {
    error: res.error || null, kind: res.kind || null, code: res.code || null,
    status: res.status ?? 0, statusText: res.statusText || '', ok: !!res.ok,
    ms: res.ms ?? 0, ttfb: res.ttfb ?? 0, size: res.size ?? 0,
    headers: res.headers || [], rawHeaders: res.rawHeaders || null, contentType: res.contentType || '',
    text: text.slice(0, MAX_BODY_CHARS),
    truncated: !!res.truncated || text.length > MAX_BODY_CHARS,
    notKept: binary ? kind : null,
    redirected: !!res.redirected, finalUrl: res.finalUrl || '', redirects: res.redirects || [],
    redirectBlocked: !!res.redirectBlocked, warnings: res.warnings || [], timing: null,
    tests: Array.isArray(res.tests) ? res.tests : null,
  };
}

/** Text the search box looks through (lower case, capped so the index stays small). */
export function searchText(draft, res) {
  const b = draft.bodies || {};
  const body = ['json', 'xml', 'text'].includes(draft.bodyType) ? b[draft.bodyType] : draft.bodyType === 'graphql' ? b.graphql?.query : '';
  return [draft.method, draft.url, res?.status, res?.statusText, res?.error, String(body || '').slice(0, 500), String(res?.text || '').slice(0, 1000)]
    .filter(Boolean).join(' ').toLowerCase();
}

/**
 * @param {object} meta   index entry
 * @param {{ q?: string, method?: string, status?: string, host?: string }} f
 */
export function matchesFilter(meta, f = {}) {
  if (f.method && meta.method !== f.method) return false;
  if (f.host && meta.host !== f.host) return false;
  if (f.status) {
    if (f.status === 'error') { if (!meta.error) return false; }
    else if (f.status === 'tests') { if (!meta.tests || meta.tests.passed === meta.tests.total) return false; }
    else if (meta.error || Math.floor((meta.status || 0) / 100) !== Number(f.status[0])) return false;
  }
  if (f.q) {
    const words = f.q.toLowerCase().split(/\s+/).filter(Boolean);
    if (!words.every(w => meta.search.includes(w))) return false;
  }
  return true;
}

/** Day label for a timestamp: Today, Yesterday, or e.g. "Mon 9 Nov". */
export function dayLabel(at, now = Date.now()) {
  const d = new Date(at); const n = new Date(now);
  const start = (x) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const days = Math.round((start(n) - start(d)) / 86400000);
  if (days === 0) return 'Today';
  if (days === 1) return 'Yesterday';
  return d.toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short', ...(d.getFullYear() !== n.getFullYear() ? { year: 'numeric' } : {}) });
}

/** [{ label, items }] newest day first (metas already newest first). */
export function groupByDay(metas, now = Date.now()) {
  const groups = [];
  for (const m of metas) {
    const label = dayLabel(m.at, now);
    if (groups[groups.length - 1]?.label !== label) groups.push({ label, items: [] });
    groups[groups.length - 1].items.push(m);
  }
  return groups;
}
