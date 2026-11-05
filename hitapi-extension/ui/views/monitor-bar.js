/**
 * ui/views/monitor-bar.js — capture on/off for the current tab.
 */

import { h, withBusy } from '../core/dom.js';

export function MonitorBarView(store, actions) {
  const { monitor, tabInfo } = store.state;
  const active = !!monitor?.active;
  const origin = monitor?.origin || tabInfo?.origin;

  let control;
  if (!tabInfo?.isWebPage && !active) {
    control = h('span', { class: 'small muted' }, 'Open a website first');
  } else if (active) {
    control = h('button', { id: 'stop-btn', class: 'btn-danger', onclick: actions.stopMonitoring }, '■ Stop');
  } else {
    control = h('button', { id: 'start-btn', class: 'btn-primary btn-sm' }, '▶ Start');
    control.addEventListener('click', () => withBusy(control, actions.startMonitoring));
  }

  return h('div', { class: `monitor-bar ${active ? 'active' : ''}` },
    h('div', { class: 'grow min0' },
      h('div', { class: `monitor-label ${active ? 'text-green' : 'muted'}` }, active ? '● Capturing this tab' : '○ Not capturing'),
      origin ? h('div', { class: 'monitor-origin', title: tabInfo?.url || origin }, origin) : null,
    ),
    control,
  );
}
