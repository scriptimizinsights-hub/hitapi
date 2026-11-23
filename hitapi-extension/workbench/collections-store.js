/**
 * workbench/collections-store.js — collections in chrome.storage.local
 * (roadmap feature 6). The whole tree is one key: it holds requests, never
 * responses, so it stays small. Every open Workbench sees changes at once.
 */

import { normalizeTree } from '../shared/collections.js';

const KEY = 'wb:collections';

export async function loadTree() {
  try { return normalizeTree((await chrome.storage.local.get(KEY))[KEY]); } catch { return { items: [] }; }
}

export async function saveTree(tree) {
  await chrome.storage.local.set({ [KEY]: tree });
}

/**
 * Change the tree: fn(tree) edits it in place (read fresh first, so two tabs
 * don't overwrite each other's last change). Returns fn's result.
 */
export async function updateTree(fn) {
  const tree = await loadTree();
  const result = await fn(tree);
  if (result !== false) await saveTree(tree);
  return result;
}

export function onTreeChange(fn) {
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === 'local' && changes[KEY]) fn(normalizeTree(changes[KEY].newValue));
  });
}
