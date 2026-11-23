/**
 * ui/views/sign-in-prompt.js — shown instead of the project bar when signed out.
 * Signing in is optional: it only adds saving to projects, suites and bug reports.
 */

import { h } from '../core/dom.js';
import { DASHBOARD_URL } from '../../shared/config.js';

export function SignInPromptView(store, actions) {
  return h('div', { class: 'card signin-card' },
    h('div', { class: 'grow min0' },
      h('div', { class: 'small' }, h('strong', {}, 'Sign in to save to HitAPI')),
      h('div', { class: 'small muted' }, 'Save captured requests to a project, run test suites, report bugs and use the Local Agent. ',
        h('a', { href: DASHBOARD_URL, target: '_blank', rel: 'noopener' }, 'Free account')),
    ),
    h('button', { id: 'signin-btn', class: 'btn-ghost btn-sm nowrap', onclick: actions.showLogin }, 'Sign in'),
  );
}
