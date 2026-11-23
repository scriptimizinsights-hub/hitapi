/**
 * ui/views/header.js — logo, signed-in user and sign out (or Sign in when signed out).
 */

import { h } from '../core/dom.js';

export function HeaderView(store, actions) {
  const { user } = store.state;
  return h('div', { class: 'header' },
    h('div', { class: 'logo' }, '⚡'),
    h('div', { class: 'header-title' }, 'HitAPI'),
    user
      ? h('div', { class: 'header-user' },
        h('span', { class: 'ellipsis', title: user.email || '' }, user.name || user.email || ''),
        h('button', { id: 'logout-btn', class: 'btn-ghost btn-sm', title: 'Sign out', onclick: actions.logout }, '⏻'))
      : h('div', { class: 'header-user' },
        h('button', { id: 'header-signin', class: 'btn-ghost btn-sm', onclick: actions.showLogin }, 'Sign in')),
  );
}
