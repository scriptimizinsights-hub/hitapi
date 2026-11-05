/**
 * ui/views/header.js — logo, signed-in user, sign out.
 */

import { h } from '../core/dom.js';

export function HeaderView(store, actions) {
  const { user } = store.state;
  return h('div', { class: 'header' },
    h('div', { class: 'logo' }, '⚡'),
    h('div', { class: 'header-title' }, 'HitAPI'),
    h('div', { class: 'header-user' },
      h('span', { class: 'ellipsis', title: user?.email || '' }, user?.name || user?.email || ''),
      h('button', { id: 'logout-btn', class: 'btn-ghost btn-sm', title: 'Sign out', onclick: actions.logout }, '⏻'),
    ),
  );
}
