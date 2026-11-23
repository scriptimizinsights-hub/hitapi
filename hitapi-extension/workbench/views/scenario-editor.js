/**
 * workbench/views/scenario-editor.js — edit and run a scenario (roadmap feature 9).
 * Shown in place of the request and response while a scenario is open.
 *
 *   left   steps: order (drag or ↑↓), on/off, delay, repeat, stop or continue on failure; add steps; data
 *   right  the run: live progress, each step's status, time and tests; re-run failed steps
 */

import { h, mount } from '../../ui/core/dom.js';
import { find, walk } from '../../shared/collections.js';
import { newStep, parseData, reportSummary, failedSteps, MAX_REPEAT } from '../../shared/scenarios.js';
import { formatBytes } from '../../shared/http.js';

/**
 * @param {object} o
 * @param {object} o.scenario                    a copy; the editor changes it and calls o.persist(s)
 * @param {() => object} o.getTree
 * @param {(s) => void} o.persist                 save the scenario (debounced by the caller)
 * @param {(s, only: Set|null) => void} o.onRun
 * @param {() => void} o.onStop
 * @param {() => void} o.onBack
 * @param {(step) => void} o.onOpenStep
 * @param {(result, step) => void} o.onOpenResult
 * @param {() => object|null} o.currentRequest   the open request (for "Add the current request")
 * @param {() => string} o.envLabel
 */
export function createScenarioEditor(o) {
  let s = o.scenario;
  let report = s.lastReport || null;
  let running = false;
  let dragId = null;
  const el = h('section', { class: 'wb-scenario', 'aria-label': 'Scenario' });
  const stepsEl = h('div', { class: 'sc-steps' });
  const reportEl = h('div', { class: 'sc-report', 'aria-live': 'polite' });
  const headEl = h('div', { class: 'sc-headwrap' });
  const save = () => o.persist(s);

  const requestOf = (step) => {
    if (step.kind === 'inline') return { draft: step.draft, name: step.name || 'Request', where: 'copy in this scenario' };
    const f = find(o.getTree(), step.requestId);
    if (!f || f.node.type !== 'request') return null;
    return { draft: f.node.draft, name: f.node.name, where: [...f.ancestors.map(a => a.name)].join(' / '), ancestors: f.ancestors };
  };

  function savedOptions() {
    const out = [];
    walk(o.getTree(), (n, _p, anc) => { if (n.type === 'request') out.push({ id: n.id, label: `${[...anc.map(a => a.name), n.name].join(' / ')}`, method: n.draft?.method || 'GET' }); });
    return out;
  }

  // ── steps ──
  function stepEl(step, i) {
    const req = requestOf(step);
    const num = (v, min, max, label, onSet) => h('input', { type: 'number', class: 'wb-num', min: String(min), max: String(max), value: String(v), 'aria-label': label,
      oninput: (e) => { onSet(Math.max(min, Math.min(max, Math.floor(Number(e.target.value) || 0)))); save(); } });
    const move = (to) => { if (to < 0 || to >= s.steps.length) return; const [x] = s.steps.splice(i, 1); s.steps.splice(to, 0, x); save(); paintSteps(); };
    const card = h('div', { class: `sc-step${step.enabled ? '' : ' off'}${req ? '' : ' missing'}`, dataset: { id: step.id }, draggable: 'true' },
      h('div', { class: 'sc-step-head' },
        h('span', { class: 'sc-grip', title: 'Drag to reorder', 'aria-hidden': 'true' }, '⋮⋮'),
        h('span', { class: 'sc-num' }, String(i + 1)),
        h('input', { type: 'checkbox', checked: step.enabled, 'aria-label': 'Run this step', onchange: (e) => { step.enabled = e.target.checked; card.classList.toggle('off', !step.enabled); save(); paintHead(); } }),
        req ? h('span', { class: 'hs-method', dataset: { method: req.draft.method } }, String(req.draft.method).slice(0, 6)) : null,
        h('span', { class: 'sc-step-name' }, req ? req.name : 'Saved request was deleted', h('span', { class: 'muted small' }, req ? ` · ${req.where}` : ' · remove this step or add it again')),
        h('span', { class: 'grow' }),
        req ? h('button', { type: 'button', class: 'btn-ghost btn-sm', title: step.kind === 'inline' ? 'Open this step to edit it' : 'Open the saved request', onclick: () => o.onOpenStep(step) }, 'Open') : null,
        h('button', { type: 'button', class: 'btn-ghost btn-sm', title: 'Move up', 'aria-label': 'Move up', disabled: i === 0, onclick: () => move(i - 1) }, '↑'),
        h('button', { type: 'button', class: 'btn-ghost btn-sm', title: 'Move down', 'aria-label': 'Move down', disabled: i === s.steps.length - 1, onclick: () => move(i + 1) }, '↓'),
        h('button', { type: 'button', class: 'btn-ghost btn-sm kv-del', title: 'Remove step', 'aria-label': 'Remove step', onclick: () => { s.steps.splice(i, 1); save(); paintSteps(); } }, '✕')),
      h('div', { class: 'sc-step-opts small' },
        h('label', {}, 'Wait ', num(step.delayMs, 0, 600000, 'Wait before this step (ms)', (v) => { step.delayMs = v; }), ' ms first'),
        h('label', {}, 'Repeat ', num(step.repeat, 1, MAX_REPEAT, 'Repeat this step', (v) => { step.repeat = Math.max(1, v); }), '×'),
        h('label', {}, 'If it fails ', h('select', { 'aria-label': 'If the step fails', onchange: (e) => { step.onFail = e.target.value; save(); } },
          h('option', { value: 'stop', selected: step.onFail === 'stop' }, 'stop the run'),
          h('option', { value: 'continue', selected: step.onFail === 'continue' }, 'continue'))),
        req ? h('span', { class: 'muted' }, `${(req.draft.tests || []).filter(t => t.enabled !== false).length} tests · ${(req.draft.extract || []).filter(r => r.enabled !== false && r.name).length} set vars`) : null));
    card.addEventListener('dragstart', (e) => { if (e.target.closest('input, select, button')) { e.preventDefault(); return; } dragId = step.id; e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', step.id); card.classList.add('dragging'); });
    card.addEventListener('dragend', () => { dragId = null; card.classList.remove('dragging'); stepsEl.querySelectorAll('.drop-before, .drop-after').forEach(x => x.classList.remove('drop-before', 'drop-after')); });
    card.addEventListener('dragover', (e) => {
      if (!dragId || dragId === step.id) return;
      e.preventDefault();
      const r = card.getBoundingClientRect(); const after = e.clientY > r.top + r.height / 2;
      card.classList.toggle('drop-after', after); card.classList.toggle('drop-before', !after);
    });
    card.addEventListener('dragleave', () => card.classList.remove('drop-before', 'drop-after'));
    card.addEventListener('drop', (e) => {
      e.preventDefault();
      const after = card.classList.contains('drop-after');
      card.classList.remove('drop-before', 'drop-after');
      const from = s.steps.findIndex(x => x.id === dragId);
      if (from < 0) return;
      const [x] = s.steps.splice(from, 1);
      const to = s.steps.findIndex(y => y.id === step.id) + (after ? 1 : 0);
      s.steps.splice(to, 0, x);
      save(); paintSteps();
    });
    return card;
  }

  function addBar() {
    const opts = savedOptions();
    const pick = h('select', { class: 'sc-pick', 'aria-label': 'Add a saved request as a step' },
      h('option', { value: '' }, opts.length ? '+ Add a saved request…' : 'No saved requests yet (save one with Ctrl/⌘ + S)'),
      opts.map(x => h('option', { value: x.id }, `${x.method}  ${x.label}`)));
    pick.disabled = !opts.length;
    pick.addEventListener('change', () => {
      if (!pick.value) return;
      s.steps.push(newStep('saved', { requestId: pick.value }));
      save(); paintSteps();
    });
    return h('div', { class: 'sc-add' }, pick,
      h('button', { type: 'button', class: 'btn-ghost btn-sm', title: 'Add the request open in the Workbench: a saved request stays linked, an unsaved one is copied into the scenario', onclick: () => {
        const cur = o.currentRequest();
        if (!cur?.draft?.url) { alertInline('Open or type a request first, then add it.'); return; }
        alertInline('');
        // a saved request stays linked; an unsaved one is copied into the scenario
        s.steps.push(cur.savedId ? newStep('saved', { requestId: cur.savedId }) : newStep('inline', { name: cur.name, draft: cur.draft }));
        save(); paintSteps();
      } }, '+ Add the current request'));
  }

  let hintEl = null;
  function alertInline(text) { if (hintEl) { hintEl.textContent = text; hintEl.hidden = !text; } }

  function dataSection() {
    let rowsInfo = h('div', { class: 'small' });
    const area = h('textarea', { class: 'mono sc-data', rows: '5', spellcheck: 'false', 'aria-label': 'Data for the runs', placeholder: s.data.format === 'json' ? '[{"user": "asha", "password": "…"}, {"user": "ben", "password": "…"}]' : 'user,password\nasha,secret1\nben,secret2' }, s.data.text);
    const fmt = h('select', { 'aria-label': 'Data format' }, h('option', { value: 'csv', selected: s.data.format === 'csv' }, 'CSV'), h('option', { value: 'json', selected: s.data.format === 'json' }, 'JSON'));
    const paintInfo = () => {
      try {
        const rows = parseData(s.data);
        mount(rowsInfo, rows.length ? h('span', { class: 'text-green' }, `${rows.length} run${rows.length === 1 ? '' : 's'}, one per row. Variables: ${Object.keys(rows[0]).map(k => `{{${k}}}`).join(', ')}`)
          : h('span', { class: 'muted' }, 'No data: the scenario runs once.'));
      } catch (e) { mount(rowsInfo, h('span', { class: 'text-red' }, e.message)); }
    };
    area.addEventListener('input', () => { s.data.text = area.value; save(); paintInfo(); });
    fmt.addEventListener('change', () => { s.data.format = fmt.value; save(); paintInfo(); });
    const file = h('input', { type: 'file', accept: '.csv,.json,text/csv,application/json', hidden: true, onchange: async () => {
      const f = file.files?.[0]; if (!f) return;
      s.data.text = await f.text(); s.data.format = /\.json$/i.test(f.name) || s.data.text.trim().startsWith('[') ? 'json' : 'csv';
      area.value = s.data.text; fmt.value = s.data.format; save(); paintInfo();
    } });
    paintInfo();
    const det = h('details', { class: 'sc-datawrap', open: !!s.data.text.trim() },
      h('summary', {}, 'Data-driven runs', s.data.text.trim() ? h('span', { class: 'muted small' }, ' (on)') : null),
      h('div', { class: 'muted small' }, 'Run the whole scenario once per row. Each column is a {{variable}} for that run (it wins over the environment).'),
      h('div', { class: 'sc-data-bar' }, fmt, h('button', { type: 'button', class: 'btn-ghost btn-sm', onclick: () => file.click() }, 'Load a file…'), file),
      area, rowsInfo);
    return det;
  }

  function paintSteps() {
    hintEl = h('div', { class: 'wb-warn-text small', hidden: true });
    mount(stepsEl,
      s.steps.length ? s.steps.map(stepEl) : h('div', { class: 'muted small sc-empty' }, 'No steps yet. Add saved requests (they stay linked: edit the request and the scenario uses the new version) or a copy of the request you have open.'),
      addBar(), hintEl, dataSection());
    paintHead();
  }

  // ── report ──
  function paintReport() {
    const head = h('div', { class: 'rn-head' },
      h('div', {}, h('strong', {}, running ? 'Running…' : report ? 'Last run' : 'Not run yet'),
        h('div', { class: 'muted small' }, `Environment: ${o.envLabel()}`, report && !running ? ` · ${new Date(report.finishedAt || report.startedAt).toLocaleString()}` : '')),
      h('span', { class: 'grow' }),
      report ? (() => { const sm = reportSummary(report); return [h('span', { class: 'rn-sum rn-ok' }, `${sm.passed} passed`), h('span', { class: `rn-sum${sm.failed ? ' rn-bad' : ''}` }, `${sm.failed} failed`), h('span', { class: 'muted small' }, `${sm.ms} ms`)]; })() : null);
    if (!report) { mount(reportEl, head, h('div', { class: 'muted small' }, 'Press Run. Steps run in order with the environment picked in the header; each step\'s Tests decide whether it passed (or, without tests, a status below 400).')); return; }
    const total = report.results.length;
    const sm = reportSummary(report);
    const stepIndex = new Map(s.steps.map((x, i) => [x.id, i]));
    const items = report.results.map((r) => {
      const step = s.steps.find(x => x.id === r.stepId);
      const req = step && requestOf(step);
      const state = r.running ? 'now' : r.pass ? 'ok' : 'bad';
      const failedTest = r.tests?.find(t => !t.pass);
      const tests = r.tests?.length ? `${r.tests.filter(t => t.pass).length}/${r.tests.length} tests` : '';
      return h('li', { class: `rn-item rn-${state}` },
        h('button', { type: 'button', class: 'rn-open', disabled: r.running || !step, title: 'Open this step with its response', onclick: () => o.onOpenResult(r, step) },
          h('span', { class: 'rn-mark', 'aria-hidden': 'true' }, { ok: '✓', bad: '✗', now: '…' }[state]),
          h('span', { class: 'hs-method', dataset: { method: r.method || req?.draft?.method || 'GET' } }, String(r.method || req?.draft?.method || '').slice(0, 6)),
          h('span', { class: 'rn-name' },
            h('span', {}, `${stepIndex.has(r.stepId) ? stepIndex.get(r.stepId) + 1 : '?'}. ${r.name || req?.name || 'Step'}`),
            report.iterations > 1 ? h('span', { class: 'muted small' }, ` · row ${r.iteration + 1}`) : null,
            r.attempt ? h('span', { class: 'muted small' }, ` · repeat ${r.attempt + 1}`) : null,
            r.error ? h('span', { class: 'rn-err small' }, r.error.split('\n')[0]) : failedTest ? h('span', { class: 'rn-err small' }, `✗ ${failedTest.message || 'a check failed'}`) : null,
            r.setVars?.length ? h('span', { class: 'muted small sc-setvars' }, `set ${r.setVars.join(', ')}`) : null),
          h('span', { class: 'rn-meta small muted' }, r.running ? '' : [tests ? h('span', { class: r.pass ? 'text-green' : 'text-red' }, `${tests} · `) : '', r.error ? '' : `${r.ms} ms · ${formatBytes(r.size || 0)}`]),
          h('span', { class: `hs-status wb-code-${r.running ? '' : r.pass ? 'ok' : 'err'}` }, r.running ? '' : r.error ? (r.kind === 'cancel' ? 'Stopped' : 'Error') : String(r.status))));
    });
    const note = !running && report.status === 'failed-stop' ? 'Stopped at the first failed step (set a step to "continue" to keep going).'
      : !running && report.status === 'stopped' ? 'You stopped the run.' : '';
    mount(reportEl, head,
      h('div', { class: 'rn-bar' }, h('span', { class: 'rn-bar-ok', style: { width: `${total ? (sm.passed / total) * 100 : 0}%` } }), h('span', { class: 'rn-bar-bad', style: { width: `${total ? (sm.failed / total) * 100 : 0}%` } })),
      note ? h('div', { class: 'muted small' }, note) : null,
      report.only ? h('div', { class: 'muted small' }, `Re-ran ${report.only.length} failed step${report.only.length === 1 ? '' : 's'} only.`) : null,
      h('ol', { class: 'rn-list' }, items));
  }

  function paintHead() {
    const failed = report && !running ? failedSteps(report) : new Set();
    const name = h('input', { type: 'text', class: 'sc-name', value: s.name, 'aria-label': 'Scenario name', maxlength: '120',
      oninput: (e) => { s.name = e.target.value || 'Scenario'; save(); } });
    const nameHadFocus = document.activeElement?.classList?.contains('sc-name');
    if (nameHadFocus && headEl.firstChild) { // keep typing in the name box undisturbed; just update the buttons
      const old = headEl.querySelector('.sc-actions');
      if (old) { old.replaceWith(actions(failed)); return; }
    }
    mount(headEl, h('div', { class: 'sc-head' },
      h('button', { type: 'button', class: 'btn-ghost btn-sm', onclick: o.onBack, title: 'Back to the request' }, '← Request'),
      name,
      h('span', { class: 'grow' }),
      actions(failed)));
  }
  function actions(failed) {
    return h('span', { class: 'sc-actions' },
      running ? h('button', { type: 'button', class: 'btn-danger btn-sm sc-stop', onclick: o.onStop }, 'Stop')
        : [failed.size ? h('button', { type: 'button', class: 'btn-ghost btn-sm sc-rerun', title: 'Run only the steps that failed last time', onclick: () => o.onRun(s, failed) }, `Re-run ${failed.size} failed`) : null,
          h('button', { type: 'button', class: 'btn-ghost btn-sm sc-schedule', title: 'Run this scenario on a schedule, in the background', onclick: () => o.onSchedule(s) }, '⏰ Schedule'),
          h('button', { type: 'button', class: 'btn-primary sc-run', disabled: !s.steps.some(x => x.enabled), onclick: () => o.onRun(s, null) }, '▶ Run')]);
  }

  function paint() {
    paintHead();
    mount(el, headEl, h('div', { class: 'sc-body' }, h('div', { class: 'sc-left' }, h('div', { class: 'sc-title muted small' }, 'Steps'), stepsEl), reportEl));
    paintSteps();
    paintReport();
  }
  paint();

  return {
    el,
    get id() { return s.id; },
    get scenario() { return s; },
    setScenario(next) { s = next; if (!running && s.lastReport && s.lastReport.startedAt !== report?.startedAt) report = s.lastReport; paint(); },
    /** Live report while running; running=false at the end. */
    showReport(r, isRunning) { const was = running; report = r; running = isRunning; if (was !== running) { paintHead(); paintReport(); } else paintReport(); },
    refreshSteps() { paintSteps(); },
  };
}
