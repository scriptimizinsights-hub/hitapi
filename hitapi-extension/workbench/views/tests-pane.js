/**
 * workbench/views/tests-pane.js — the "Tests" tab (roadmap feature 8): checks
 * that run on every response, e.g. status equals 200, $.data.id exists,
 * Content-Type contains json, response time below 500 ms.
 */

import { h, mount } from '../../ui/core/dom.js';
import { TARGETS, OPS, JSON_TYPES, newTest, needsPath, needsExpected } from '../../shared/assert.js';

const PATH_PLACEHOLDER = { header: 'Content-Type', json: '$.data.id', xml: '/user/name' };

/**
 * @param {{ draft, onChange: () => void, onSuggest: () => Array|null }} o
 *   onSuggest(): checks suggested from the last response, or null when there is none.
 */
export function createTestsPane({ draft, onChange, onSuggest }) {
  if (!Array.isArray(draft.tests)) draft.tests = [];
  const rowsEl = h('div', { class: 'ts-rows' });
  const resultsEl = h('div', { class: 'ts-results' });
  const emit = () => onChange();

  function rowEl(t, i) {
    const check = h('input', { type: 'checkbox', checked: t.enabled !== false, 'aria-label': 'Run this check', onchange: () => { t.enabled = check.checked; line.classList.toggle('off', !t.enabled); emit(); } });
    const target = h('select', { 'aria-label': 'What to check' }, TARGETS.map(x => h('option', { value: x.id, selected: x.id === t.target }, x.label)));
    const path = h('input', { type: 'text', class: 'mono', value: t.path || '', spellcheck: 'false', 'aria-label': 'Path or header name', placeholder: PATH_PLACEHOLDER[t.target] || '' });
    const op = h('select', { 'aria-label': 'Check' });
    const expectedText = h('input', { type: 'text', class: 'mono', value: t.expected ?? '', spellcheck: 'false', 'aria-label': 'Expected value' });
    const expectedType = h('select', { 'aria-label': 'Expected type' }, JSON_TYPES.map(x => h('option', { value: x }, x)));
    const expectedSchema = h('textarea', { class: 'mono ts-schema', rows: '4', spellcheck: 'false', 'aria-label': 'JSON Schema', placeholder: '{ "type": "object", "required": ["id"] }' }, t.expected ?? '');
    const del = h('button', { type: 'button', class: 'btn-ghost btn-sm kv-del', title: 'Delete check', 'aria-label': 'Delete check', onclick: () => { draft.tests.splice(i, 1); paint(); emit(); } }, '✕');
    const expWrap = h('span', { class: 'ts-exp' });

    function paintOps() {
      mount(op, OPS[t.target].map(([id, label]) => h('option', { value: id, selected: id === t.op }, label)));
      if (!OPS[t.target].some(o => o[0] === t.op)) { t.op = OPS[t.target][0][0]; op.value = t.op; }
    }
    function paintFields() {
      path.style.visibility = needsPath(t) ? 'visible' : 'hidden';
      path.placeholder = PATH_PLACEHOLDER[t.target] || '';
      const need = needsExpected(t);
      if (!need) mount(expWrap);
      else if (t.target === 'json' && t.op === 'type_is') { if (!JSON_TYPES.includes(t.expected)) t.expected = 'string'; expectedType.value = t.expected; mount(expWrap, expectedType); }
      else if (t.target === 'body' && t.op === 'schema') { expectedSchema.value = t.expected ?? ''; mount(expWrap, expectedSchema); }
      else { expectedText.value = t.expected ?? ''; expectedText.placeholder = { status: '200', time: '1000', header: 'json' }[t.target] || 'value'; mount(expWrap, expectedText); }
      line.classList.toggle('ts-wide', t.target === 'body' && t.op === 'schema');
    }
    target.addEventListener('change', () => {
      const fresh = newTest(target.value);
      Object.assign(t, { target: fresh.target, op: fresh.op, path: needsPath(fresh) ? (t.path && t.target === fresh.target ? t.path : fresh.path) : '', expected: fresh.expected });
      path.value = t.path; paintOps(); paintFields(); emit();
    });
    op.addEventListener('change', () => { t.op = op.value; paintFields(); emit(); });
    path.addEventListener('input', () => { t.path = path.value; emit(); });
    expectedText.addEventListener('input', () => { t.expected = expectedText.value; emit(); });
    expectedType.addEventListener('change', () => { t.expected = expectedType.value; emit(); });
    expectedSchema.addEventListener('input', () => { t.expected = expectedSchema.value; emit(); });
    const line = h('div', { class: `ts-row${t.enabled === false ? ' off' : ''}`, dataset: { id: t.id } }, check, target, path, op, expWrap, del);
    paintOps(); paintFields();
    return line;
  }

  function paint() {
    mount(rowsEl, draft.tests.length ? draft.tests.map(rowEl)
      : h('div', { class: 'muted small' }, 'No checks yet. Add one, or press "Suggest checks" after a response. You can also hover a value in the JSON response and press "test".'));
  }

  const add = (t) => { draft.tests.push(t); paint(); emit(); };
  const el = h('div', { class: 'ts' },
    h('div', { class: 'muted small' }, 'Checks run on every response. You can use {{variables}} in paths and expected values.'),
    rowsEl,
    h('div', { class: 'ts-actions' },
      h('button', { type: 'button', class: 'btn-ghost btn-sm', onclick: () => { add(newTest('status')); rowsEl.querySelector('.ts-row:last-child input[aria-label="Expected value"]')?.focus(); } }, '+ Add check'),
      h('button', { type: 'button', class: 'btn-ghost btn-sm', title: 'Add checks for the status, time, content type and top-level JSON fields of the last response', onclick: () => {
        const list = onSuggest();
        if (!list) { mount(resultsEl, h('div', { class: 'muted small' }, 'Send the request first, then suggest checks from its response.')); return; }
        const have = new Set(draft.tests.map(x => `${x.target}|${x.path}|${x.op}`));
        const fresh = list.filter(x => !have.has(`${x.target}|${x.path}|${x.op}`));
        draft.tests.push(...fresh); paint(); emit();
        mount(resultsEl, h('div', { class: 'muted small' }, fresh.length ? `Added ${fresh.length} check${fresh.length === 1 ? '' : 's'} from the last response. Edit or delete any you don't need.` : 'These checks are already there.'));
      } }, '✨ Suggest checks')),
    resultsEl);
  paint();

  return {
    el,
    refresh: paint,
    add,
    count: () => draft.tests.filter(t => t.enabled !== false).length,
  };
}
