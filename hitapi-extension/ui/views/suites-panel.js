/**
 * ui/views/suites-panel.js — the Run suites tab.
 */

import { h, spinner } from '../core/dom.js';

function runStatus(run) {
  if (!run) return null;
  if (run.state === 'running') return h('span', { class: 'small text-amber run-status' }, '⏳ ', run.label || 'running');
  if (run.state === 'error') return h('span', { class: 'small text-red run-status', title: run.error }, '⚠ Failed to run');
  return h('span', { class: `small run-status ${run.failed ? 'text-red' : 'text-green'}` },
    `${run.passed}✓`, run.failed ? ` ${run.failed}✗` : '');
}

export function SuitesPanelView(store, actions) {
  const { suites, runs, suitesLoading, projectId } = store.state;
  if (!projectId) return h('div');
  if (suitesLoading && !suites.length) return h('div', { class: 'muted small pad' }, spinner(), ' Loading suites…');
  if (!suites.length) {
    return h('div', { class: 'empty' },
      h('div', { class: 'icon' }, '▶'),
      h('p', {}, 'No flow suites yet.', h('br'), 'Add a captured request to create one,', h('br'), 'or build one on the dashboard.'));
  }

  return h('div', { class: 'suite-list' }, suites.map(suite => {
    const run = runs[suite.id];
    const running = run?.state === 'running';
    const steps = Number(suite.step_count || 0);
    return h('div', { class: 'suite-card', dataset: { suite: suite.id } },
      h('div', { class: 'grow min0' },
        h('div', { class: 'suite-name ellipsis' }, suite.name),
        h('div', { class: 'small muted' }, `${steps} step${steps === 1 ? '' : 's'}`),
        run?.state === 'error' ? h('div', { class: 'small text-red break' }, run.error) : null,
      ),
      runStatus(run),
      h('button', {
        class: 'btn-primary btn-sm nowrap', dataset: { run: suite.id },
        disabled: running || steps === 0,
        title: steps === 0 ? 'Add steps to this suite first' : 'Run this suite',
        onclick: () => actions.runSuite(suite.id),
      }, running ? spinner() : '▶ Run'),
    );
  }));
}
