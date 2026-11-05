/**
 * ui/views/capture-panel.js — the Capture tab: detected token and the list of
 * captured requests, updated in place as new requests arrive.
 */

import { h, toast, copyText } from '../core/dom.js';
import { mask } from '../../shared/headers.js';
import { createRequestRow } from './request-row.js';

export function createCapturePanel(store, actions) {
  const tokenSlot = h('div');
  const headerSlot = h('div');
  const list = h('div', { class: 'req-list' });
  const emptySlot = h('div');
  const el = h('div', { class: 'capture-panel' }, tokenSlot, headerSlot, emptySlot, list);
  const rows = new Map(); // request id → row

  function paintToken() {
    const token = store.state.monitor?.token;
    if (!token?.value) { tokenSlot.replaceChildren(); return; }
    tokenSlot.replaceChildren(h('div', { class: 'card card-accent token-card', id: 'token-card' },
      h('div', { class: 'grow min0' },
        h('div', { class: 'small' }, '🔑 Bearer token detected'),
        h('div', { class: 'small muted mono ellipsis', title: token.origin || '' }, `${mask(token.value)} · ${token.origin || ''}`),
      ),
      h('button', { id: 'copy-token', class: 'btn-ghost btn-sm', onclick: async () => {
        toast(await copyText(token.value) ? '✓ Token copied' : '⚠ Could not copy', 'info');
      } }, 'Copy'),
    ));
  }

  function paintEmptyAndHeader() {
    const { monitor, requests } = store.state;
    if (!monitor?.active && !requests.length) {
      headerSlot.replaceChildren();
      emptySlot.replaceChildren(h('div', { class: 'empty' },
        h('div', { class: 'icon' }, '📡'),
        h('p', {}, 'Click ', h('strong', {}, '▶ Start'), ' to capture this tab\'s API calls,', h('br'), 'including calls to other domains.'),
        h('p', { class: 'small' }, 'Capture keeps running while you use other tabs.'),
      ));
      return;
    }
    if (!requests.length) {
      headerSlot.replaceChildren();
      emptySlot.replaceChildren(h('div', { class: 'empty' },
        h('div', { class: 'icon' }, '⏳'),
        h('p', {}, 'Capturing… use the page to see its API calls.'),
      ));
      return;
    }
    emptySlot.replaceChildren();
    headerSlot.replaceChildren(h('div', { class: 'list-head' },
      h('div', { class: 'label' }, `${requests.length} request${requests.length === 1 ? '' : 's'} captured`),
      h('button', { id: 'clear-btn', class: 'btn-ghost btn-sm', onclick: actions.clearCaptured }, 'Clear'),
    ));
  }

  /** Keyed update: keep existing rows, add new ones, drop removed ones, keep order. */
  function paintList() {
    const { requests } = store.state;
    const keep = new Set(requests.map(r => r.id));
    for (const [id, row] of rows) {
      if (!keep.has(id)) { row.el.remove(); rows.delete(id); }
    }
    let prev = null;
    for (const req of requests) {
      let row = rows.get(req.id);
      if (!row) { row = createRequestRow(req, { store, actions }); rows.set(req.id, row); }
      else row.update(req);
      const shouldFollow = prev ? prev.el.nextSibling : list.firstChild;
      if (shouldFollow !== row.el) list.insertBefore(row.el, prev ? prev.el.nextSibling : list.firstChild);
      prev = row;
    }
  }

  function refreshRows() {
    for (const row of rows.values()) row.refresh();
  }

  paintToken();
  paintEmptyAndHeader();
  paintList();

  return {
    el,
    onRequests() { paintEmptyAndHeader(); paintList(); },
    onMonitor() { paintToken(); paintEmptyAndHeader(); },
    onSuites() { refreshRows(); },
  };
}
