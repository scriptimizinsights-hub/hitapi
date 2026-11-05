/**
 * ui/core/bridge.js — how the popup / DevTools panel talk to the background.
 *
 *   call(type, payload)  → resolves with data, or THROWS an Error (err.code set)
 *   subscribe(tabId, fn) → live events for that tab; reconnects by itself
 *
 * The old popup helper returned { success:false } instead of throwing, so
 * every try/catch around it was dead code and failures showed "✓" toasts.
 */

import { LIVE_PORT } from '../../shared/config.js';

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

export class BridgeError extends Error {
  constructor(message, code = null) {
    super(message);
    this.name = 'BridgeError';
    this.code = code;
  }
}

export async function call(type, payload = {}) {
  let res;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      res = await chrome.runtime.sendMessage({ type, ...payload });
      if (res) break;
    } catch (e) {
      // The service worker may be starting up; give it a moment.
      if (attempt === 2) throw new BridgeError('The extension is restarting. Try again in a moment.');
    }
    await sleep(250 * (attempt + 1));
  }
  if (!res) throw new BridgeError('No reply from the extension. Try again.');
  if (!res.success) throw new BridgeError(res.error || 'Something went wrong', res.code || null);
  return res.data;
}

/**
 * @param {number} tabId
 * @param {(msg: {event: string}) => void} onEvent  also gets {event:'reconnected'}
 * @returns {() => void} unsubscribe
 */
export function subscribe(tabId, onEvent) {
  let port = null;
  let closed = false;

  const connect = (isReconnect) => {
    if (closed) return;
    port = chrome.runtime.connect({ name: LIVE_PORT });
    port.postMessage({ subscribe: tabId });
    port.onMessage.addListener(onEvent);
    port.onDisconnect.addListener(() => {
      // Chrome stopped / restarted the service worker. Reconnect and resync.
      void chrome.runtime.lastError;
      if (!closed) setTimeout(() => connect(true), 400);
    });
    if (isReconnect) onEvent({ event: 'reconnected' });
  };

  connect(false);
  return () => { closed = true; try { port?.disconnect(); } catch { /* already gone */ } };
}
