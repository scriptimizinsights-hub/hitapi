/**
 * background/storage.js — storage keys and the two storage areas we use.
 *
 *   chrome.storage.local    survives restarts: login + Local Agent switch
 *   chrome.storage.session  memory only, wiped when Chrome closes: captured
 *                           requests and detected tokens (never written to disk)
 */

export const LOCAL = Object.freeze({
  TOKEN: 'hitapi_token',
  USER: 'hitapi_user',
  AGENT_ENABLED: 'localAgentEnabled',
});

/** Key holding one tab's capture state in storage.session. */
export const tabKey = (tabId) => `tab:${tabId}`;
export const isTabKey = (key) => key.startsWith('tab:');
export const tabIdFromKey = (key) => Number(key.slice(4));

export async function getLocal(key) {
  const obj = await chrome.storage.local.get(key);
  return obj[key];
}

export function setLocal(values) {
  return chrome.storage.local.set(values);
}

export function removeLocal(keys) {
  return chrome.storage.local.remove(keys);
}

/**
 * Older versions kept detected tokens on disk in storage.local. Remove them.
 * Runs on every worker start; it's a no-op once cleaned.
 */
export async function removeLegacyData() {
  await chrome.storage.local.remove(['detectedTokens']).catch(() => {});
}
