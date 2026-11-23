/**
 * background/workbench/open.js — opens the Request Workbench tab, optionally
 * with a captured request loaded into it.
 *
 * The request is handed over through chrome.storage.local (WB.INCOMING): the
 * Workbench reads it on load, or picks it up live if it is already open.
 * `target` says which Workbench should take it: the full tab, or the one
 * inside the DevTools panel.
 */

import { WB, setLocal } from '../storage.js';
import { findRequest } from '../capture/service.js';
import { importHeaders } from '../../shared/http.js';

const PAGE = 'workbench/workbench.html';

/** A captured request → a Workbench draft. */
export function draftFromCapture(req) {
  const { rows: headers } = importHeaders(Object.entries(req.headers || {}));
  return {
    method: String(req.method || 'GET').toUpperCase(),
    url: req.url,
    headers,
    body: req.body || '',
    source: { kind: 'capture', note: req.bodyTruncated ? 'The captured body was cut off at 10,000 characters.' : null },
  };
}

// First request shown to new users: HitAPI's public demo mock server.
export const WELCOME_DRAFT = Object.freeze({
  method: 'GET',
  url: 'https://services.hitapi.dev/mock/demo/users/42',
  params: [],
  headers: [{ key: 'Accept', value: 'application/json', enabled: true }],
  body: '',
});

/**
 * Open (or focus) the Workbench. With tabId + requestId, load that captured request.
 * autoSend: the Workbench sends it as soon as it loads (the popup's Resend button).
 * target 'panel' only hands the request to the DevTools panel's Workbench (no tab is opened).
 */
export async function openWorkbench({ tabId = null, requestId = null, target = 'tab', welcome = false, autoSend = false } = {}) {
  if (requestId != null) {
    const req = await findRequest(tabId, requestId);
    await setLocal({ [WB.INCOMING]: { ...draftFromCapture(req), target, autoSend: !!autoSend, at: Date.now() } });
  }
  if (target === 'panel') return { tabId: null, reused: true };
  if (welcome) {
    const current = await chrome.storage.local.get(WB.DRAFT);
    const values = { [WB.WELCOME]: true };
    if (!current[WB.DRAFT]?.url) values[WB.DRAFT] = { ...WELCOME_DRAFT };
    await setLocal(values);
  }
  const url = chrome.runtime.getURL(PAGE);
  const [existing] = await chrome.tabs.query({ url });
  if (existing) {
    await chrome.tabs.update(existing.id, { active: true });
    if (existing.windowId != null) await chrome.windows.update(existing.windowId, { focused: true }).catch(() => {});
    return { tabId: existing.id, reused: true };
  }
  const tab = await chrome.tabs.create({ url });
  return { tabId: tab.id, reused: false };
}
