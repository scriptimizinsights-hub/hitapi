/**
 * ui/views/footer.js — current project and dashboard link.
 */

import { h } from '../core/dom.js';
import { DASHBOARD_URL } from '../../shared/config.js';

export function FooterView(store) {
  const { projects, projectId } = store.state;
  const project = projects.find(p => p.id === projectId);
  return h('div', { class: 'footer' },
    h('span', { class: 'ellipsis' }, project ? project.name : 'No project'),
    h('a', { href: DASHBOARD_URL, target: '_blank', rel: 'noopener' }, 'Dashboard ↗'),
  );
}
