/**
 * ui/views/login.js — sign-in screen.
 * A failed sign-in shows the error in place; what you typed stays.
 */

import { h, withBusy } from '../core/dom.js';
import { DASHBOARD_URL } from '../../shared/config.js';

export function LoginView(store, actions) {
  const { authMessage } = store.state;
  const email = h('input', { id: 'em', type: 'email', placeholder: 'Email', autocomplete: 'username', required: true });
  const password = h('input', { id: 'pw', type: 'password', placeholder: 'Password', autocomplete: 'current-password', required: true });
  const message = h('div', { class: 'error', role: 'alert', hidden: !authMessage }, authMessage || '');
  const button = h('button', { id: 'login-btn', type: 'submit', class: 'btn-primary btn-block' }, 'Sign in');

  const submit = async (e) => {
    e.preventDefault();
    message.hidden = true;
    const error = await withBusy(button, () => actions.login(email.value.trim(), password.value), 'Signing in…');
    if (error) { message.textContent = error; message.hidden = false; password.select(); }
  };
  setTimeout(() => email.focus(), 0);

  return h('form', { class: 'login-wrap', onsubmit: submit },
    h('div', { class: 'login-logo' }, '⚡'),
    h('div', { class: 'login-title' }, 'HitAPI'),
    h('div', { class: 'login-sub' }, 'Sign in to capture requests and run test suites'),
    message,
    email,
    password,
    button,
    h('div', { class: 'muted small center' },
      'No account? ',
      h('a', { href: DASHBOARD_URL, target: '_blank', rel: 'noopener' }, 'Sign up on hitapi.dev')),
  );
}
