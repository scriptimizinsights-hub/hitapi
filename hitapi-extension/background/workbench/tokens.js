/**
 * background/workbench/tokens.js — tokens the extension has seen while
 * capturing, offered in the Workbench's Auth tab ("Use detected token").
 * They come from capture state, which is kept in memory only
 * (chrome.storage.session) and cleared when Chrome closes.
 */

import * as store from '../capture/store.js';
import { bearerFrom } from '../../shared/headers.js';
import { getOrigin } from '../../shared/url.js';

const MAX = 20;

export async function listDetectedTokens() {
  await store.ready();
  const found = new Map(); // value → { value, origin, at }
  const add = (value, origin, at) => {
    if (!value) return;
    const prev = found.get(value);
    if (!prev || (at || 0) > (prev.at || 0)) found.set(value, { value, origin: origin || null, at: at || 0 });
  };
  for (const [, tab] of store.all()) {
    if (tab?.token?.value) add(tab.token.value, tab.token.origin, tab.token.detectedAt);
    for (const req of tab?.requests || []) add(bearerFrom(req.headers), getOrigin(req.url), req.startedAt || 0);
  }
  return [...found.values()].sort((a, b) => (b.at || 0) - (a.at || 0)).slice(0, MAX);
}
