/**
 * ui/views/tabs.js — Capture / Workbench (DevTools panel) / Run suites tab strip.
 */

import { h } from '../core/dom.js';

export function TabsView(store, actions) {
  const { tab, requests, suites } = store.state;
  const item = (id, label, count) => h('button', {
    class: `tab ${tab === id ? 'active' : ''}`, dataset: { tab: id }, role: 'tab',
    'aria-selected': tab === id ? 'true' : 'false', onclick: () => actions.setTab(id),
  }, label, count ? h('span', { class: 'badge' }, String(count)) : null);

  return h('div', { class: 'tabs', role: 'tablist' },
    item('capture', 'Capture', requests.length),
    store.state.mode === 'panel' ? item('workbench', '⇄ Workbench') : null,
    item('suites', '▶ Run suites', suites.length),
  );
}
