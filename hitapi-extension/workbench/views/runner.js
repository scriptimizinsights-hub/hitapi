/**
 * workbench/views/runner.js — run every request of a collection or folder in
 * order (roadmap feature 6; assertions and scenarios come with features 8 and 9).
 * Shown in place of the response. A request passes when all its tests pass
 * (roadmap feature 8), or, when it has none, when it gets an answer below 400.
 */

import { h, mount } from '../../ui/core/dom.js';
import { formatBytes } from '../../shared/http.js';

const passed = (r) => !!r && !r.error && (r.tests?.length ? r.tests.every(t => t.pass) : r.status > 0 && r.status < 400);
const testText = (r) => { if (!r?.tests?.length) return ''; const n = r.tests.filter(t => t.pass).length; return `${n}/${r.tests.length} tests`; };

/**
 * @param {object} o
 * @param {string} o.title
 * @param {Array<{ node, ancestors }>} o.items
 * @param {(item, signal: AbortSignal) => Promise<object>} o.runOne   → response (or { error })
 * @param {(item, res) => void} o.onOpen
 * @param {() => void} o.onClose
 */
export function createRunner({ title, items, runOne, onOpen, onClose }) {
  const results = items.map(() => null);
  let index = -1;
  let controller = new AbortController();
  let running = true;
  let delayMs = 0;
  const el = h('section', { class: 'wb-response wb-runner', 'aria-label': 'Runner', 'aria-live': 'polite' });

  const stop = () => { running = false; controller.abort('cancel'); paint(); };

  function paint() {
    const done = results.filter(Boolean).length;
    const ok = results.filter(passed).length;
    const bad = done - ok;
    const total = results.reduce((n, r) => n + (r?.ms || 0), 0);
    const statusText = running ? `Running ${Math.min(index + 1, items.length)} of ${items.length}…`
      : done < items.length ? `Stopped after ${done} of ${items.length}` : 'Finished';
    mount(el,
      h('div', { class: 'rn-head' },
        h('div', {},
          h('strong', {}, `Run: ${title}`),
          h('div', { class: 'muted small' }, statusText, ` · ${total} ms in all`)),
        h('span', { class: 'grow' }),
        h('span', { class: 'rn-sum rn-ok' }, `${ok} passed`),
        h('span', { class: `rn-sum${bad ? ' rn-bad' : ''}` }, `${bad} failed`),
        running ? h('button', { type: 'button', class: 'btn-danger btn-sm', onclick: stop }, 'Stop')
          : h('button', { type: 'button', class: 'btn-ghost btn-sm', onclick: () => start() }, 'Run again'),
        running ? null : h('button', { type: 'button', class: 'btn-ghost btn-sm', onclick: onClose, title: 'Back to the response view' }, 'Close')),
      h('div', { class: 'rn-bar' }, h('span', { class: 'rn-bar-ok', style: { width: `${(ok / items.length) * 100}%` } }), h('span', { class: 'rn-bar-bad', style: { width: `${(bad / items.length) * 100}%` } })),
      running ? null : h('label', { class: 'rn-delay small muted' }, 'Wait between requests ',
        h('input', { type: 'number', min: '0', max: '60000', step: '100', value: String(delayMs), class: 'wb-num', 'aria-label': 'Delay between requests in ms', oninput: (e) => { delayMs = Math.max(0, Math.min(60000, Number(e.target.value) || 0)); } }), ' ms'),
      h('ol', { class: 'rn-list' }, items.map((it, i) => {
        const r = results[i];
        const state = r ? (passed(r) ? 'ok' : 'bad') : i === index && running ? 'now' : 'wait';
        return h('li', { class: `rn-item rn-${state}` },
          h('button', { type: 'button', class: 'rn-open', disabled: !r, title: r ? 'Open this request with its response' : '', onclick: () => onOpen(it, r) },
            h('span', { class: 'rn-mark', 'aria-hidden': 'true' }, { ok: '✓', bad: '✗', now: '…', wait: '·' }[state]),
            h('span', { class: 'hs-method', dataset: { method: it.node.draft.method } }, String(it.node.draft.method).slice(0, 6)),
            h('span', { class: 'rn-name' }, h('span', {}, it.node.name), it.ancestors.length > 1 ? h('span', { class: 'muted small' }, ` · ${it.ancestors.slice(1).map(a => a.name).join(' / ')}`) : null,
              r?.error ? h('span', { class: 'rn-err small' }, r.error.split('\n')[0]) : null,
              !r?.error && r?.tests?.some(t => !t.pass) ? h('span', { class: 'rn-err small' }, (() => { const f = r.tests.find(t => !t.pass); return `✗ ${f.message || 'check failed'}`; })()) : null),
            h('span', { class: 'rn-meta small muted' }, r && !r.error ? [testText(r) ? h('span', { class: passed(r) ? 'text-green' : 'text-red' }, `${testText(r)} · `) : '', `${r.ms} ms · ${formatBytes(r.size || 0)}`] : ''),
            h('span', { class: `hs-status wb-code-${r ? (passed(r) ? 'ok' : 'err') : ''}` }, r ? (r.error ? (r.kind === 'cancel' ? 'Stopped' : 'Error') : String(r.status)) : '')));
      })));
  }

  async function start() {
    results.fill(null);
    controller = new AbortController();
    running = true;
    for (index = 0; index < items.length; index++) {
      if (!running) break;
      paint();
      const res = await runOne(items[index], controller.signal).catch(e => ({ error: e.message, kind: 'error' }));
      results[index] = res;
      if (res?.kind === 'cancel') break;
      if (delayMs && index < items.length - 1 && running) await new Promise(r => setTimeout(r, delayMs));
    }
    running = false;
    paint();
  }

  paint();
  start();
  return { el, stop, isRunning: () => running };
}
