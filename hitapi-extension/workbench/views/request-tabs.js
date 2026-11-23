/**
 * workbench/views/request-tabs.js — Params, Headers, Body and Settings tabs.
 */

import { h, mount } from '../../ui/core/dom.js';
import { createKvTable } from './kv-table.js';
import { headerKind, isValidHeaderName, hasNoBody, COMMON_HEADERS, COMMON_VALUES } from '../../shared/http.js';
import { hasBodyContent, AUTO_CONTENT_TYPE } from '../../shared/body.js';
import { createBodyPane } from './body/body-pane.js';
import { createAuthPane } from './auth-pane.js';
import { authSummary } from '../../shared/auth.js';
import { createExtractPane } from './extract-pane.js';
import { createTestsPane } from './tests-pane.js';

function headerBadge(key) {
  if (!isValidHeaderName(key)) return { text: 'invalid name', tone: 'red', title: 'Header names can only use letters, digits and - _ . ! # $ % & \' * + ^ ` | ~' };
  const kind = headerKind(key);
  if (kind === 'rule') return { text: 'browser rule', tone: 'info', title: 'Browsers block this header in fetch(); HitAPI sets it with a temporary network rule for this request only.' };
  if (kind === 'blocked') return { text: 'not sendable', tone: 'red', title: 'The browser sets this header itself. It will not be sent.' };
  return null;
}

/**
 * inherited(): what the request's collection adds (roadmap feature 6), or null when it isn't saved in one:
 *   { headers: [{ key, value, from }], auth: { text, from } }
 */
export function createRequestTabs({ draft, files, onParams, onHeaders, onBodyChange, onAuthChange, onSettings, onMethod, inherited = () => null,
  onExtractChange = () => {}, extractTarget = () => 'Globals', onTestsChange = () => {}, onSuggestTests = () => null }) {
  let active = 'params';
  const tabBtns = {};
  const panes = {};

  const params = createKvTable({ kind: 'params', rows: draft.params, onChange: onParams });
  const headers = createKvTable({
    kind: 'headers', rows: draft.headers, onChange: onHeaders, badgeFor: headerBadge,
    keySuggestions: COMMON_HEADERS, valueSuggestions: (k) => COMMON_VALUES[String(k).trim().toLowerCase()] || [],
  });

  // Body (roadmap feature 2): type picker + editors, see views/body/
  const manualContentType = () => draft.headers.find(r => r.enabled !== false && String(r.key).trim().toLowerCase() === 'content-type' && String(r.value).trim())?.value || '';
  const body = createBodyPane({ draft, files, onChange: onBodyChange, onMethod, manualContentType });
  const bodyPane = body.el;

  // Auth (roadmap feature 3)
  const inh = inherited();
  const auth = createAuthPane({
    draft, onChange: () => { onAuthChange(); paintAuthNote(); paintTabs(); },
    inherit: inh ? { label: 'Inherit', describe: () => inherited()?.auth?.text || '' } : null,
  });
  const inheritNote = h('div', { class: 'muted small wb-autoct wb-inherit-note' });
  function paintInheritNote() {
    const now = inherited();
    const list = now?.headers || [];
    inheritNote.hidden = !list.length;
    if (!list.length) return;
    const own = new Set(draft.headers.filter(r => r.enabled !== false && String(r.key).trim()).map(r => String(r.key).trim().toLowerCase()));
    mount(inheritNote, 'Also sent, from ', h('strong', {}, list[0].from), list.some(r => r.from !== list[0].from) ? ' and its folders' : '', ': ',
      list.map((r, i) => [i ? ', ' : '', h('code', { class: own.has(r.key.toLowerCase()) ? 'wb-overridden' : '', title: own.has(r.key.toLowerCase()) ? 'Your header below replaces this one' : `${r.key}: ${r.value} (from ${r.from})` }, r.key)]),
      list.some(r => own.has(r.key.toLowerCase())) ? ' (crossed out: replaced by yours)' : '', '. Change them in the collection\'s settings.');
  }
  const authNote = h('div', { class: 'muted small wb-autoct' });
  function paintAuthNote() {
    const s = authSummary(draft.auth);
    authNote.hidden = !s;
    if (s) mount(authNote, s.where === 'query' ? 'Auth tab adds to the URL: ' : 'Auth tab adds ', h('code', {}, s.text),
      s.where === 'header' ? ' (replaces a header with the same name below).' : '.');
    else if (draft.auth.type === 'inherit' && inherited()?.auth?.text) { authNote.hidden = false; mount(authNote, inherited().auth.text); }
  }

  // Headers tab: say which Content-Type the body will add
  const autoNote = h('div', { class: 'muted small wb-autoct' });
  function paintAutoNote() {
    const t = draft.bodyType;
    const show = t !== 'none' && !hasNoBody(draft.method) && !manualContentType() && AUTO_CONTENT_TYPE[t];
    autoNote.hidden = !show;
    if (show) mount(autoNote, 'Content-Type ', h('code', {}, t === 'form' ? 'multipart/form-data' : AUTO_CONTENT_TYPE[t]), ' is added automatically from the Body tab. Add your own Content-Type header to change it.');
  }

  // Settings
  const s = draft.settings;
  const timeout = h('input', { type: 'number', min: '1', max: '600', value: String(s.timeoutSec), class: 'wb-num', 'aria-label': 'Timeout in seconds' });
  timeout.addEventListener('input', () => onSettings({ timeoutSec: Math.min(Math.max(Number(timeout.value) || 30, 1), 600) }));
  const follow = h('input', { type: 'checkbox', checked: s.followRedirects });
  follow.addEventListener('change', () => onSettings({ followRedirects: follow.checked }));
  const cookies = h('input', { type: 'checkbox', checked: s.withCookies });
  cookies.addEventListener('change', () => onSettings({ withCookies: cookies.checked }));
  const settingsPane = h('div', { class: 'wb-settings' },
    h('label', { class: 'wb-setting' }, h('span', {}, 'Timeout'), timeout, h('span', { class: 'muted' }, 'seconds')),
    h('label', { class: 'check' }, follow, h('span', {}, h('strong', {}, 'Follow redirects'),
      h('div', { class: 'muted small' }, 'Off: a 3xx response is shown as "redirect not followed" (browsers hide the Location header in that case).'))),
    h('label', { class: 'check' }, cookies, h('span', {}, h('strong', {}, 'Send this browser\'s cookies for the site'),
      h('div', { class: 'muted small' }, 'Uses the cookies you have from signing in to the site in Chrome. Off by default. A Cookie header you add yourself is always sent.'))),
    h('div', { class: 'muted small wb-settings-note' },
      'Cookie, Origin, Referer and User-Agent headers are blocked in normal web requests. The Workbench sends them with a temporary browser rule that applies to this one request and is removed when the response arrives.'),
  );

  panes.params = params.el;
  panes.headers = h('div', {}, authNote, inheritNote, autoNote, headers.el);
  panes.auth = auth.el;
  panes.body = bodyPane;
  panes.settings = settingsPane;
  // Set vars (roadmap feature 7)
  const extract = createExtractPane({ draft, onChange: () => { onExtractChange(); paintTabs(); }, target: extractTarget });
  panes.vars = extract.el;
  // Tests (roadmap feature 8)
  const tests = createTestsPane({ draft, onChange: () => { onTestsChange(); paintTabs(); }, onSuggest: onSuggestTests });
  panes.tests = tests.el;

  const counts = { params: () => draft.params.filter(r => r.enabled !== false && r.key).length, headers: () => draft.headers.filter(r => r.enabled !== false && r.key).length, vars: () => extract.count(), tests: () => tests.count() };
  const labels = { params: 'Params', auth: 'Auth', headers: 'Headers', body: 'Body', tests: 'Tests', vars: 'Set vars', settings: 'Settings' };
  const nav = h('div', { class: 'wb-tabs', role: 'tablist' }, Object.keys(labels).map(id => {
    tabBtns[id] = h('button', { type: 'button', role: 'tab', class: 'wb-tab', onclick: () => select(id) });
    return tabBtns[id];
  }));
  const holder = h('div', { class: 'wb-pane' });

  function paintTabs() {
    for (const id of Object.keys(labels)) {
      const n = counts[id]?.() || 0;
      const dot = (id === 'body' && hasBodyContent(draft, files)) || (id === 'auth' && draft.auth.type !== 'none');
      mount(tabBtns[id], labels[id], n ? h('span', { class: 'wb-count' }, String(n)) : null, dot ? h('span', { class: 'wb-dot' }) : null);
      tabBtns[id].setAttribute('aria-selected', String(id === active));
    }
  }
  function select(id) {
    active = id;
    holder.replaceChildren(panes[id]);
    paintTabs();
  }
  select('params');
  paintAutoNote();
  paintAuthNote();
  paintInheritNote();

  return {
    el: h('div', { class: 'wb-reqtabs' }, nav, holder),
    setParams(rows) { params.setRows(rows); paintTabs(); },
    setHeaders(rows) { headers.setRows(rows); paintTabs(); },
    reloadBody() { body.reload(); paintTabs(); paintAutoNote(); },
    refresh() { paintTabs(); body.refresh(); paintAutoNote(); paintAuthNote(); paintInheritNote(); },
    setOauthToken(t) { auth.setOauthToken(t); },
    showExtract(list) { extract.showResults(list); },
    refreshExtract() { extract.refresh(); },
    addTest(t) { tests.add(t); paintTabs(); },
    select,
  };
}
