/**
 * workbench/state.js — the request being edited, saved as a draft.
 *
 * The draft is written to chrome.storage.local (WB.DRAFT) shortly after every
 * change, so closing the tab or restarting Chrome loses nothing.
 * Bodies: see shared/body.js (bodyType + bodies; files are never saved).
 */

import { emptyBodies, normalizeBodies, detectBody } from '../shared/body.js';
import { emptyAuth, normalizeAuth } from '../shared/auth.js';

const INCOMING_KEY = 'wb:incoming';
const WELCOME_KEY = 'wb:welcome';
const SAVE_DELAY_MS = 400;

// The Workbench tab and the one inside the DevTools panel keep separate drafts,
// so editing one never overwrites the other.
export const EMBED = new URLSearchParams(location.search).get('embed') === 'panel' ? 'panel' : null;
const DRAFT_KEY = EMBED ? 'wb:draft:panel' : 'wb:draft';
const TARGET = EMBED ? 'panel' : 'tab';
const forMe = (incoming) => (incoming?.target || 'tab') === TARGET;

export const DEFAULT_SETTINGS = Object.freeze({ timeoutSec: 30, followRedirects: true, withCookies: false });

export function emptyDraft() {
  return {
    method: 'GET',
    url: '',
    params: [],
    headers: [],
    bodyType: 'json',
    bodies: emptyBodies(),
    auth: emptyAuth(),
    settings: { ...DEFAULT_SETTINGS },
    extract: [],
    tests: [],
    source: null,
  };
}

/** Fill in anything missing (older drafts, captured requests). */
export function normalizeDraft(d) {
  const base = emptyDraft();
  const draft = { ...base, ...(d || {}) };
  draft.method = String(draft.method || 'GET').trim() || 'GET';
  draft.params = Array.isArray(draft.params) ? draft.params : [];
  draft.headers = Array.isArray(draft.headers) ? draft.headers : [];
  draft.settings = { ...DEFAULT_SETTINGS, ...(draft.settings || {}) };
  draft.extract = Array.isArray(draft.extract) ? draft.extract : [];
  draft.tests = Array.isArray(draft.tests) ? draft.tests : [];
  if (!d?.bodies) {
    // a captured request, a cURL import or a draft from before body types: one raw body string
    const ct = draft.headers.find(r => r.enabled !== false && String(r.key).trim().toLowerCase() === 'content-type')?.value || '';
    Object.assign(draft, detectBody(typeof draft.body === 'string' ? draft.body : '', ct));
  } else {
    draft.bodies = normalizeBodies(draft.bodies);
    draft.bodyType = draft.bodyType || 'json';
  }
  delete draft.body;
  delete draft.autoSend; delete draft.target; delete draft.at;   // hand-over fields, not part of the request
  draft.auth = normalizeAuth(draft.auth);
  return draft;
}

export async function loadDraft() {
  try {
    const got = await chrome.storage.local.get([DRAFT_KEY, INCOMING_KEY]);
    if (got[INCOMING_KEY] && forMe(got[INCOMING_KEY])) {
      await chrome.storage.local.remove(INCOMING_KEY);
      return { draft: normalizeDraft(got[INCOMING_KEY]), incoming: true, autoSend: !!got[INCOMING_KEY].autoSend };
    }
    return { draft: normalizeDraft(got[DRAFT_KEY]), incoming: false };
  } catch {
    return { draft: emptyDraft(), incoming: false };
  }
}

let timer = null;
export function saveDraftSoon(draft) {
  clearTimeout(timer);
  timer = setTimeout(() => {
    chrome.storage.local.set({ [DRAFT_KEY]: draft }).catch(() => { /* storage full or unavailable */ });
  }, SAVE_DELAY_MS);
}

/** Calls fn(draft, { autoSend }) when a captured request is sent to an already-open Workbench. */
export function onIncoming(fn) {
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== 'local' || !changes[INCOMING_KEY]?.newValue) return;
    const value = changes[INCOMING_KEY].newValue;
    if (!forMe(value)) return;
    chrome.storage.local.remove(INCOMING_KEY).catch(() => {});
    fn(normalizeDraft(value), { autoSend: !!value.autoSend });
  });
}

/** True once after install: show the "Start here" note. */
export async function shouldWelcome() {
  if (EMBED) return false;
  try { return !!(await chrome.storage.local.get(WELCOME_KEY))[WELCOME_KEY]; } catch { return false; }
}

export function dismissWelcome() {
  chrome.storage.local.remove(WELCOME_KEY).catch(() => {});
}
