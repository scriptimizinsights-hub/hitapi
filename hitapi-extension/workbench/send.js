/**
 * workbench/send.js — sends the draft and reads the response.
 *
 * Runs in the Workbench page itself. It is an extension page with access to
 * all hosts, so there are no CORS limits and localhost works. Headers fetch()
 * may not set (Cookie, Origin, Referer, User-Agent…) go through a temporary
 * declarativeNetRequest rule set up by the background.
 */

import { MSG } from '../shared/messages.js';
import { call } from '../ui/core/bridge.js';
import { normalizeUrl, urlProblem, methodProblem, headerKind, isValidHeaderName, hasNoBody } from '../shared/http.js';
import { buildBody, hasBodyContent } from '../shared/body.js';
import { authParts, addQuery } from '../shared/auth.js';
import { ensureToken } from './oauth.js';

export const MAX_BODY_BYTES = 10 * 1024 * 1024;

// How send() asks the background for header rules and network errors. The
// service worker (scheduled runs) can't message itself, so it passes its handlers.
let rpc = call;
export function setRpc(fn) { rpc = fn || call; }

/**
 * Turn the draft into what will actually be sent, or list the problems.
 * @param {object} draft
 * @param {{ binary?: File, form?: Map<string, File> }} [files]  in-memory files for the body
 * @param {{ oauthToken?: object }} [ctx]  OAuth 2.0 token for the Auth tab
 */
export function prepare(draft, files = {}, ctx = {}) {
  const problems = [];
  const warnings = [];
  const method = String(draft.method || 'GET').trim();
  const mp = methodProblem(method);
  if (mp) problems.push(mp);
  const up = urlProblem(draft.url);
  if (up) problems.push(up);

  // Auth tab first: its header replaces a same-name header from the Headers tab
  const auth = authParts(draft.auth, ctx);
  problems.push(...auth.problems);
  let rows = draft.headers.filter(r => r.enabled !== false && String(r.key || '').trim());
  for (const ah of auth.headers) {
    const before = rows.length;
    rows = rows.filter(r => String(r.key).trim().toLowerCase() !== ah.key.toLowerCase());
    if (rows.length !== before) warnings.push(`Your ${ah.key} header (Headers tab) was replaced by the one from the Auth tab.`);
  }
  rows = [...rows, ...auth.headers.map(ah => ({ ...ah, enabled: true }))];

  const headers = {};
  const ruleHeaders = {};
  for (const row of rows) {
    const key = String(row.key || '').trim();
    if (!key) continue;
    if (!isValidHeaderName(key)) { problems.push(`"${key}" is not a valid header name`); continue; }
    const kind = headerKind(key);
    if (kind === 'blocked') { warnings.push(`${key} is set by the browser itself and was not sent`); continue; }
    (kind === 'rule' ? ruleHeaders : headers)[key] = String(row.value ?? '');
  }
  let body;
  if (hasNoBody(method)) {
    if (hasBodyContent(draft, files)) warnings.push(`The body was not sent: browsers can't send a body with ${method.toUpperCase()}. Switch the method to POST, PUT or PATCH.`);
  } else {
    let ctKey = Object.keys(headers).find(k => k.toLowerCase() === 'content-type');
    // an empty Content-Type row counts as "not set": the body's automatic one is used
    if (ctKey && !headers[ctKey].trim()) { delete headers[ctKey]; ctKey = undefined; }
    const built = buildBody(draft, files, ctKey ? headers[ctKey] : '');
    problems.push(...built.problems);
    warnings.push(...built.warnings);
    body = built.body;
    if (built.dropContentType && ctKey) delete headers[ctKey];
    // automatic Content-Type from the body type, unless the user set one
    else if (!ctKey && body !== undefined && built.contentType && draft.bodyType !== 'form') headers['Content-Type'] = built.contentType;
  }
  return {
    problems, warnings,
    // fetch() upper-cases the standard methods itself; custom ones are sent as typed
    request: { method, url: addQuery(normalizeUrl(draft.url), auth.query), headers, ruleHeaders, body },
  };
}

async function readBody(res) {
  if (!res.body) return { bytes: new Uint8Array(0), truncated: false };
  const reader = res.body.getReader();
  const chunks = [];
  let size = 0;
  let truncated = false;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    size += value.byteLength;
    if (size > MAX_BODY_BYTES) { truncated = true; await reader.cancel().catch(() => {}); break; }
  }
  const bytes = new Uint8Array(Math.min(size, MAX_BODY_BYTES));
  let offset = 0;
  for (const c of chunks) {
    const room = bytes.length - offset;
    if (room <= 0) break;
    bytes.set(room < c.byteLength ? c.subarray(0, room) : c, offset);
    offset += Math.min(room, c.byteLength);
  }
  return { bytes, truncated };
}

/**
 * Watch this page's own request with chrome.webRequest while it runs: fetch()
 * merges duplicate headers, hides Set-Cookie and never shows redirect hops.
 * Matched by URL (and by tab when there is one), so two Workbenches don't mix.
 */
function watchRequest(tabId, startUrl) {
  if (!chrome.webRequest?.onHeadersReceived) return null;
  const mine = (d) => String(d.initiator || '').startsWith(`chrome-extension://${chrome.runtime.id}`);
  const chain = new Set([startUrl]);
  const seen = { redirects: [], heads: new Map() };
  const onHeaders = (d) => {
    if (!mine(d) || !chain.has(d.url)) return;
    seen.heads.set(d.url, (d.responseHeaders || []).map(x => [x.name, x.value ?? '']));
  };
  const onRedirect = (d) => {
    if (!mine(d) || !chain.has(d.url)) return;
    seen.redirects.push({ url: d.url, status: d.statusCode, location: d.redirectUrl });
    chain.add(d.redirectUrl);
  };
  const filter = { urls: ['<all_urls>'], ...(typeof tabId === 'number' && tabId >= 0 ? { tabId } : {}) };
  try {
    chrome.webRequest.onHeadersReceived.addListener(onHeaders, filter, ['responseHeaders', 'extraHeaders']);
    chrome.webRequest.onBeforeRedirect.addListener(onRedirect, filter);
  } catch { return null; }
  return {
    result: (finalUrl) => ({ rawHeaders: seen.heads.get(finalUrl) || null, redirects: seen.redirects }),
    stop() {
      chrome.webRequest.onHeadersReceived.removeListener(onHeaders);
      chrome.webRequest.onBeforeRedirect.removeListener(onRedirect);
    },
  };
}

/** The browser's timing entry for a URL (DNS, connect, TLS…), if it recorded one. */
function timingFor(url) {
  try {
    const entry = performance.getEntriesByName(url, 'resource').pop() || null;
    if (performance.getEntriesByType('resource').length > 200) performance.clearResourceTimings();
    return entry ? entry.toJSON() : null;
  } catch { return null; }
}

function charsetOf(contentType) {
  const m = /charset=([^;]+)/i.exec(contentType || '');
  return m ? m[1].trim().replace(/^"|"$/g, '') : 'utf-8';
}

/**
 * @param {object} draft
 * @param {{ signal: AbortSignal }} opts
 * @returns {Promise<object>} a response record, or { error, kind }
 */
export async function send(draft, { signal, files = {} }) {
  let oauthToken = null;
  if (draft.auth?.type === 'oauth2') {
    try { oauthToken = await ensureToken(draft.auth.oauth2); }
    catch (e) { return { error: `OAuth 2.0: ${e.message}`, kind: 'invalid', warnings: [] }; }
  }
  const { request, problems, warnings } = prepare(draft, files, { oauthToken });
  if (problems.length) return { error: problems.join('\n'), kind: 'invalid', warnings };

  const settings = draft.settings;
  let ruleId = null;
  let watch = null;
  const started = performance.now();
  try {
    // One temporary rule per request: sets the protected headers the user added,
    // and removes the "Origin: chrome-extension://…" Chrome would otherwise add.
    const tab = await Promise.resolve(chrome.tabs?.getCurrent?.()).catch(() => null);
    watch = watchRequest(tab?.id ?? -1, request.url);
    ({ ruleId } = await rpc(MSG.WB_APPLY_HEADER_RULE, {
      tabId: tab?.id, url: request.url, method: request.method, headers: request.ruleHeaders, remove: ['Origin'],
    }));
    const res = await fetch(request.url, {
      method: request.method,
      headers: request.headers,
      body: request.body,
      signal,
      redirect: settings.followRedirects ? 'follow' : 'manual',
      credentials: settings.withCookies ? 'include' : 'omit',
      cache: 'no-store',
    });
    const headersAt = performance.now();

    if (res.type === 'opaqueredirect') {
      const seen = watch?.result(request.url) || {};
      return {
        rawHeaders: seen.rawHeaders || null, redirects: seen.redirects || [],
        status: 0, statusText: 'Redirect not followed', redirectBlocked: true,
        ms: Math.round(headersAt - started), ttfb: Math.round(headersAt - started), size: 0, headers: [], text: '',
        request, warnings,
      };
    }
    const { bytes, truncated } = await readBody(res);
    const ended = performance.now();
    const headers = [];
    res.headers.forEach((v, k) => headers.push([k, v]));
    const contentType = res.headers.get('content-type') || '';
    let text = '';
    try { text = new TextDecoder(charsetOf(contentType)).decode(bytes); } catch { text = new TextDecoder().decode(bytes); }
    const seen = watch?.result(res.url) || {};
    return {
      bytes,
      rawHeaders: seen.rawHeaders || null,
      redirects: seen.redirects || [],
      timing: timingFor(res.url),
      status: res.status,
      statusText: res.statusText,
      ok: res.ok,
      ms: Math.round(ended - started),
      ttfb: Math.round(headersAt - started),
      size: bytes.byteLength,
      truncated,
      headers,
      contentType,
      text,
      redirected: res.redirected,
      finalUrl: res.url,
      request,
      warnings,
      oauthToken,
    };
  } catch (err) {
    if (signal.aborted) {
      const reason = signal.reason === 'timeout' ? 'timeout' : 'cancel';
      return {
        kind: reason, warnings, request,
        error: reason === 'timeout' ? `No response after ${settings.timeoutSec} seconds (timeout). You can change the timeout in Settings.` : 'Request cancelled.',
        ms: Math.round(performance.now() - started),
      };
    }
    let detail = null;
    try { detail = await rpc(MSG.WB_GET_NET_ERROR, { url: request.url }); } catch { /* background busy */ }
    return {
      kind: 'network', warnings, request, ms: Math.round(performance.now() - started),
      error: detail?.message || 'The request failed before a response arrived (network error).',
      code: detail?.code || null,
    };
  } finally {
    watch?.stop();
    if (ruleId != null) rpc(MSG.WB_REMOVE_HEADER_RULE, { ruleId }).catch(() => {});
  }
}
