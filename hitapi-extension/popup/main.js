/**
 * popup/main.js — toolbar popup entry: find the tab it was opened on, start the app.
 *
 * `?tabId=123` opens the popup for a specific tab (used by automated tests and
 * handy for debugging the popup in a normal browser tab).
 */

import { startApp } from '../ui/app.js';

async function currentTabId() {
  const fromUrl = Number(new URLSearchParams(location.search).get('tabId'));
  if (Number.isInteger(fromUrl) && fromUrl > 0) return fromUrl;
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  return tab?.id ?? null;
}

currentTabId().then(tabId => startApp(document.getElementById('app'), tabId));
