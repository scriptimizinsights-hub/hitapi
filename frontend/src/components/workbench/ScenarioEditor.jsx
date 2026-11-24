/**
 * Web Workbench (W6) — edit and run a scenario. Shown in place of the request
 * and response while a scenario is open.
 *
 *   left   steps: order (drag or ↑↓), on/off, wait before, repeat, stop or continue on failure; add steps; data rows
 *   right  the run: live progress, each step's status, time, tests and variables set; re-run failed steps
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowLeft, ArrowUp, ArrowDown, Trash2, Play, Square, RotateCcw, GripVertical, FileUp } from 'lucide-react';
import { find, walk } from '@hitapi/shared/collections.js';
import { newStep, parseData, reportSummary, failedSteps, MAX_REPEAT } from '@hitapi/shared/scenarios.js';
import { formatBytes } from '@hitapi/shared/http.js';

/** The request a step sends: { draft, name, where } or null (saved request deleted). */
export function requestOfStep(step, tree) {
  if (step.kind === 'inline') return { draft: step.draft, name: step.name || 'Request', where: 'copy in this scenario', ancestors: [] };
  const f = find(tree, step.requestId);
  if (!f || f.node.type !== 'request') return null;
  return { draft: f.node.draft, name: f.node.name, where: f.ancestors.map(a => a.name).join(' / '), ancestors: f.ancestors };
}

function Num({ value, min, max, label, onSet }) {
  return <input className="input wbw-num" type="number" min={min} max={max} value={value} aria-label={label}
    onChange={(e) => onSet(Math.max(min, Math.min(max, Math.floor(Number(e.target.value) || 0))))} />;
}

function DataSection({ data, onChange }) {
  const fileRef = useRef(null);
  const info = useMemo(() => {
    try {
      const rows = parseData(data);
      return rows.length ? { ok: true, text: `${rows.length} run${rows.length === 1 ? '' : 's'}, one per row. Variables: ${Object.keys(rows[0]).map(k => `{{${k}}}`).join(', ')}` } : { text: 'No data: the scenario runs once.' };
    } catch (e) { return { error: true, text: e.message }; }
  }, [data]);
  return (
    <details className="wbw-sc-data" open={!!data.text.trim()}>
      <summary className="text-sm">Data-driven runs{data.text.trim() ? <span className="text-xs text-tertiary"> (on)</span> : null}</summary>
      <p className="text-xs text-tertiary">Run the whole scenario once per row. Each column is a {'{{variable}}'} for that run (it wins over the environment).</p>
      <div className="wbw-row">
        <select className="input wbw-sc-fmt" aria-label="Data format" value={data.format} onChange={(e) => onChange({ ...data, format: e.target.value })}>
          <option value="csv">CSV</option><option value="json">JSON</option>
        </select>
        <button type="button" className="btn btn-ghost btn-sm" onClick={() => fileRef.current?.click()}><FileUp size={12} /> Load a file…</button>
        <input ref={fileRef} type="file" hidden accept=".csv,.json,text/csv,application/json" aria-label="Data file" onChange={async (e) => {
          const f = e.target.files?.[0]; e.target.value = '';
          if (!f) return;
          const text = await f.text();
          onChange({ text, format: /\.json$/i.test(f.name) || text.trim().startsWith('[') ? 'json' : 'csv' });
        }} />
      </div>
      <textarea className="input font-mono wbw-sc-datatext" rows={5} spellCheck={false} aria-label="Data for the runs" value={data.text}
        placeholder={data.format === 'json' ? '[{"user": "asha", "password": "…"}, {"user": "ben", "password": "…"}]' : 'user,password\nasha,secret1\nben,secret2'}
        onChange={(e) => onChange({ ...data, text: e.target.value })} />
      <div className={`text-xs ${info.error ? 'text-red' : info.ok ? 'text-green' : 'text-tertiary'} wbw-sc-datainfo`} role="status">{info.text}</div>
    </details>
  );
}

function StepCard({ step, index, count, tree, onChange, onMove, onRemove, onOpen, drag }) {
  const req = requestOfStep(step, tree);
  const method = String(req?.draft?.method || 'GET').toUpperCase();
  const tests = (req?.draft?.tests || []).filter(t => t.enabled !== false).length;
  const sets = (req?.draft?.extract || []).filter(r => r.enabled !== false && r.name).length;
  return (
    <div className={`wbw-sc-step${step.enabled ? '' : ' off'}${req ? '' : ' missing'}${drag.over === step.id ? ` drop-${drag.where}` : ''}`} data-id={step.id} draggable
      onDragStart={(e) => { if (e.target.closest?.('input, select, button, textarea')) { e.preventDefault(); return; } drag.start(step.id, e); }}
      onDragEnd={drag.end} onDragOver={(e) => drag.over_(step.id, e)} onDrop={(e) => drag.drop(step.id, e)}>
      <div className="wbw-sc-step-head">
        <span className="wbw-sc-grip" aria-hidden="true" title="Drag to reorder"><GripVertical size={13} /></span>
        <span className="wbw-sc-num">{index + 1}</span>
        <input type="checkbox" checked={step.enabled} aria-label="Run this step" onChange={(e) => onChange({ ...step, enabled: e.target.checked })} />
        {req && <span className={`method-badge method-${method}`}>{method.slice(0, 6)}</span>}
        <span className="wbw-sc-step-name">
          <span className="truncate">{req ? req.name : 'Saved request was deleted'}</span>
          <span className="text-xs text-tertiary truncate">{req ? req.where : 'remove this step or add it again'}</span>
        </span>
        {req && <button type="button" className="btn btn-ghost btn-sm wbw-sc-openstep" title={step.kind === 'inline' ? 'Open this step to edit it' : 'Open the saved request'} onClick={() => onOpen(step)}>Open</button>}
        <button type="button" className="btn btn-ghost btn-icon" aria-label="Move up" disabled={index === 0} onClick={() => onMove(index, index - 1)}><ArrowUp size={12} /></button>
        <button type="button" className="btn btn-ghost btn-icon" aria-label="Move down" disabled={index === count - 1} onClick={() => onMove(index, index + 1)}><ArrowDown size={12} /></button>
        <button type="button" className="btn btn-ghost btn-icon" aria-label="Remove step" onClick={onRemove}><Trash2 size={12} /></button>
      </div>
      <div className="wbw-sc-step-opts text-xs">
        <label>Wait <Num value={step.delayMs} min={0} max={600000} label="Wait before this step (ms)" onSet={(v) => onChange({ ...step, delayMs: v })} /> ms first</label>
        <label>Repeat <Num value={step.repeat} min={1} max={MAX_REPEAT} label="Repeat this step" onSet={(v) => onChange({ ...step, repeat: Math.max(1, v) })} />×</label>
        <label>If it fails <select className="input" aria-label="If the step fails" value={step.onFail} onChange={(e) => onChange({ ...step, onFail: e.target.value })}>
          <option value="stop">stop the run</option><option value="continue">continue</option>
        </select></label>
        {req && <span className="text-tertiary">{tests} test{tests === 1 ? '' : 's'} · {sets} set var{sets === 1 ? '' : 's'}</span>}
      </div>
    </div>
  );
}

function Report({ scenario, report, running, paused, envLabel, tree, onOpenResult }) {
  if (!report) {
    return (
      <div className="wbw-sc-report">
        <div className="wbw-rn-head"><div><strong>Not run yet</strong><div className="text-xs text-tertiary">Environment: {envLabel}</div></div></div>
        <p className="text-sm text-tertiary">Press Run. Steps run in order with the environment picked in the toolbar and the "Send from" choice; each step's Tests decide whether it passed (or, without tests, a status below 400).</p>
      </div>
    );
  }
  const sm = reportSummary(report);
  const total = report.results.length;
  const stepIndex = new Map(scenario.steps.map((x, i) => [x.id, i]));
  const note = running ? '' : report.status === 'failed-stop' ? 'Stopped at the first failed step (set a step to "continue" to keep going).' : report.status === 'stopped' ? 'You stopped the run.' : '';
  return (
    <div className="wbw-sc-report" aria-live="polite">
      <div className="wbw-rn-head">
        <div>
          <strong>{running ? 'Running…' : 'Last run'}</strong>
          <div className={`text-xs ${paused ? 'text-amber' : 'text-tertiary'}`} role="status">
            {paused ? `Paused: HitAPI cloud's limit of requests a minute was reached. Carrying on in ${paused} s…`
              : <>Environment: {envLabel}{!running ? ` · ${new Date(report.finishedAt || report.startedAt).toLocaleString()}` : ''}{report.iterations > 1 ? ` · ${report.iterations} data rows` : ''}</>}
          </div>
        </div>
        <span className="wbw-grow" />
        <span className="wbw-rn-sum ok">{sm.passed} passed</span>
        <span className={`wbw-rn-sum${sm.failed ? ' bad' : ''}`}>{sm.failed} failed</span>
        <span className="text-xs text-tertiary">{sm.ms} ms</span>
      </div>
      <div className="wbw-rn-bar" aria-hidden="true"><span className="ok" style={{ width: `${total ? (sm.passed / total) * 100 : 0}%` }} /><span className="bad" style={{ width: `${total ? (sm.failed / total) * 100 : 0}%` }} /></div>
      {note && <p className="text-xs text-tertiary wbw-sc-note">{note}</p>}
      {report.only && <p className="text-xs text-tertiary">Re-ran {report.only.length} failed step{report.only.length === 1 ? '' : 's'} only.</p>}
      <ol className="wbw-rn-list">
        {report.results.map((r, i) => {
          const step = scenario.steps.find(x => x.id === r.stepId);
          const req = step && requestOfStep(step, tree);
          const state = r.running ? 'now' : r.pass ? 'ok' : 'bad';
          const method = String(r.method || req?.draft?.method || 'GET').toUpperCase();
          const failedTest = r.tests?.find(t => !t.pass);
          const tests = r.tests?.length ? `${r.tests.filter(t => t.pass).length}/${r.tests.length} tests` : '';
          return (
            <li key={i} className={`wbw-rn-item ${state}`}>
              <button type="button" className="wbw-rn-open" disabled={r.running || !step} title="Open this step with its response" onClick={() => onOpenResult(r, step)}>
                <span className="wbw-rn-mark" aria-hidden="true">{{ ok: '✓', bad: '✗', now: '…' }[state]}</span>
                <span className={`method-badge method-${method}`}>{method.slice(0, 6)}</span>
                <span className="wbw-rn-name">
                  <span>{stepIndex.has(r.stepId) ? stepIndex.get(r.stepId) + 1 : '?'}. {r.name || req?.name || 'Step'}
                    {report.iterations > 1 && <span className="text-xs text-tertiary"> · row {r.iteration + 1}</span>}
                    {r.attempt > 0 && <span className="text-xs text-tertiary"> · repeat {r.attempt + 1}</span>}</span>
                  {r.error ? <span className="wbw-rn-err text-xs">{String(r.error).split('\n')[0]}</span> : failedTest ? <span className="wbw-rn-err text-xs">✗ {failedTest.message || 'a check failed'}</span> : null}
                  {r.setVars?.length > 0 && <span className="text-xs text-tertiary wbw-sc-setvars">set {r.setVars.join(', ')}</span>}
                </span>
                <span className="wbw-rn-meta text-xs text-tertiary">{r.running ? '' : <>{tests && <span className={r.pass ? 'text-green' : 'text-red'}>{tests} · </span>}{r.error ? '' : `${r.ms} ms · ${formatBytes(r.size || 0)}`}</>}</span>
                <span className={`wbw-st sm ${r.running ? 'gray' : r.pass ? 'green' : 'red'}`}>{r.running ? '' : r.error ? (r.kind === 'cancel' ? 'Stopped' : 'Error') : String(r.status)}</span>
              </button>
            </li>
          );
        })}
      </ol>
    </div>
  );
}

/**
 * @param {object} p
 * @param {object} p.scenario      the scenario being edited (parent keeps it and saves it)
 * @param {(s) => void} p.onChange
 * @param {() => object|null} p.currentRequest  { draft, name, savedId } of the open request
 */
export function ScenarioEditor({ scenario: s, onChange, tree, report, running, paused, envLabel, focusName, onRun, onStop, onBack, onOpenStep, onOpenResult, currentRequest }) {
  const [hint, setHint] = useState('');
  const [drag, setDrag] = useState({ id: null, over: null, where: null });
  const nameRef = useRef(null);
  useEffect(() => { if (focusName) { nameRef.current?.focus(); nameRef.current?.select(); } }, [focusName, s.id]);

  const setSteps = (steps) => onChange({ ...s, steps });
  const move = (from, to) => { if (to < 0 || to >= s.steps.length) return; const steps = [...s.steps]; const [x] = steps.splice(from, 1); steps.splice(to, 0, x); setSteps(steps); };
  const failed = report && !running ? failedSteps(report) : new Set();
  const saved = useMemo(() => { const out = []; walk(tree, (n, _p, anc) => { if (n.type === 'request') out.push({ id: n.id, label: [...anc.map(a => a.name), n.name].join(' / '), method: n.draft?.method || 'GET' }); }); return out; }, [tree]);

  const dragApi = {
    over: drag.over, where: drag.where,
    start: (id, e) => { e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', id); setDrag({ id, over: null, where: null }); },
    end: () => setDrag({ id: null, over: null, where: null }),
    over_: (id, e) => {
      if (!drag.id || drag.id === id) return;
      e.preventDefault();
      const r = e.currentTarget.getBoundingClientRect(); const where = e.clientY > r.top + r.height / 2 ? 'after' : 'before';
      if (drag.over !== id || drag.where !== where) setDrag((d) => ({ ...d, over: id, where }));
    },
    drop: (id, e) => {
      e.preventDefault();
      const from = s.steps.findIndex(x => x.id === drag.id);
      const where = drag.where;
      setDrag({ id: null, over: null, where: null });
      if (from < 0 || drag.id === id) return;
      const steps = [...s.steps]; const [x] = steps.splice(from, 1);
      const to = steps.findIndex(y => y.id === id) + (where === 'after' ? 1 : 0);
      steps.splice(to, 0, x); setSteps(steps);
    },
  };

  return (
    <section className="card wbw-scenario" aria-label="Scenario">
      <div className="wbw-sc-head">
        <button type="button" className="btn btn-ghost btn-sm wbw-sc-back" onClick={onBack} title="Back to the request"><ArrowLeft size={12} /> Request</button>
        <input ref={nameRef} className="input wbw-sc-title" aria-label="Scenario name" maxLength={120} value={s.name} onChange={(e) => onChange({ ...s, name: e.target.value })}
          onBlur={() => { if (!s.name.trim()) onChange({ ...s, name: 'Scenario' }); }} />
        <span className="wbw-grow" />
        {running ? <button type="button" className="btn btn-danger btn-sm wbw-sc-stop" onClick={onStop}><Square size={12} /> Stop</button> : <>
          {failed.size > 0 && <button type="button" className="btn btn-ghost btn-sm wbw-sc-rerun" title="Run only the steps that failed last time" onClick={() => onRun(failed)}><RotateCcw size={12} /> Re-run {failed.size} failed</button>}
          <button type="button" className="btn btn-primary btn-sm wbw-sc-run" disabled={!s.steps.some(x => x.enabled)} onClick={() => onRun(null)}><Play size={12} /> Run</button>
        </>}
      </div>
      <div className="wbw-sc-body">
        <div className="wbw-sc-left">
          <div className="text-xs text-tertiary wbw-sc-label">Steps</div>
          {s.steps.length ? s.steps.map((st, i) => (
            <StepCard key={st.id} step={st} index={i} count={s.steps.length} tree={tree} drag={dragApi}
              onChange={(n) => setSteps(s.steps.map(x => (x.id === st.id ? n : x)))} onMove={move} onRemove={() => setSteps(s.steps.filter(x => x.id !== st.id))} onOpen={onOpenStep} />
          )) : <p className="text-sm text-tertiary wbw-sc-empty">No steps yet. Add saved requests (they stay linked: edit the request and the scenario uses the new version) or a copy of the request you have open.</p>}
          <div className="wbw-sc-add">
            <select className="input wbw-sc-pick" aria-label="Add a saved request as a step" value="" disabled={!saved.length}
              onChange={(e) => { if (e.target.value) setSteps([...s.steps, newStep('saved', { requestId: e.target.value })]); }}>
              <option value="">{saved.length ? '+ Add a saved request…' : 'No saved requests yet (save one with Ctrl/⌘ + S)'}</option>
              {saved.map(x => <option key={x.id} value={x.id}>{String(x.method).toUpperCase()}  {x.label}</option>)}
            </select>
            <button type="button" className="btn btn-ghost btn-sm wbw-sc-addcur" title="A saved request stays linked; an unsaved one is copied into the scenario" onClick={() => {
              const cur = currentRequest();
              if (!cur?.draft?.url) { setHint('Open or type a request first, then add it.'); return; }
              setHint('');
              setSteps([...s.steps, cur.savedId ? newStep('saved', { requestId: cur.savedId }) : newStep('inline', { name: cur.name, draft: cur.draft })]);
            }}>+ Add the current request</button>
          </div>
          {hint && <p className="text-xs text-amber" role="alert">{hint}</p>}
          <DataSection data={s.data} onChange={(data) => onChange({ ...s, data })} />
        </div>
        <Report scenario={s} report={report} running={running} paused={paused} envLabel={envLabel} tree={tree} onOpenResult={onOpenResult} />
      </div>
    </section>
  );
}
