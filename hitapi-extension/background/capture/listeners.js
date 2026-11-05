/**
 * background/capture/listeners.js — records fetch/XHR calls from monitored tabs.
 *
 * A request is captured when it comes from a tab you started monitoring,
 * whatever server it goes to. (The old version matched the request's own
 * origin to the page's origin, so calls from app.com to api.app.com, or from
 * localhost:3000 to localhost:8080, were silently missed.)
 */

import { CAPTURE } from '../../shared/config.js';
import { isCapturable, getOrigin } from '../../shared/url.js';
import { headerListToObject, bearerFrom } from '../../shared/headers.js';
import * as store from './store.js';

const FILTER = { urls: ['<all_urls>'], types: ['xmlhttprequest'] };

// Requests in flight, by webRequest requestId. Moved into the store once done.
const pending = new Map();

const decoder = new TextDecoder();

function decodeBody(requestBody) {
  if (!requestBody) return { body: null, truncated: false };
  let body = null;
  if (requestBody.raw?.length) {
    try { body = requestBody.raw.map(part => (part.bytes ? decoder.decode(part.bytes) : '')).join(''); }
    catch { body = null; }
  } else if (requestBody.formData) {
    body = JSON.stringify(requestBody.formData);
  }
  if (body && body.length > CAPTURE.MAX_BODY_CHARS) {
    return { body: body.slice(0, CAPTURE.MAX_BODY_CHARS), truncated: true };
  }
  return { body, truncated: false };
}

function onBeforeRequest(details) {
  if (details.tabId < 0) return;
  store.ready().then(() => {
    if (!store.isActive(details.tabId) || !isCapturable(details.url)) return;
    if (details.method === 'OPTIONS') return; // CORS preflights, sent by the browser itself
    const { body, truncated } = decodeBody(details.requestBody);
    pending.set(details.requestId, {
      id: details.requestId,
      tabId: details.tabId,
      url: details.url,
      method: details.method,
      body,
      bodyTruncated: truncated,
      headers: {},
      timestamp: Date.now(),
      startedAt: details.timeStamp,
      status: null,
    });
  });
}

function onSendHeaders(details) {
  store.ready().then(() => {
    const entry = pending.get(details.requestId);
    if (!entry) return;
    entry.headers = headerListToObject(details.requestHeaders);
    const token = bearerFrom(entry.headers);
    if (token) store.setToken(entry.tabId, { value: token, origin: getOrigin(details.url), detectedAt: Date.now() });
  });
}

function onCompleted(details) {
  store.ready().then(() => {
    const entry = pending.get(details.requestId);
    if (!entry) return;
    pending.delete(details.requestId);
    entry.status = details.statusCode;
    entry.duration = Math.max(0, Math.round(details.timeStamp - entry.startedAt));
    entry.responseHeaders = headerListToObject(details.responseHeaders);
    entry.fromCache = !!details.fromCache;
    store.addRequest(entry.tabId, entry);
  });
}

function onErrorOccurred(details) {
  store.ready().then(() => {
    const entry = pending.get(details.requestId);
    if (!entry) return;
    pending.delete(details.requestId);
    // Page navigations cancel requests all the time; that isn't interesting.
    if (details.error === 'net::ERR_ABORTED') return;
    entry.status = 0;
    entry.error = details.error; // e.g. net::ERR_CONNECTION_REFUSED, CORS failures
    entry.duration = Math.max(0, Math.round(details.timeStamp - entry.startedAt));
    store.addRequest(entry.tabId, entry);
  });
}

/** Must be called synchronously at worker start-up so events wake the worker. */
export function registerCaptureListeners() {
  chrome.webRequest.onBeforeRequest.addListener(onBeforeRequest, FILTER, ['requestBody']);
  chrome.webRequest.onSendHeaders.addListener(onSendHeaders, FILTER, ['requestHeaders', 'extraHeaders']);
  chrome.webRequest.onCompleted.addListener(onCompleted, FILTER, ['responseHeaders', 'extraHeaders']);
  chrome.webRequest.onErrorOccurred.addListener(onErrorOccurred, FILTER);

  chrome.tabs.onRemoved.addListener((tabId) => {
    for (const [id, entry] of pending) if (entry.tabId === tabId) pending.delete(id);
    store.forget(tabId);
  });
}
