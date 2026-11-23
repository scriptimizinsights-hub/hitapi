/**
 * ui/views/workbench-card.js — the Workbench, front and centre in the popup.
 * No account is needed, so it is the first thing anyone sees.
 */

import { h } from '../core/dom.js';

export function WorkbenchCardView(store, actions) {
  const { wbShortcut, wbNew } = store.state;
  return h('div', { class: 'wb-card' },
    h('div', { class: 'wb-card-icon', 'aria-hidden': 'true' }, '⇄'),
    h('div', { class: 'grow min0' },
      h('div', { class: 'wb-card-title' }, 'Workbench', wbNew ? h('span', { class: 'wb-new' }, 'New') : null),
      h('div', { class: 'small muted' }, 'Build and send any API request. No account needed.'),
      h('div', { class: 'small muted wb-card-key' }, wbShortcut
        ? ['Shortcut: ', h('kbd', {}, wbShortcut)]
        : ['Add a shortcut in ', h('a', { href: '#', onclick: (e) => { e.preventDefault(); chrome.tabs.create({ url: 'chrome://extensions/shortcuts' }); } }, 'chrome://extensions/shortcuts')]),
    ),
    h('button', { id: 'open-workbench', class: 'btn-primary', onclick: () => actions.openWorkbench() }, 'Open'),
  );
}
