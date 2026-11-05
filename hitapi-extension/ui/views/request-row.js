/**
 * ui/views/request-row.js — one captured request, with its actions panel.
 *
 * Rows are long-lived DOM nodes: live updates change only what changed, so
 * an open panel, a chosen suite or a half-typed name is never wiped out
 * (the old popup redrew everything every 1.5 s).
 */

import { h, withBusy } from '../core/dom.js';
import { pathOf } from '../../shared/url.js';
import { bearerFrom } from '../../shared/headers.js';

const NEW_SUITE = '__new__';

function statusClass(status) {
  if (!status) return 'status-err';
  if (status < 300) return 'status-ok';
  if (status < 400) return 'status-warn';
  return 'status-err';
}

export function createRequestRow(initialReq, { store, actions }) {
  let req = initialReq;
  let expanded = false;
  let selectedSuite = null;
  let showBugForm = false;

  const statusEl = h('span');
  const timeEl = h('span', { class: 'req-time' });
  const addedEl = h('span', { class: 'added-tag', title: 'Added to a suite' }, '✓');
  const panel = h('div', { class: 'req-actions', hidden: true });
  const head = h('div', {
    class: 'req-row', role: 'button', tabindex: '0', dataset: { toggle: req.id },
    onclick: () => toggle(),
    onkeydown: (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggle(); } },
  },
    h('span', { class: `m m-${req.method}` }, req.method),
    h('span', { class: 'url', title: req.url }, pathOf(req.url)),
    timeEl, statusEl, addedEl,
  );
  const el = h('div', { class: 'req-item', dataset: { id: req.id } }, head, panel);

  function paintHead() {
    statusEl.className = statusClass(req.status);
    statusEl.textContent = req.status === 0 ? 'ERR' : (req.status ?? '…');
    statusEl.title = req.error || '';
    timeEl.textContent = req.duration != null ? `${req.duration}ms` : '';
    const added = store.state.addedIds.has(req.id);
    addedEl.hidden = !added;
    el.classList.toggle('added', added);
  }

  function toggle() {
    expanded = !expanded;
    head.setAttribute('aria-expanded', String(expanded));
    if (expanded) paintPanel();
    panel.hidden = !expanded;
  }

  function suiteSection() {
    const { suites } = store.state;
    const token = bearerFrom(req.headers);
    if (!selectedSuite || (selectedSuite !== NEW_SUITE && !suites.some(s => s.id === selectedSuite))) {
      selectedSuite = suites[0]?.id || NEW_SUITE;
    }

    const select = h('select', { class: 'grow', 'aria-label': 'Suite', dataset: { suiteSelect: req.id } },
      suites.map(s => h('option', { value: s.id, selected: s.id === selectedSuite }, s.name)),
      h('option', { value: NEW_SUITE, selected: selectedSuite === NEW_SUITE }, '➕ New suite…'),
    );
    const name = h('input', {
      type: 'text', placeholder: 'New suite name', dataset: { suiteName: req.id },
      hidden: selectedSuite !== NEW_SUITE,
    });
    const useToken = h('input', { type: 'checkbox', checked: true, dataset: { useToken: req.id } });
    const tokenOption = token ? h('label', { class: 'check small muted', hidden: selectedSuite !== NEW_SUITE }, useToken,
      ' Save this request\'s login token on the new suite, so its steps run as you') : null;
    const add = h('button', { type: 'submit', class: 'btn-primary btn-sm', dataset: { add: req.id } }, '+ Add');

    select.addEventListener('change', () => {
      selectedSuite = select.value;
      name.hidden = selectedSuite !== NEW_SUITE;
      if (tokenOption) tokenOption.hidden = name.hidden;
      if (!name.hidden) name.focus();
    });

    const submit = async (e) => {
      e.preventDefault();
      const isNew = selectedSuite === NEW_SUITE;
      if (isNew && !name.value.trim()) { name.focus(); return; }
      const ok = await withBusy(add, () => actions.addToSuite(req.id, {
        suiteId: isNew ? null : selectedSuite,
        newSuiteName: isNew ? name.value.trim() : null,
        useToken: isNew && token ? useToken.checked : false,
      }));
      if (ok) { if (isNew) selectedSuite = null; paintHead(); paintPanel(); }
    };

    return h('form', { class: 'stack', onsubmit: submit },
      h('div', { class: 'label' }, store.state.addedIds.has(req.id) ? 'Add to a suite again' : 'Add to a test suite'),
      h('div', { class: 'row' }, select, add),
      name,
      tokenOption,
    );
  }

  function bugSection() {
    if (!showBugForm) {
      return h('button', { type: 'button', class: 'btn-ghost btn-sm', dataset: { bug: req.id },
        onclick: () => { showBugForm = true; paintPanel(); } }, '🐛 Report as bug');
    }
    const severity = h('select', { 'aria-label': 'Severity', dataset: { bugSeverity: req.id } },
      ['low', 'medium', 'high', 'critical'].map(s => h('option', { value: s, selected: s === (req.status >= 500 || req.status === 0 ? 'high' : 'medium') }, s)));
    const note = h('textarea', { rows: '2', placeholder: 'What went wrong? (optional)', dataset: { bugNote: req.id } });
    const send = h('button', { type: 'submit', class: 'btn-primary btn-sm', dataset: { bugSend: req.id } }, 'Report bug');
    const submit = async (e) => {
      e.preventDefault();
      if (await withBusy(send, () => actions.reportBug(req.id, { severity: severity.value, note: note.value }))) {
        showBugForm = false; paintPanel();
      }
    };
    return h('form', { class: 'stack', onsubmit: submit },
      h('div', { class: 'label' }, 'Report as bug'),
      h('div', { class: 'row' }, severity,
        h('button', { type: 'button', class: 'btn-ghost btn-sm', onclick: () => { showBugForm = false; paintPanel(); } }, 'Cancel'),
        send),
      note,
      h('div', { class: 'small muted' }, 'Includes the URL, status, headers (secrets masked) and body.'),
    );
  }

  function paintPanel() {
    const detail = req.status === 0
      ? `Failed: ${req.error || 'network error'}`
      : `HTTP ${req.status}${req.duration != null ? ` · ${req.duration} ms` : ''}${req.fromCache ? ' · from cache' : ''}`;
    panel.replaceChildren(
      h('div', { class: 'req-detail' },
        h('div', { class: 'mono small break' }, `${req.method} ${req.url}`),
        h('div', { class: 'small muted' }, detail),
      ),
      store.state.projectId ? suiteSection() : h('div', { class: 'small muted' }, 'Create or select a project to save this request.'),
      store.state.projectId ? bugSection() : null,
    );
  }

  paintHead();

  return {
    el,
    id: req.id,
    update(next) {
      const statusChanged = next.status !== req.status || next.duration !== req.duration;
      req = next;
      if (statusChanged) paintHead();
    },
    /** Suites or project changed: refresh the panel if it's open and idle. */
    refresh() {
      paintHead();
      const typing = panel.contains(document.activeElement) && /INPUT|TEXTAREA/.test(document.activeElement.tagName);
      if (expanded && !typing) paintPanel();
    },
  };
}
