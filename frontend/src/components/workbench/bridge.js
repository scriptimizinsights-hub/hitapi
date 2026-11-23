/**
 * Web Workbench ↔ HitAPI Chrome extension (2.1+).
 * The extension lists hitapi.dev in "externally_connectable", so this page can
 * message it with chrome.runtime.sendMessage(extensionId, …). It sends a
 * request only after the user allowed this website once in the extension.
 */

export const STORE_EXTENSION_ID = 'jkmpfjphnaffcppjoafmkdjkgjhobhha';
export const STORE_URL = `https://chromewebstore.google.com/detail/${STORE_EXTENSION_ID}`;
export const MIN_VERSION = '2.1.0';

/** Developers testing an unpacked build can set localStorage['hitapi:extensionId']. */
export function extensionId() {
  try { return localStorage.getItem('hitapi:extensionId') || STORE_EXTENSION_ID; } catch { return STORE_EXTENSION_ID; }
}

function message(msg, timeoutMs = 4000) {
  return new Promise((resolve) => {
    const rt = typeof window !== 'undefined' ? window.chrome?.runtime : null;
    if (!rt?.sendMessage) { resolve(null); return; }
    let done = false;
    const finish = (v) => { if (!done) { done = true; resolve(v); } };
    const t = timeoutMs ? setTimeout(() => finish(null), timeoutMs) : null;
    try {
      rt.sendMessage(extensionId(), msg, (reply) => {
        if (t) clearTimeout(t);
        // reading lastError keeps Chrome from logging "Unchecked runtime.lastError"
        if (window.chrome.runtime.lastError) finish(null); else finish(reply ?? null);
      });
    } catch { if (t) clearTimeout(t); finish(null); }
  });
}

const newer = (a, b) => {
  const x = String(a).split('.').map(Number); const y = String(b).split('.').map(Number);
  for (let i = 0; i < 3; i++) { if ((x[i] || 0) !== (y[i] || 0)) return (x[i] || 0) > (y[i] || 0); }
  return true;
};

/** { installed, version, allowed, outdated } */
export async function pingExtension() {
  const r = await message({ type: 'HITAPI_PING' }, 1500);
  if (!r?.ok) return { installed: false, version: null, allowed: false, outdated: false };
  return { installed: true, version: r.version, allowed: !!r.allowed, outdated: !newer(r.version, MIN_VERSION) };
}

/** Opens the extension's approval page; resolves when the user answers (or after 2 minutes). */
export async function connectExtension() {
  const r = await message({ type: 'HITAPI_CONNECT' }, 0);
  return !!r?.allowed;
}

export async function disconnectExtension() {
  await message({ type: 'HITAPI_DISCONNECT' });
}

export function cancelViaExtension(id) {
  return message({ type: 'HITAPI_CANCEL', id }, 2000);
}

/** @returns {Promise<object>} the extension's response record, or { error, kind } */
export async function sendViaExtension(payload) {
  const r = await message({ type: 'HITAPI_SEND', ...payload }, 0);
  if (!r) return { error: 'The HitAPI extension did not answer. Check that it is installed and enabled, then reload this page.', kind: 'extension' };
  if (!r.ok) return { error: r.error || 'The extension could not send the request.', kind: r.code === 'not_allowed' ? 'not_allowed' : 'extension' };
  return r.response;
}
