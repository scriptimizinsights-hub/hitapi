/**
 * Web Workbench (W3) — saved requests in collections and folders, kept in this
 * browser (localStorage). The tree has the same shape as the HitAPI
 * extension's `wb:collections`, so a collection moves between the two with
 * export / import (and with account sync, W8).
 *
 * The whole tree is one JSON value: it holds requests, never responses.
 * Every open tab sees changes at once (the storage event).
 */

import { normalizeTree } from '@hitapi/shared/collections.js';

export const KEY = 'hitapi:web:collections';
export const WARN_BYTES = 4 * 1024 * 1024;   // browsers give a site about 5 MB

const ls = () => { try { return typeof window !== 'undefined' ? window.localStorage : null; } catch { return null; } };
const listeners = new Set();

export function loadTree() {
  try { return normalizeTree(JSON.parse(ls()?.getItem(KEY) || 'null')); } catch { return { items: [] }; }
}

/** Throws a readable error when the browser's storage is full or blocked. Returns the size in bytes. */
export function saveTree(tree) {
  const store = ls();
  if (!store) throw new Error('Saving isn\'t available in this browser mode (private window or storage blocked).');
  const text = JSON.stringify({ items: tree.items });
  try { store.setItem(KEY, text); } catch {
    throw new Error('This browser\'s storage is full, so it wasn\'t saved. Export a collection to a file, then delete it here to make room.');
  }
  for (const fn of listeners) fn(normalizeTree({ items: tree.items }));
  return text.length;
}

/**
 * Change the tree: fn(tree) edits it in place. It reads fresh first, so two
 * tabs don't overwrite each other's last change. fn returning false = no change.
 * @returns {{ result, tree, bytes }}
 */
export function updateTree(fn) {
  const tree = loadTree();
  const result = fn(tree);
  if (result === false) return { result, tree, bytes: 0 };
  const bytes = saveTree(tree);
  return { result, tree: normalizeTree(tree), bytes };
}

/** fn(tree) after any change, in this tab or another one. Returns an unsubscribe function. */
export function onTreeChange(fn) {
  listeners.add(fn);
  const onStorage = (e) => { if (e.key === KEY) fn(loadTree()); };
  if (typeof window !== 'undefined') window.addEventListener('storage', onStorage);
  return () => { listeners.delete(fn); if (typeof window !== 'undefined') window.removeEventListener('storage', onStorage); };
}

export const storageBytes = () => { try { return (ls()?.getItem(KEY) || '').length; } catch { return 0; } };
