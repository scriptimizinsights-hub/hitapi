/**
 * ui/views/agent-bar.js — Local Agent on/off switch and its status.
 */

import { h } from '../core/dom.js';

export function AgentBarView(store, actions) {
  const agent = store.state.agent || {};
  const on = !!agent.enabled;

  let status = 'Lets HitAPI run test steps against your localhost API';
  let statusClass = 'muted';
  if (on && agent.lastPollOk === false) { status = `Can't reach HitAPI: ${agent.lastError || 'unknown error'}`; statusClass = 'text-red'; }
  else if (on && agent.lastPollOk) { status = 'Connected: localhost steps run from this browser'; statusClass = 'text-green'; }
  else if (on) { status = 'Connecting…'; }

  const toggle = h('input', {
    type: 'checkbox', id: 'agent-toggle', checked: on, 'aria-label': 'Local Agent',
    onchange: (e) => actions.setAgent(e.target.checked),
  });

  return h('div', { class: `agent-bar ${on ? 'on' : ''}` },
    h('div', { class: 'grow min0' },
      h('div', { class: 'agent-title' }, '🖥️ Local Agent ', on ? h('span', { class: 'text-green' }, '●') : null),
      h('div', { class: `small ellipsis ${statusClass}`, title: status }, status),
    ),
    h('label', { class: 'switch' }, toggle, h('span', { class: 'switch-track' }), h('span', { class: 'switch-thumb' })),
  );
}
