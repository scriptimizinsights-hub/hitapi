/**
 * Web Workbench (W3) — run every request of a collection or folder, in order.
 * Shown in place of the response. Same pass rule as the HitAPI extension: a
 * request passes when all its tests pass, or, when it has none, when it gets
 * an answer below 400.
 *
 * HitAPI cloud allows a set number of requests a minute. When a run hits that
 * limit it pauses until the next minute and carries on, instead of failing.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { Play, Square, X, RotateCcw } from 'lucide-react';
import { formatBytes } from '@hitapi/shared/http.js';

const DELAY_KEY = 'hitapi:web:runDelay';
export const passed = (r) => !!r && !r.error && (r.tests?.length ? r.tests.every(t => t.pass) : r.status > 0 && r.status < 400);
const testText = (r) => { if (!r?.tests?.length) return ''; const n = r.tests.filter(t => t.pass).length; return `${n}/${r.tests.length} tests`; };
const sleep = (ms, signal) => new Promise((res) => { const t = setTimeout(res, ms); signal?.addEventListener('abort', () => { clearTimeout(t); res(); }, { once: true }); });
/** ms until the cloud's per-minute window starts again (+1 s to be safe) */
export const untilNextMinute = () => 60_000 - (Date.now() % 60_000) + 1000;

/**
 * @param {object} p
 * @param {string} p.title
 * @param {Array<{ node, ancestors }>} p.items
 * @param {(item, signal) => Promise<object>} p.runOne   → response record (or { error, kind })
 * @param {(index, res) => void} p.onOpen
 * @param {() => void} p.onClose
 * @param {boolean} p.hidden   kept mounted (results stay) while a result is open in the editor
 */
export function Runner({ runKey, title, items, runOne, onOpen, onClose, hidden, waitFn = untilNextMinute }) {
  const [results, setResults] = useState(() => items.map(() => null));
  const [index, setIndex] = useState(-1);
  const [running, setRunning] = useState(false);
  const [paused, setPaused] = useState(0);         // seconds left in a rate-limit pause
  const [delayMs, setDelayState] = useState(() => { try { return Math.max(0, Math.min(60000, Number(localStorage.getItem(DELAY_KEY)) || 0)); } catch { return 0; } });
  const setDelayMs = (v) => { setDelayState(v); try { localStorage.setItem(DELAY_KEY, String(v)); } catch { /* ignore */ } };
  const ctrl = useRef(null);
  const delayRef = useRef(0);
  delayRef.current = delayMs;

  const start = useCallback(async () => {
    ctrl.current?.abort('cancel');
    const c = new AbortController(); ctrl.current = c;
    const out = items.map(() => null);
    setResults(out.slice()); setRunning(true); setPaused(0);
    for (let i = 0; i < items.length; i++) {
      if (c.signal.aborted) break;
      setIndex(i);
      let res;
      for (;;) {
        res = await runOne(items[i], c.signal).catch(e => ({ error: e.message, kind: 'error' }));
        if (res?.kind !== 'rate' || c.signal.aborted) break;
        // HitAPI cloud's per-minute limit: wait for the next minute, then try this request again
        const until = Date.now() + waitFn();
        while (Date.now() < until && !c.signal.aborted) { setPaused(Math.ceil((until - Date.now()) / 1000)); await sleep(Math.min(1000, until - Date.now()), c.signal); }
        setPaused(0);
        if (c.signal.aborted) { res = { error: 'Request cancelled.', kind: 'cancel' }; break; }
      }
      if (c.signal.aborted && res?.kind !== 'cancel' && !res?.status) res = { error: 'Request cancelled.', kind: 'cancel' };
      out[i] = res;
      setResults(out.slice());
      if (res?.kind === 'cancel') break;
      if (delayRef.current && i < items.length - 1) await sleep(delayRef.current, c.signal);
    }
    if (ctrl.current === c) { ctrl.current = null; setRunning(false); setPaused(0); }
  }, [items, runOne, waitFn]);

  // a new run (another collection, or Run again from the menu) starts at once
  useEffect(() => { start(); return () => ctrl.current?.abort('cancel'); }, [runKey]);   // eslint-disable-line react-hooks/exhaustive-deps

  const stop = () => { ctrl.current?.abort('cancel'); };
  const done = results.filter(Boolean).length;
  const ok = results.filter(passed).length;
  const bad = done - ok;
  const totalMs = results.reduce((n, r) => n + (r?.ms || 0), 0);
  const statusText = paused ? `Paused: HitAPI cloud's limit of requests a minute was reached. Carrying on in ${paused} s…`
    : running ? `Running ${Math.min(index + 1, items.length)} of ${items.length}…`
      : done < items.length ? `Stopped after ${done} of ${items.length}` : 'Finished';

  return (
    <div className="wbw-runner" hidden={hidden} aria-label="Runner">
      <div className="wbw-rn-head">
        <div className="wbw-rn-title">
          <strong>Run: {title}</strong>
          <div className={`text-xs ${paused ? 'text-amber' : 'text-tertiary'}`} role="status">{statusText} · {totalMs} ms in all</div>
        </div>
        <span className="wbw-grow" />
        <span className="wbw-rn-sum ok">{ok} passed</span>
        <span className={`wbw-rn-sum${bad ? ' bad' : ''}`}>{bad} failed</span>
        {running ? <button type="button" className="btn btn-danger btn-sm wbw-rn-stop" onClick={stop}><Square size={12} /> Stop</button>
          : <button type="button" className="btn btn-ghost btn-sm wbw-rn-again" onClick={start}><RotateCcw size={12} /> Run again</button>}
        {!running && <button type="button" className="btn btn-ghost btn-icon" aria-label="Close the run" title="Back to the response" onClick={onClose}><X size={14} /></button>}
      </div>
      <div className="wbw-rn-bar" aria-hidden="true"><span className="ok" style={{ width: `${(ok / items.length) * 100}%` }} /><span className="bad" style={{ width: `${(bad / items.length) * 100}%` }} /></div>
      {!running && (
        <label className="wbw-rn-delay text-xs text-tertiary">Wait between requests
          <input className="input" type="number" min="0" max="60000" step="100" value={delayMs} aria-label="Delay between requests in ms"
            onChange={(e) => setDelayMs(Math.max(0, Math.min(60000, Number(e.target.value) || 0)))} /> ms
        </label>
      )}
      <ol className="wbw-rn-list">
        {items.map((it, i) => {
          const r = results[i];
          const state = r ? (passed(r) ? 'ok' : 'bad') : i === index && running ? 'now' : 'wait';
          const method = String(it.node.draft?.method || 'GET').toUpperCase();
          const failedTest = !r?.error && r?.tests?.find(t => !t.pass);
          return (
            <li key={it.node.id} className={`wbw-rn-item ${state}`}>
              <button type="button" className="wbw-rn-open" disabled={!r} title={r ? 'Open this request with its response' : ''} onClick={() => onOpen(i, r)}>
                <span className="wbw-rn-mark" aria-hidden="true">{{ ok: '✓', bad: '✗', now: '…', wait: '·' }[state]}</span>
                <span className={`method-badge method-${method}`}>{method.slice(0, 6)}</span>
                <span className="wbw-rn-name">
                  <span>{it.node.name}</span>
                  {it.ancestors.length > 1 && <span className="text-xs text-tertiary"> · {it.ancestors.slice(1).map(a => a.name).join(' / ')}</span>}
                  {r?.error && <span className="wbw-rn-err text-xs">{String(r.error).split('\n')[0]}</span>}
                  {failedTest && <span className="wbw-rn-err text-xs">✗ {failedTest.message || 'check failed'}</span>}
                </span>
                <span className="wbw-rn-meta text-xs text-tertiary">{r && !r.error ? <>{testText(r) && <span className={passed(r) ? 'text-green' : 'text-red'}>{testText(r)} · </span>}{r.ms} ms · {formatBytes(r.size || 0)}</> : ''}</span>
                <span className={`wbw-st sm ${r ? (passed(r) ? 'green' : 'red') : 'gray'}`}>{r ? (r.error ? (r.kind === 'cancel' ? 'Stopped' : 'Error') : String(r.status)) : ''}</span>
              </button>
            </li>
          );
        })}
      </ol>
      {!running && done === items.length && <p className="text-xs text-tertiary"><Play size={10} /> Click a request to open it with its response.</p>}
    </div>
  );
}
