/**
 * background/workbench/web-bridge.js — lets the HitAPI website (hitapi.dev)
 * send requests through the extension (web Workbench, "HitAPI extension" mode).
 *
 * Why: a web page can't reach localhost through a server, is blocked by CORS
 * and can't set Cookie/Origin/User-Agent. The extension can. The website asks,
 * the extension runs the request with the Workbench's own send() and returns
 * the response.
 *
 * Only pages listed in manifest "externally_connectable" can talk to it, and a
 * site can send requests only after the user allows it once on the extension's
 * own approval page (workbench/connect.html). Allowed sites: wb:webOrigins.
 *
 * Messages (chrome.runtime.sendMessage(extensionId, msg) from the page):
 *   { type: 'HITAPI_PING' }        → { ok, version, allowed }
 *   { type: 'HITAPI_CONNECT' }     → { ok, allowed }  (opens the approval page if needed; waits up to 2 min)
 *   { type: 'HITAPI_SEND', draft, files? }  → { ok, response } | { ok: false, code, error }
 *   { type: 'HITAPI_CANCEL', id }  → { ok }
 *   { type: 'HITAPI_DISCONNECT' }  → { ok }
 *   { type: 'HITAPI_AGENT_WAKE', ms? } → { ok, enabled, listening }  (2.1.2: a flow run started on the website;
 *                                    the Local Agent asks for jobs for ms, default 2 min. No approval needed:
 *                                    it only makes the agent check this user's own jobs.)
 *   files: { binary?: { name, type, base64 }, form?: { [rowId]: { name, type, base64 } } }
 */

import './scheduler.js';   // sets up send()'s direct background calls (setRpc)
import { send } from '../../workbench/send.js';
import { normalizeBodies } from '../../shared/body.js';
import { normalizeAuth } from '../../shared/auth.js';
import { wake as wakeAgent } from '../agent/local-agent.js';

export const ORIGINS_KEY = 'wb:webOrigins';
const PENDING_KEY = 'wb:webPending';     // origin waiting for an answer on the approval page
const APPROVE_WAIT_MS = 2 * 60 * 1000;
const running = new Map();               // request id → AbortController

const BINARY_TYPE = /^(image\/|audio\/|video\/|font\/|application\/(pdf|octet-stream|zip|gzip|wasm))/i;

async function allowedOrigins() {
  return (await chrome.storage.local.get(ORIGINS_KEY))[ORIGINS_KEY] || [];
}
const originOf = (sender) => { try { return new URL(sender.url || sender.origin).origin; } catch { return ''; } };

function fileFrom(f) {
  if (!f?.base64) return null;
  const bin = atob(f.base64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new File([bytes], f.name || 'file', { type: f.type || 'application/octet-stream' });
}

function toBase64(bytes) {
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
  return btoa(bin);
}

/** A draft from the website → what send() expects (the page can't be trusted to send a complete draft). */
function cleanDraft(d) {
  return {
    method: String(d?.method || 'GET').slice(0, 32),
    url: String(d?.url || ''),
    headers: (Array.isArray(d?.headers) ? d.headers : []).slice(0, 200).map(r => ({ key: String(r?.key ?? ''), value: String(r?.value ?? ''), enabled: r?.enabled !== false })),
    bodyType: String(d?.bodyType || 'none'),
    bodies: normalizeBodies(d?.bodies),
    auth: normalizeAuth(d?.auth),
    settings: { timeoutSec: Math.min(Math.max(Number(d?.settings?.timeoutSec) || 30, 1), 300), followRedirects: d?.settings?.followRedirects !== false, withCookies: !!d?.settings?.withCookies },
  };
}

async function runSend(msg) {
  const draft = cleanDraft(msg.draft);
  const files = { binary: fileFrom(msg.files?.binary), form: new Map() };
  for (const [id, f] of Object.entries(msg.files?.form || {})) { const file = fileFrom(f); if (file) files.form.set(id, file); }
  const ctrl = new AbortController();
  const id = String(msg.id || '');
  if (id) running.set(id, ctrl);
  const t = setTimeout(() => ctrl.abort('timeout'), draft.settings.timeoutSec * 1000);
  try {
    const res = await send(draft, { signal: ctrl.signal, files });
    const { bytes, oauthToken, ...rest } = res;
    const out = { ...rest };
    // binary bodies (images, PDF…) go back as base64 so the page can preview them
    if (bytes && BINARY_TYPE.test(res.contentType || '')) out.body_base64 = toBase64(bytes);
    if (out.request?.body && typeof out.request.body !== 'string') out.request = { ...out.request, body: '(file or form data)' };
    return { ok: true, response: out };
  } finally {
    clearTimeout(t);
    if (id) running.delete(id);
  }
}

function waitForAnswer(origin) {
  return new Promise((resolve) => {
    const done = (v) => { chrome.storage.onChanged.removeListener(onChange); clearTimeout(timer); resolve(v); };
    const onChange = (changes, area) => {
      if (area !== 'local') return;
      if (changes[ORIGINS_KEY] && (changes[ORIGINS_KEY].newValue || []).includes(origin)) done(true);
      else if (changes[PENDING_KEY] && changes[PENDING_KEY].newValue?.origin === origin && changes[PENDING_KEY].newValue?.answer === 'deny') done(false);
    };
    const timer = setTimeout(() => done(false), APPROVE_WAIT_MS);
    chrome.storage.onChanged.addListener(onChange);
  });
}

async function handle(msg, sender) {
  const origin = originOf(sender);
  if (!origin) return { ok: false, code: 'bad_origin', error: 'Unknown website' };
  const allowed = (await allowedOrigins()).includes(origin);
  switch (msg?.type) {
    case 'HITAPI_PING':
      return { ok: true, version: chrome.runtime.getManifest().version, allowed };
    case 'HITAPI_CONNECT': {
      if (allowed) return { ok: true, allowed: true };
      await chrome.storage.local.set({ [PENDING_KEY]: { origin, at: Date.now() } });
      await chrome.tabs.create({ url: chrome.runtime.getURL(`workbench/connect.html?origin=${encodeURIComponent(origin)}`), active: true });
      return { ok: true, allowed: await waitForAnswer(origin) };
    }
    case 'HITAPI_DISCONNECT':
      await chrome.storage.local.set({ [ORIGINS_KEY]: (await allowedOrigins()).filter(o => o !== origin) });
      return { ok: true };
    case 'HITAPI_CANCEL':
      running.get(String(msg.id || ''))?.abort('cancel');
      return { ok: true };
    case 'HITAPI_AGENT_WAKE': {
      const st = await wakeAgent(msg.ms);
      return { ok: true, enabled: st.enabled, listening: st.listening };
    }
    case 'HITAPI_SEND':
      if (!allowed) return { ok: false, code: 'not_allowed', error: `Allow ${origin} in the HitAPI extension first.` };
      return runSend(msg);
    default:
      return { ok: false, code: 'unknown', error: `Unknown message: ${msg?.type}` };
  }
}

export function registerWebBridge() {
  chrome.runtime.onMessageExternal?.addListener((msg, sender, sendResponse) => {
    handle(msg, sender).then(sendResponse, (e) => sendResponse({ ok: false, code: 'error', error: e?.message || 'Something went wrong' }));
    return true;
  });
}
