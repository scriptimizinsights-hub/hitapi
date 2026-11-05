/**
 * background/capture/service.js — capture actions the UI can ask for.
 */

import { getOrigin, isWebUrl } from '../../shared/url.js';
import * as store from './store.js';

async function getTab(tabId) {
  if (!Number.isInteger(tabId)) throw new Error('No tab selected');
  try { return await chrome.tabs.get(tabId); }
  catch { throw new Error('That tab is no longer open'); }
}

export async function getTabInfo(tabId) {
  const tab = await getTab(tabId);
  return {
    tabId,
    url: tab.url || '',
    title: tab.title || '',
    origin: isWebUrl(tab.url) ? getOrigin(tab.url) : null,
    isWebPage: isWebUrl(tab.url),
  };
}

export async function startMonitoring(tabId) {
  const tab = await getTab(tabId);
  if (!isWebUrl(tab.url)) throw new Error('Open a website in this tab first');
  await store.ready();
  await store.start(tabId, getOrigin(tab.url));
  return store.snapshot(tabId);
}

export async function stopMonitoring(tabId) {
  await store.ready();
  await store.stop(tabId);
  return store.snapshot(tabId);
}

export async function getMonitorState(tabId) {
  await store.ready();
  return store.snapshot(tabId);
}

export async function clearCaptured(tabId) {
  await store.ready();
  await store.clear(tabId);
  return { ok: true };
}

/** Look up one captured request (the UI sends only its id). */
export async function findRequest(tabId, requestId) {
  await store.ready();
  const req = store.get(tabId)?.requests.find(r => r.id === requestId);
  if (!req) throw new Error('That request is no longer in the capture list');
  return req;
}
