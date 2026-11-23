/**
 * workbench/views/scenarios-pane.js — the Scenarios tab of the sidebar (roadmap feature 9).
 */

import { h, mount } from '../../ui/core/dom.js';
import { openMenu } from './collections-pane.js';
import { reportSummary } from '../../shared/scenarios.js';

/**
 * @param {object} o
 * @param {(id) => void} o.onOpen
 * @param {() => void} o.onNew
 * @param {() => void} o.onPull
 * @param {(id) => void} o.onRun
 * @param {(id) => void} o.onRename
 * @param {(id) => void} o.onDuplicate
 * @param {(id) => void} o.onPush
 * @param {(id) => void} o.onDelete
 */
export function createScenariosPane(o) {
  let state = { items: [] };
  let activeId = null;
  let q = '';
  const listEl = h('div', { class: 'cl-list', role: 'list' });
  const el = h('div', { class: 'cl-pane sc-pane', role: 'tabpanel', 'aria-label': 'Scenarios' },
    h('div', { class: 'cl-head' },
      h('button', { type: 'button', class: 'btn-ghost btn-sm', onclick: o.onNew, title: 'Create a scenario' }, '+ Scenario'),
      h('span', { class: 'grow' }),
      h('button', { type: 'button', class: 'btn-ghost btn-sm sc-schedules', title: 'Scheduled runs of scenarios and collections', onclick: o.onSchedules }, '⏰ Schedules'),
      h('button', { type: 'button', class: 'btn-ghost btn-sm', title: 'Make a scenario from a HitAPI flow suite (sign-in needed)', onclick: o.onPull }, '⚡ From HitAPI')),
    h('input', { type: 'search', class: 'hs-search', placeholder: 'Filter scenarios', 'aria-label': 'Filter scenarios', oninput: (e) => { q = e.target.value.trim().toLowerCase(); paint(); } }),
    listEl);

  function badge(s) {
    const r = s.lastReport;
    if (!r) return null;
    const { passed, failed, total } = reportSummary(r);
    if (!total) return null;
    return h('span', { class: `sc-badge ${failed ? 'bad' : 'ok'}`, title: `Last run: ${passed} passed, ${failed} failed (${new Date(r.finishedAt || r.startedAt).toLocaleString()})` },
      failed ? `✗ ${failed}` : `✓ ${passed}`);
  }

  function paint() {
    if (!state.items.length) {
      mount(listEl, h('div', { class: 'hs-empty muted small' },
        h('p', {}, 'A scenario runs requests one after another, e.g. log in, create an order, check it, delete it.'),
        h('p', {}, 'Steps share variables: a login step can save {{token}} (Set vars tab) for the steps after it. Each step\'s Tests decide whether it passed.'),
        h('p', {}, h('button', { type: 'button', class: 'btn-primary btn-sm', onclick: o.onNew }, 'Create a scenario'))));
      return;
    }
    const shown = state.items.filter(s => !q || s.name.toLowerCase().includes(q));
    mount(listEl, shown.length ? shown.map(s => {
      const more = h('button', { type: 'button', class: 'cl-more', 'aria-label': `More actions for ${s.name}`, title: 'More actions', onclick: (e) => {
        e.stopPropagation();
        openMenu(e.currentTarget, [
          ['Open', () => o.onOpen(s.id)],
          ['Run', () => o.onRun(s.id)],
          ['Rename', () => o.onRename(s.id)],
          ['Duplicate', () => o.onDuplicate(s.id)],
          ['Schedule runs…', () => o.onSchedule(s.id)],
          ['Export for the CLI (CI)…', () => o.onExportCli(s.id)],
          ['Publish to GitHub…', () => o.onPublish(s.id)],
          ['Send to HitAPI as a flow suite…', () => o.onPush(s.id)],
          null,
          ['Delete', () => o.onDelete(s.id), { danger: true }],
        ]);
      } }, '⋯');
      return h('div', { class: `cl-row sc-row${s.id === activeId ? ' active' : ''}`, role: 'listitem', tabindex: '0', dataset: { id: s.id },
        onclick: () => o.onOpen(s.id), onkeydown: (e) => { if (e.key === 'Enter' && e.target === e.currentTarget) o.onOpen(s.id); } },
      h('span', { class: 'cl-icon', 'aria-hidden': 'true' }, '▶'),
      h('span', { class: 'cl-name' }, s.name),
      h('span', { class: 'cl-count', title: 'Steps' }, String(s.steps.length)),
      s.hitapi ? h('span', { class: 'cl-linked', title: 'Linked to a HitAPI flow suite' }, '⚡') : null,
      badge(s),
      more);
    }) : h('div', { class: 'hs-empty muted small' }, 'No scenario matches.'));
  }
  paint();
  return {
    el,
    setState(s) { state = s; paint(); },
    setActive(id) { activeId = id; paint(); },
    count: () => state.items.length,
  };
}
