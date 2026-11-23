/**
 * workbench/views/history-sidebar.js — the History tab of the sidebar (roadmap feature 5).
 *
 * Every request sent from the Workbench, newest first, grouped by day.
 * Search, filters (method, status, host), open, delete, clear, settings.
 * Reads only the index; the main page loads an entry when it is opened.
 */

import { h, mount, toast } from '../../ui/core/dom.js';
import { groupByDay, matchesFilter } from '../../shared/history.js';
import { formatBytes } from '../../shared/http.js';
import { removeEntry, clearAll, clearOlderThan, getSettings, setSettings } from '../history-store.js';

const PAGE = 150;   // items drawn at a time

const pathOf = (url) => {
  try { const u = new URL(url); return (u.pathname + u.search) || '/'; } catch { return url; }
};
const timeOf = (at) => new Date(at).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
const tone = (m) => (m.error ? 'err' : m.status < 300 ? 'ok' : m.status < 400 ? 'warn' : 'err');
const statusText = (m) => (m.error ? (m.error === 'timeout' ? 'Timeout' : m.error === 'cancel' ? 'Cancel' : 'Error') : String(m.status));

/**
 * @param {{ onOpen: (meta) => void }} opts
 */
export function createHistorySidebar({ onOpen }) {
  let index = [];
  let activeId = null;
  let shown = PAGE;
  let showSettings = false;
  let settings = null;
  const f = { q: '', method: '', status: '', host: '' };

  const el = h('div', { class: 'hs-pane', role: 'tabpanel', 'aria-label': 'History' });
  const listEl = h('div', { class: 'hs-list', role: 'list' });
  const countEl = h('span', { class: 'muted small' });
  const methodSel = h('select', { class: 'hs-sel', 'aria-label': 'Filter by method', onchange: (e) => { f.method = e.target.value; shown = PAGE; paintList(); } });
  const statusSel = h('select', { class: 'hs-sel', 'aria-label': 'Filter by status', onchange: (e) => { f.status = e.target.value; shown = PAGE; paintList(); } },
    [['', 'Any status'], ['2xx', '2xx'], ['3xx', '3xx'], ['4xx', '4xx'], ['5xx', '5xx'], ['error', 'Failed'], ['tests', 'Tests failed']].map(([v, l]) => h('option', { value: v }, l)));
  const hostSel = h('select', { class: 'hs-sel', 'aria-label': 'Filter by host', onchange: (e) => { f.host = e.target.value; shown = PAGE; paintList(); } });
  const search = h('input', { type: 'search', class: 'hs-search', placeholder: 'Search URL, body, response', 'aria-label': 'Search history',
    oninput: (e) => { f.q = e.target.value.trim(); shown = PAGE; paintList(); } });
  const settingsEl = h('div', { class: 'hs-settings' });

  function options(sel, values, anyLabel, current) {
    mount(sel, h('option', { value: '' }, anyLabel), values.map(v => h('option', { value: v, selected: v === current }, v)));
    if (current && !values.includes(current)) sel.append(h('option', { value: current, selected: true }, current));
  }

  function item(m) {
    return h('div', { class: `hs-item${m.id === activeId ? ' active' : ''}`, role: 'listitem' },
      h('button', { type: 'button', class: 'hs-open', title: `${m.method} ${m.url}`, dataset: { id: m.id }, onclick: () => onOpen(m) },
        h('span', { class: 'hs-method', dataset: { method: m.method } }, m.method.length > 6 ? `${m.method.slice(0, 5)}…` : m.method),
        h('span', { class: 'hs-what' },
          h('span', { class: 'hs-path mono' }, pathOf(m.url)),
          h('span', { class: 'hs-meta' },
            h('span', { class: 'hs-host' }, m.host),
            h('span', {}, timeOf(m.at)),
            m.error ? null : h('span', {}, `${m.ms} ms`),
            m.error || !m.size ? null : h('span', {}, formatBytes(m.size)),
            m.tests ? h('span', { class: `hs-tests ${m.tests.passed === m.tests.total ? 'ok' : 'bad'}`, title: 'Tests passed' }, `${m.tests.passed === m.tests.total ? '✓' : '✗'} ${m.tests.passed}/${m.tests.total}`) : null)),
        h('span', { class: `hs-status wb-code-${tone(m)}` }, statusText(m))),
      h('button', { type: 'button', class: 'hs-del', title: 'Delete from history', 'aria-label': 'Delete from history',
        onclick: async () => { await removeEntry(m.id); } }, '✕'));
  }

  function paintList() {
    const matches = index.filter(m => matchesFilter(m, f));
    const filtering = f.q || f.method || f.status || f.host;
    countEl.textContent = filtering ? `${matches.length} of ${index.length}` : `${index.length} request${index.length === 1 ? '' : 's'}`;
    if (!index.length) {
      mount(listEl, h('div', { class: 'hs-empty muted small' },
        settings && !settings.enabled ? 'History is off. Turn it on in ⚙ settings.' : 'Requests you send are kept here, so you can open and send them again.'));
      return;
    }
    if (!matches.length) {
      mount(listEl, h('div', { class: 'hs-empty muted small' }, 'Nothing matches. ',
        h('button', { type: 'button', class: 'link-btn', onclick: reset }, 'Clear filters')));
      return;
    }
    const groups = groupByDay(matches.slice(0, shown));
    mount(listEl,
      groups.map(g => [h('div', { class: 'hs-day' }, g.label), g.items.map(item)]),
      matches.length > shown ? h('button', { type: 'button', class: 'btn-ghost btn-sm hs-more', onclick: () => { shown += PAGE; paintList(); } }, `Show ${Math.min(PAGE, matches.length - shown)} more`) : null);
  }

  function reset() {
    Object.assign(f, { q: '', method: '', status: '', host: '' });
    search.value = ''; methodSel.value = ''; statusSel.value = ''; hostSel.value = '';
    shown = PAGE;
    paintList();
  }

  async function paintSettings() {
    if (!showSettings) { mount(settingsEl); return; }
    settings = await getSettings();
    const save = async (patch) => { settings = await setSettings(patch); paintList(); };
    mount(settingsEl,
      h('label', { class: 'check small' }, h('input', { type: 'checkbox', checked: settings.enabled, onchange: (e) => save({ enabled: e.target.checked }) }), ' Keep a history of requests I send'),
      h('label', { class: 'check small' }, h('input', { type: 'checkbox', checked: settings.maskSecrets, onchange: (e) => save({ maskSecrets: e.target.checked }) }),
        ' Don\'t keep secrets (Authorization, cookies, API keys, auth passwords)'),
      h('label', { class: 'small hs-skip-label' }, 'Don\'t record these hosts',
        h('textarea', { class: 'hs-skip mono', rows: 2, placeholder: 'e.g. bank.example.com, *.internal', value: settings.skipHosts,
          onchange: (e) => save({ skipHosts: e.target.value }) })),
      h('div', { class: 'muted small' }, 'History stays in this browser only. The latest 500 requests are kept (about 5 MB); response bodies over 256 KB are cut.'));
  }

  function frame() {
    mount(el,
      h('div', { class: 'hs-head' },
        countEl,
        h('span', { class: 'grow' }),
        h('button', { type: 'button', class: `btn-ghost btn-sm hs-gear${showSettings ? ' on' : ''}`, title: 'History settings', 'aria-label': 'History settings', 'aria-expanded': String(showSettings),
          onclick: () => { showSettings = !showSettings; frame(); } }, '⚙')),
      settingsEl,
      search,
      h('div', { class: 'hs-filters' }, methodSel, statusSel, hostSel),
      listEl,
      h('div', { class: 'hs-foot' },
        h('button', { type: 'button', class: 'btn-ghost btn-sm', disabled: !index.length, onclick: async () => {
          const n = await clearOlderThan(7);
          toast(n ? `Removed ${n} request${n === 1 ? '' : 's'} older than 7 days` : 'Nothing is older than 7 days', 'info');
        } }, 'Clear older than 7 days'),
        h('button', { type: 'button', class: 'btn-ghost btn-sm hs-clear', disabled: !index.length, onclick: async () => {
          if (confirm(`Delete all ${index.length} requests from history?`)) { await clearAll(); toast('History cleared', 'info'); }
        } }, 'Clear all')));
    paintSettings();
    paintList();
  }

  function setIndex(next) {
    index = next;
    options(methodSel, [...new Set(index.map(m => m.method))].sort(), 'Any method', f.method);
    options(hostSel, [...new Set(index.map(m => m.host).filter(Boolean))].sort(), 'Any host', f.host);
    frame();
  }

  function setActive(id) {
    activeId = id;
    for (const it of listEl.querySelectorAll('.hs-item')) it.classList.toggle('active', it.querySelector('.hs-open')?.dataset.id === id);
  }

  getSettings().then((s) => { settings = s; paintList(); });
  frame();
  return { el, setIndex, setActive, count: () => index.length };
}
