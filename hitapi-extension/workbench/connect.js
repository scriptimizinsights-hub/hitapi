/**
 * workbench/connect.js — the user allows (or not) a HitAPI website to send
 * requests through the extension (background/workbench/web-bridge.js).
 * Opened by the website's "Connect" button; without ?origin it lists the
 * allowed websites so they can be removed.
 */

import { h, mount } from '../ui/core/dom.js';

const ORIGINS_KEY = 'wb:webOrigins';
const PENDING_KEY = 'wb:webPending';
const app = document.getElementById('app');
const origin = new URLSearchParams(location.search).get('origin') || '';

const getOrigins = async () => (await chrome.storage.local.get(ORIGINS_KEY))[ORIGINS_KEY] || [];

async function answer(allow) {
  const list = await getOrigins();
  if (allow && !list.includes(origin)) await chrome.storage.local.set({ [ORIGINS_KEY]: [...list, origin] });
  await chrome.storage.local.set({ [PENDING_KEY]: { origin, answer: allow ? 'allow' : 'deny', at: Date.now() } });
  mount(app, h('h1', {}, allow ? 'Connected' : 'Not connected'),
    h('p', {}, allow ? `${origin} can now send requests through HitAPI. Go back to the website and press Send.` : `${origin} was not allowed. You can close this tab.`),
    h('div', { class: 'cn-actions' }, h('button', { type: 'button', class: 'btn-ghost', onclick: () => window.close() }, 'Close this tab')));
  if (allow) setTimeout(() => window.close(), 1500);
}

async function paintList() {
  const list = await getOrigins();
  mount(app, h('h1', {}, 'Websites connected to HitAPI'),
    h('p', { class: 'muted' }, 'These websites can send API requests through this extension (to localhost too, without CORS limits).'),
    list.length ? h('div', { class: 'cn-list' }, list.map(o => h('div', { class: 'cn-row' }, h('span', { class: 'cn-origin' }, o),
      h('button', { type: 'button', class: 'btn-ghost btn-sm', onclick: async () => { await chrome.storage.local.set({ [ORIGINS_KEY]: list.filter(x => x !== o) }); paintList(); } }, 'Remove'))))
      : h('p', {}, 'None.'));
}

if (!origin) paintList();
else {
  let valid = false;
  try { valid = ['https:', 'http:'].includes(new URL(origin).protocol); } catch { /* bad */ }
  if (!valid) mount(app, h('h1', {}, 'Unknown website'));
  else mount(app,
    h('h1', {}, 'Allow this website to use HitAPI?'),
    h('div', { class: 'cn-origin' }, origin),
    h('p', {}, 'It wants to send API requests through this extension, so it can:'),
    h('ul', {},
      h('li', {}, 'reach APIs on localhost and your private network,'),
      h('li', {}, 'call APIs that don\'t allow other websites (no CORS limits),'),
      h('li', {}, 'set headers browsers normally block (Cookie, Origin, User-Agent).')),
    h('p', { class: 'muted' }, 'Requests run only when you press Send on that website. You can remove it later from this page (HitAPI Workbench → ☁ Backup → Connected websites).'),
    h('div', { class: 'cn-actions' },
      h('button', { type: 'button', class: 'btn-primary', id: 'allow', onclick: () => answer(true) }, 'Allow'),
      h('button', { type: 'button', class: 'btn-ghost', id: 'deny', onclick: () => answer(false) }, 'Don\'t allow')));
}
