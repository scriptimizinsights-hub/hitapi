/**
 * background/live.js — pushes changes to open popups / DevTools panels.
 *
 * A UI connects a port named LIVE_PORT and says which tab it is showing:
 *   port.postMessage({ subscribe: tabId })
 * It then receives { event, ...payload } messages (see EVENT in shared/messages.js).
 * This replaces the old "re-fetch and redraw everything every 1.5 s" loop.
 */

import { LIVE_PORT } from '../shared/config.js';

const subscribers = new Set(); // { port, tabId }

export function registerLivePort() {
  chrome.runtime.onConnect.addListener((port) => {
    if (port.name !== LIVE_PORT) return;
    const sub = { port, tabId: null };
    subscribers.add(sub);
    port.onMessage.addListener((msg) => {
      if (msg && 'subscribe' in msg) sub.tabId = msg.subscribe;
    });
    port.onDisconnect.addListener(() => subscribers.delete(sub));
  });
}

/**
 * @param {string} event   EVENT.*
 * @param {object} payload
 * @param {number|null} tabId  only subscribers of this tab; null = everyone
 */
export function publish(event, payload = {}, tabId = null) {
  for (const sub of subscribers) {
    if (tabId !== null && sub.tabId !== tabId) continue;
    try { sub.port.postMessage({ event, ...payload }); } catch { subscribers.delete(sub); }
  }
}
