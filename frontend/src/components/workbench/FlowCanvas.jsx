/**
 * Web Workbench (W10) — the flow builder: a scenario drawn as a canvas.
 *
 *   left    steps to add: saved requests, (signed in) project endpoints, a new request; drag onto
 *           the canvas or press +
 *   middle  the canvas: cards anywhere, a line from each step to the next (the run order), dashed
 *           lines where data skips steps; drag a card to move it, drag from its right port onto
 *           another card to make that card run next; pan by dragging the background
 *   right   the selected step: Configure (inputs it needs and where they come from, checks, what
 *           happens on failure) and Preview / Output (the last run); nothing selected: the run
 *           report and data-driven runs
 *
 * Everything is saved as the scenario (see flow-model.js), so list view, runs, the CLI, cloud
 * schedules and sync keep working.
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import { Plus, Trash2, ZoomIn, ZoomOut, Maximize2, LayoutGrid, Play, ExternalLink, X, Search, ArrowUp, ArrowDown } from 'lucide-react';
import { walk } from '@hitapi/shared/collections.js';
import { newStep, parseData, MAX_REPEAT } from '@hitapi/shared/scenarios.js';
import { describe as describeTest } from '@hitapi/shared/assert.js';
import { formatBytes } from '@hitapi/shared/http.js';
import { api } from '../../store/index.js';
import { emptyDraft } from './core.js';
import {
  NODE_W, GAP, positions, autoPos, freeSpot, needsOf, givesOf, producedBefore, lastResults, linksOf, missingInputs,
  suggestName, ensureRule, fillNeed, passInto, endpointStep,
} from './flow-model.js';

const PORT_Y = 38;
const NOISE = /^(connection|date|keep-alive|transfer-encoding|content-length|server|vary|alt-svc|via|cf-|report-to|nel|access-control-|x-powered-by|strict-transport|expires|pragma|age)/i;
const DYN = ['$uuid', '$randomEmail', '$randomName', '$timestamp', '$randomInt'];
const listOf = (data, key) => (Array.isArray(data) ? data : Array.isArray(data?.[key]) ? data[key] : []);
const methodOf = (d) => String(d?.method || 'GET').toUpperCase();
const shortUrl = (u) => String(u || '').replace(/^\{\{\s*baseUrl\s*\}\}/, '').replace(/^[a-z][\w+.-]*:\/\/[^/]+/i, '') || String(u || '') || '(no URL yet)';
const WHERE = { path: 'path', var: 'variable', header: 'header', query: 'query' };

function useCompact() {
  const q = '(max-width: 760px)';
  const [c, setC] = useState(() => typeof window !== 'undefined' && window.matchMedia?.(q).matches);
  useEffect(() => { const m = window.matchMedia?.(q); if (!m) return; const f = () => setC(m.matches); m.addEventListener('change', f); return () => m.removeEventListener('change', f); }, []);
  return c;
}

/** Project endpoints for the palette (signed in). */
function useEndpoints(signedIn) {
  const [st, setSt] = useState({ projects: [], pid: '', eps: [], loading: false, error: '' });
  useEffect(() => {
    if (!signedIn) return;
    let live = true;
    api.projects.list().then((d) => { if (!live) return; const projects = listOf(d, 'projects'); setSt(s => ({ ...s, projects, pid: s.pid || projects[0]?.id || '' })); }).catch((e) => live && setSt(s => ({ ...s, error: e.message })));
    return () => { live = false; };
  }, [signedIn]);
  useEffect(() => {
    if (!signedIn || !st.pid) return;
    let live = true;
    setSt(s => ({ ...s, loading: true, eps: [] }));
    api.endpoints.list(st.pid).then((d) => live && setSt(s => ({ ...s, loading: false, eps: listOf(d, 'endpoints') }))).catch((e) => live && setSt(s => ({ ...s, loading: false, error: e.message })));
    return () => { live = false; };
  }, [signedIn, st.pid]);
  return [st, (pid) => setSt(s => ({ ...s, pid }))];
}

function Palette({ tree, signedIn, onAdd, compact }) {
  const [q, setQ] = useState('');
  const [eps, setPid] = useEndpoints(signedIn);
  const saved = useMemo(() => {
    const out = [];
    walk(tree, (n, _p, anc) => { if (n.type === 'request') out.push({ id: n.id, name: n.name, group: anc[0]?.name || '', method: methodOf(n.draft) }); });
    return out;
  }, [tree]);
  const match = (t) => !q.trim() || t.toLowerCase().includes(q.trim().toLowerCase());
  const groups = useMemo(() => { const m = new Map(); for (const r of saved) if (match(`${r.method} ${r.name} ${r.group}`)) { if (!m.has(r.group)) m.set(r.group, []); m.get(r.group).push(r); } return [...m]; }, [saved, q]);   // eslint-disable-line react-hooks/exhaustive-deps
  const project = eps.projects.find(p => p.id === eps.pid);
  const item = (key, payload, method, label, title) => (
    <div key={key} className="wbw-fpal-item" draggable role="listitem" title={title || 'Drag onto the canvas'}
      onDragStart={(e) => { e.dataTransfer.effectAllowed = 'copy'; e.dataTransfer.setData('application/x-hitapi-flow', JSON.stringify(payload)); }}>
      <span className={`wbw-fm m-${method.toLowerCase()}`}>{method}</span><span className="wbw-fpal-name">{label}</span>
      <button type="button" className="wbw-fpal-add" aria-label={`Add ${label} to the flow`} title="Add at the end" onClick={() => onAdd(payload)}><Plus size={12} /></button>
    </div>
  );
  if (compact) {
    return (
      <select className="input wbw-fpal-select" aria-label="Add a step" value="" onChange={(e) => { if (e.target.value) onAdd(JSON.parse(e.target.value)); }}>
        <option value="">+ Add a step…</option>
        <option value={JSON.stringify({ kind: 'new' })}>New request</option>
        {saved.map(r => <option key={r.id} value={JSON.stringify({ kind: 'saved', requestId: r.id })}>{r.method}  {r.group ? `${r.group} / ` : ''}{r.name}</option>)}
        {project && eps.eps.map(ep => <option key={ep.id} value={JSON.stringify({ kind: 'endpoint', project, ep })}>{String(ep.method).toUpperCase()}  {ep.path}</option>)}
      </select>
    );
  }
  return (
    <aside className="wbw-fpal" aria-label="Steps you can add">
      <div className="wbw-fpal-title">Add a step — drag onto the canvas</div>
      <label className="wbw-fpal-search"><Search size={12} /><input className="input" aria-label="Search requests" placeholder="Search requests" value={q} onChange={(e) => setQ(e.target.value)} /></label>
      <div role="list">
        {groups.map(([g, rows]) => (
          <div key={g || '-'}><div className="wbw-fpal-group">{g || 'Saved requests'}</div>
            {rows.map(r => item(r.id, { kind: 'saved', requestId: r.id }, r.method, r.name))}
          </div>
        ))}
        {!saved.length && <p className="text-xs text-tertiary">No saved requests yet. Save one (Ctrl/⌘ + S), or start with a new request.</p>}
        <div className="wbw-fpal-group">Project endpoints</div>
        {!signedIn ? <p className="text-xs text-tertiary">Sign in to add your HitAPI projects' endpoints, with their parameters from Swagger.</p> : <>
          {eps.projects.length > 1 && <select className="input wbw-fpal-proj" aria-label="Project" value={eps.pid} onChange={(e) => setPid(e.target.value)}>{eps.projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}</select>}
          {eps.error ? <p className="text-xs text-red">{eps.error}</p> : eps.loading ? <p className="text-xs text-tertiary">Loading…</p>
            : !eps.projects.length ? <p className="text-xs text-tertiary">No projects yet.</p>
            : !eps.eps.length ? <p className="text-xs text-tertiary">This project has no endpoints yet.</p>
            : eps.eps.filter(ep => match(`${ep.method} ${ep.path} ${ep.summary || ''}`)).map(ep => item(`ep-${ep.id}`, { kind: 'endpoint', project, ep }, String(ep.method).toUpperCase(), ep.path, ep.summary || ep.path))}
        </>}
        <div className="wbw-fpal-group">Other</div>
        {item('new', { kind: 'new' }, 'NEW', 'New request', 'An empty request, kept in this flow')}
      </div>
    </aside>
  );
}

/** Options for "where does this value come from". */
function SourceOptions({ scenario, index, reqOf, results, columns, scopeNames }) {
  const earlier = scenario.steps.slice(0, index);
  return <>
    {earlier.map((st, j) => {
      const req = reqOf(st);
      if (!req) return null;
      const g = givesOf(st, results.get(st.id)?.response);
      const nm = `${j + 1}. ${req.name}`;
      return (
        <optgroup key={st.id} label={`From step ${nm}${g.source === 'spec' ? ' (from the spec)' : g.source ? '' : ' — run once to see its fields'}`}>
          {g.fields.map(f => <option key={f.path} value={JSON.stringify({ t: 'step', stepId: st.id, from: 'json', path: f.path })}>{req.name} › {f.label}{f.sample && f.kind !== 'object' ? `  (${f.sample})` : ''}</option>)}
          {g.headers.filter(h => !NOISE.test(h)).slice(0, 25).map(h => <option key={`h-${h}`} value={JSON.stringify({ t: 'step', stepId: st.id, from: 'header', path: h })}>{req.name} › header {h}</option>)}
          <option value={JSON.stringify({ t: 'step', stepId: st.id, from: 'status', path: '' })}>{req.name} › status code</option>
          <option value={JSON.stringify({ t: 'path', stepId: st.id })}>{req.name} › type a path…</option>
        </optgroup>
      );
    })}
    <optgroup label="Or">
      <option value={JSON.stringify({ t: 'fixed' })}>A fixed value…</option>
      <option value={JSON.stringify({ t: 'env' })}>An environment variable…</option>
      {columns.map(c => <option key={`c-${c}`} value={JSON.stringify({ t: 'text', value: `{{${c}}}` })}>Data row column {c}</option>)}
      {DYN.map(d => <option key={d} value={JSON.stringify({ t: 'text', value: `{{${d}}}` })}>Generated {`{{${d}}}`}</option>)}
    </optgroup>
    {scopeNames.length > 0 && <optgroup label="Environment variables">{scopeNames.map(n => <option key={`e-${n}`} value={JSON.stringify({ t: 'text', value: `{{${n}}}` })}>{`{{${n}}}`}</option>)}</optgroup>}
  </>;
}

function filledLabel(n, scenario, reqOf) {
  if (!n.filled) return null;
  if (n.filled.by === 'step') {
    const i = scenario.steps.findIndex(x => x.id === n.filled.stepId);
    const req = i >= 0 ? reqOf(scenario.steps[i]) : null;
    const what = n.filled.from === 'header' ? `header ${n.filled.path}` : n.filled.from === 'status' ? 'status code' : String(n.filled.path || '').replace(/^\$\.?/, '');
    return `${i + 1}. ${req?.name || 'step'} › ${what}`;
  }
  return n.filled.by === 'data' ? 'Data row column' : 'From the environment';
}

/** The inline "type it" box for fixed values, environment names and paths. */
function AskBox({ ask, onDone, onCancel }) {
  const [v, setV] = useState(ask.t === 'path' ? '$.' : '');
  const label = ask.t === 'fixed' ? 'Value' : ask.t === 'env' ? 'Variable name' : 'JSONPath in the response';
  return (
    <form className="wbw-fask" onSubmit={(e) => { e.preventDefault(); if (v.trim()) onDone(v.trim()); }}>
      <input className="input font-mono" autoFocus aria-label={label} placeholder={ask.t === 'env' ? 'shopCode' : ask.t === 'path' ? '$.data.id' : 'value'} value={v} onChange={(e) => setV(e.target.value)} />
      <button type="submit" className="btn btn-primary btn-sm">Set</button>
      <button type="button" className="btn btn-ghost btn-sm" onClick={onCancel}>Cancel</button>
    </form>
  );
}

function Configure({ scenario: s, step, index, req, results, columns, scope, reqOf, apply, onStepChange, onOpenStep, onRemove, onMove, onRunTo, running }) {
  const produced = producedBefore(s, index, reqOf);
  const needs = req ? needsOf(step, req, { produced, scope, columns }) : [];
  const scopeNames = [...(scope?.keys?.() || [])].filter(n => n !== 'baseUrl').slice(0, 40);
  const [ask, setAsk] = useState(null);          // { key, t, stepId?, target? }
  const [pass, setPass] = useState({ kind: 'bearer', name: '' });
  const srcProps = { scenario: s, index, reqOf, results, columns, scopeNames };

  const choose = (need, raw, target = null) => {
    if (!raw) return;
    const c = JSON.parse(raw);
    if (c.t === 'fixed' || c.t === 'env' || c.t === 'path') { setAsk({ key: need?.key || 'pass', t: c.t, stepId: c.stepId, need, target }); return; }
    apply(need, c, target);
  };
  const answer = (v) => {
    const a = ask; setAsk(null);
    if (a.t === 'fixed') apply(a.need, { t: 'text', value: v }, a.target);
    else if (a.t === 'env') apply(a.need, { t: 'text', value: `{{${v.replace(/^\{\{\s*|\s*\}\}$/g, '')}}}` }, a.target);
    else apply(a.need, { t: 'step', stepId: a.stepId, from: 'json', path: v }, a.target);
  };

  return (
    <div className="wbw-fcfg">
      <section>
        <h4>Request</h4>
        <div className="wbw-freq font-mono"><span className={`wbw-fm m-${methodOf(req?.draft).toLowerCase()}`}>{methodOf(req?.draft)}</span> {req ? req.draft.url || '(no URL yet)' : 'The saved request was deleted.'}</div>
        <div className="wbw-row text-xs text-tertiary">
          <span className="wbw-grow">{step.kind === 'saved' ? `Saved request${req?.where ? ` in ${req.where}` : ''}: changes here change it everywhere it's used.` : 'A copy kept in this flow.'}</span>
          {req && <button type="button" className="btn btn-ghost btn-sm wbw-fopen" onClick={() => onOpenStep(step)}><ExternalLink size={11} /> Open to edit</button>}
        </div>
        {step.kind === 'inline' && <label className="wbw-field"><span>Step name</span><input className="input" aria-label="Step name" maxLength={120} value={step.name || ''} onChange={(e) => onStepChange({ ...step, name: e.target.value })} /></label>}
      </section>

      <section aria-label="Inputs this request needs">
        <h4>Inputs this request needs</h4>
        {!needs.length && <p className="text-xs text-tertiary">Nothing to fill in: no {'{{variables}}'} or path parameters like /users/{'{id}'}.</p>}
        {needs.map(n => (
          <div key={n.key} className={`wbw-fneed${n.filled ? '' : ' miss'}`} data-need={n.key}>
            <span className="wbw-fneed-name font-mono">{n.label} <small>{WHERE[n.where]}</small></span>
            <span className="wbw-fneed-arrow" aria-hidden="true">←</span>
            <select className="input font-mono" aria-label={`Value for ${n.label}`} value="" onChange={(e) => choose(n, e.target.value)}>
              <option value="">{n.filled ? filledLabel(n, s, reqOf) : 'Choose a value…'}</option>
              <SourceOptions {...srcProps} />
            </select>
          </div>
        ))}
        {ask && ask.key !== 'pass' && <AskBox ask={ask} onDone={answer} onCancel={() => setAsk(null)} />}
        {index > 0 && req && (
          <details className="wbw-fpass">
            <summary className="text-xs">+ Pass another value into this request</summary>
            <div className="wbw-row">
              <select className="input" aria-label="Put it in" value={pass.kind} onChange={(e) => setPass({ ...pass, kind: e.target.value })}>
                <option value="bearer">Bearer token</option><option value="header">Header</option><option value="query">Query parameter</option><option value="body">JSON body field</option>
              </select>
              {pass.kind !== 'bearer' && <input className="input font-mono" aria-label="Name" placeholder={pass.kind === 'header' ? 'X-Shop' : pass.kind === 'query' ? 'page' : 'userId'} value={pass.name} onChange={(e) => setPass({ ...pass, name: e.target.value })} />}
            </div>
            <select className="input font-mono" aria-label="Value to pass" value="" onChange={(e) => {
              if (pass.kind !== 'bearer' && !pass.name.trim()) { alertBox('Type the name first.'); return; }
              choose(null, e.target.value, { kind: pass.kind, name: pass.name.trim() });
            }}>
              <option value="">Choose the value…</option>
              <SourceOptions {...srcProps} />
            </select>
            {ask && ask.key === 'pass' && <AskBox ask={ask} onDone={answer} onCancel={() => setAsk(null)} />}
          </details>
        )}
        <p className="text-xs text-tertiary">Saved as a "Set vars" rule on the step that gives the value, and {'{{name}}'} here.</p>
      </section>

      <section>
        <h4>Checks</h4>
        <p className="text-xs text-tertiary">{req?.draft.tests?.length ? req.draft.tests.filter(t => t.enabled !== false).map(t => describeTest(t)).join(' · ') : 'None: the step passes when it gets a response.'}</p>
        {req && <button type="button" className="btn btn-ghost btn-sm" onClick={() => onOpenStep(step)}>Edit checks</button>}
      </section>

      <section>
        <h4>Step</h4>
        <div className="wbw-fopts">
          <label className="wbw-check"><input type="checkbox" checked={step.enabled} onChange={(e) => onStepChange({ ...step, enabled: e.target.checked })} /> Run this step</label>
          <label>If it fails <select className="input" aria-label="If this step fails" value={step.onFail} onChange={(e) => onStepChange({ ...step, onFail: e.target.value })}><option value="stop">stop the flow</option><option value="continue">go on</option></select></label>
          <label>Wait before <input className="input wbw-num" type="number" min={0} max={600000} aria-label="Wait before (ms)" value={step.delayMs} onChange={(e) => onStepChange({ ...step, delayMs: Math.max(0, Math.min(600000, Math.floor(Number(e.target.value) || 0))) })} /> ms</label>
          <label>Repeat <input className="input wbw-num" type="number" min={1} max={MAX_REPEAT} aria-label="Repeat" value={step.repeat} onChange={(e) => onStepChange({ ...step, repeat: Math.max(1, Math.min(MAX_REPEAT, Math.floor(Number(e.target.value) || 1))) })} />×</label>
        </div>
        <div className="wbw-row">
          <button type="button" className="btn btn-ghost btn-sm" disabled={index === 0} onClick={() => onMove(-1)}><ArrowUp size={11} /> Run earlier</button>
          <button type="button" className="btn btn-ghost btn-sm" disabled={index === s.steps.length - 1} onClick={() => onMove(1)}><ArrowDown size={11} /> Run later</button>
          <span className="wbw-grow" />
          <button type="button" className="btn btn-ghost btn-sm text-red wbw-fdel" onClick={onRemove}><Trash2 size={11} /> Remove step</button>
        </div>
      </section>
      <button type="button" className="btn btn-primary wbw-frunto" disabled={running} onClick={onRunTo}><Play size={13} /> Run up to here</button>
    </div>
  );
}
const alertBox = (m) => { try { window.alert(m); } catch { /* ignore */ } };

function Output({ step, req, result }) {
  if (!result) return <p className="text-sm text-tertiary">Not run yet. Run the flow (or "Run up to here") to see this step's response.</p>;
  if (result.running) return <p className="text-sm text-tertiary">Running…</p>;
  const res = result.response || {};
  let body = res.text || '';
  try { body = JSON.stringify(JSON.parse(body), null, 2); } catch { /* not JSON */ }
  const g = givesOf(step, res);
  return (
    <div className="wbw-fout">
      <div className="wbw-row">
        <span className={`wbw-st ${result.pass ? 'green' : 'red'}`}>{result.error ? (result.kind === 'cancel' ? 'Stopped' : 'Error') : String(result.status)}</span>
        <span className="text-xs text-tertiary">{result.ms} ms · {formatBytes(result.size || 0)}</span>
      </div>
      {result.error && <div className="wbw-err">{result.error}</div>}
      {result.tests?.length > 0 && <ul className="wbw-fout-tests">{result.tests.map((t, i) => <li key={i} className={t.pass ? 'text-green' : 'text-red'}>{t.pass ? '✓' : '✗'} {t.name}{!t.pass && t.message ? ` — ${t.message}` : ''}</li>)}</ul>}
      {result.setVars?.length > 0 && <div className="text-xs"><strong>Passed on:</strong> {result.setVars.map(v => `${v.name}${v.ok === false ? ' (not found)' : ''}`).join(', ')}</div>}
      {g.fields.length > 0 && <div className="text-xs text-tertiary">Fields later steps can use: {g.fields.slice(0, 12).map(f => f.label).join(', ')}{g.fields.length > 12 ? '…' : ''}</div>}
      {body && <pre className="wbw-fout-body font-mono">{body.length > 6000 ? `${body.slice(0, 6000)}\n… (cut)` : body}</pre>}
      {!req && <p className="text-xs text-red">The saved request was deleted.</p>}
    </div>
  );
}

function Node({ step, index, req, pos, result, needs, selected, compact, onPointerDown, onSelect, onPortDown }) {
  const missing = needs.filter(n => !n.filled);
  const shown = needs.filter(n => n.filled?.by !== 'environment');   // environment values are no news on a card
  const gives = (req?.draft.extract || []).filter(r => r.enabled !== false && r.name);
  const state = !step.enabled ? 'off' : result?.running ? 'run' : result ? (result.pass ? 'ok' : 'bad') : missing.length ? 'miss' : 'ready';
  const badge = { off: 'OFF', run: 'RUNNING', ok: String(result?.status ?? ''), bad: result?.error ? (result.kind === 'cancel' ? 'STOPPED' : 'ERROR') : String(result?.status ?? 'FAILED'), miss: `${missing.length} MISSING`, ready: 'READY' }[state];
  const tests = result?.tests ? `${result.tests.filter(t => t.pass).length} / ${result.tests.length}` : `${(req?.draft.tests || []).filter(t => t.enabled !== false).length} check${(req?.draft.tests || []).length === 1 ? '' : 's'}`;
  const m = methodOf(req?.draft);
  return (
    <div className={`wbw-fnode s-${state}${selected ? ' sel' : ''}`} data-node={step.id} role="button" tabIndex={0}
      aria-label={`Step ${index + 1}: ${req?.name || 'deleted request'}, ${badge}`} aria-pressed={selected}
      style={compact ? undefined : { left: pos.x, top: pos.y, width: NODE_W }}
      onPointerDown={onPointerDown} onClick={compact ? onSelect : undefined} onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onSelect(); } }}>
      {!compact && <span className="wbw-fport in" aria-hidden="true" />}
      {!compact && <span className="wbw-fport out" data-port={step.id} title="Drag onto another step to run it next" onPointerDown={onPortDown} />}
      <div className="wbw-fnode-head" data-drag="1">
        <div className={`wbw-fic m-${m.toLowerCase()}`}>{m.slice(0, 4)}</div>
        <div className="wbw-fnode-title">
          <b>{req?.name || 'Deleted request'}</b>
          <span className="wbw-fnode-k">Step {index + 1}{step.spec ? ' · project endpoint' : step.kind === 'inline' ? ' · in this flow' : ''}</span>
          <span className="wbw-fnode-u font-mono">{shortUrl(req?.draft.url)}</span>
        </div>
        <span className={`wbw-fbadge b-${state}`}>{badge}</span>
      </div>
      <div className="wbw-fnode-row"><span>Time</span><b>{result && !result.running ? `${result.ms} ms` : '—'}</b></div>
      <div className="wbw-fnode-row"><span>Tests</span><b className={result && !result.running ? (result.pass ? 'text-green' : 'text-red') : ''}>{tests}</b></div>
      {(shown.length > 0 || gives.length > 0) && (
        <div className="wbw-fchips">
          {shown.slice(0, 4).map(n => <span key={n.key} className={`wbw-fchip ${n.filled ? 'ok' : 'need'}`}>{n.filled ? `${n.label} ✓` : `needs ${n.label}`}</span>)}
          {shown.length > 4 && <span className="wbw-fchip ok">+{shown.length - 4}</span>}
          {gives.slice(0, 3).map(r => <span key={r.name} className="wbw-fchip give">gives {r.name}</span>)}
        </div>
      )}
    </div>
  );
}

/** A cubic line from a's out port to b's in port, and its middle point. */
function curve(a, b) {
  const x1 = a.x + NODE_W, y1 = a.y + PORT_Y, x2 = b.x, y2 = b.y + PORT_Y;
  const dx = Math.max(60, Math.abs(x2 - x1) / 2);
  const c1x = x1 + dx, c2x = x2 - dx;
  const t = 0.5, mt = 1 - t;
  const mx = mt ** 3 * x1 + 3 * mt * mt * t * c1x + 3 * mt * t * t * c2x + t ** 3 * x2;
  const my = mt ** 3 * y1 + 3 * mt * mt * t * y1 + 3 * mt * t * t * y2 + t ** 3 * y2;
  return { d: `M${x1},${y1} C${c1x},${y1} ${c2x},${y2} ${x2},${y2}`, mx, my };
}

/**
 * @param {object} p
 * @param {(list: Array<{ step, fn }>) => boolean} p.onEditDrafts  change step drafts (saved requests or the flow's copies) at once
 */
export function FlowCanvas({ scenario: s, onChange, tree, reqOf, report, running, signedIn, scopeFor, onEditDrafts, onRun, onOpenStep, notify, overview }) {
  const compact = useCompact();
  const [sel, setSel] = useState(null);
  const [tab, setTab] = useState('cfg');
  const [view, setView] = useState({ x: 0, y: 0, k: 1 });
  const [live, setLive] = useState(null);          // a card being moved: { id, x, y }
  const [wire, setWire] = useState(null);          // a line being drawn: { from, x, y }
  const [dropHint, setDropHint] = useState(false);
  const stageRef = useRef(null);
  const gesture = useRef(null);

  const [perRow, setPerRow] = useState(3);
  useEffect(() => {   // the automatic layout fits as many cards per row as the canvas is wide
    const el = stageRef.current; if (!el || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(() => setPerRow(Math.max(1, Math.floor((el.clientWidth - 40 + GAP) / (NODE_W + GAP)))));
    ro.observe(el); return () => ro.disconnect();
  }, [compact]);
  const results = useMemo(() => lastResults(report), [report]);
  const columns = useMemo(() => { try { const r = parseData(s.data); return r.length ? Object.keys(r[0]) : []; } catch { return []; } }, [s.data]);
  const pos = useMemo(() => positions(s, perRow), [s, perRow]);
  const needsBy = useMemo(() => {
    const m = new Map();
    s.steps.forEach((st, i) => { const req = reqOf(st); m.set(st.id, needsOf(st, req, { produced: producedBefore(s, i, reqOf), scope: scopeFor(req), columns })); });
    return m;
  }, [s, reqOf, scopeFor, columns]);
  const links = useMemo(() => linksOf(s, reqOf), [s, reqOf]);
  const missing = useMemo(() => missingInputs(s, reqOf, { scope: scopeFor, columns }), [s, reqOf, scopeFor, columns]);
  useEffect(() => { if (sel && !s.steps.some(x => x.id === sel)) setSel(null); }, [s.steps, sel]);

  const posOf = (id) => (live?.id === id ? live : pos[id]);
  const setFlow = (patch) => onChange({ ...s, flow: { ...(s.flow || {}), ...patch } });
  const savePos = (id, p) => setFlow({ pos: { ...(s.flow?.pos || pos), [id]: { x: Math.round(p.x), y: Math.round(p.y) } } });
  const toWorld = (cx, cy) => { const r = stageRef.current.getBoundingClientRect(); return { x: (cx - r.left - view.x) / view.k, y: (cy - r.top - view.y) / view.k }; };

  /** Add a step from the palette at a point (or at the end); dropped on a card: right after it. */
  const addStep = (payload, at = null, afterId = null) => {
    let st;
    if (payload.kind === 'saved') st = newStep('saved', { requestId: payload.requestId });
    else if (payload.kind === 'endpoint') { const e = endpointStep(payload.project, payload.ep); st = newStep('inline', { name: e.name, draft: e.draft, spec: e.spec }); }
    else st = newStep('inline', { name: 'New request', draft: { ...emptyDraft(), url: '{{baseUrl}}/' } });
    const steps = [...s.steps];
    const i = afterId ? steps.findIndex(x => x.id === afterId) + 1 : steps.length;
    steps.splice(i, 0, st);
    const p = at || (() => { const prev = steps[i - 1]; const pp = prev ? (s.flow?.pos?.[prev.id] || pos[prev.id]) : null; const others = Object.values(pos);
      const room = (stageRef.current?.clientWidth || 1200) / view.k - view.x / view.k;
      const prefer = pp && pp.x + 2 * NODE_W + GAP < room ? { x: pp.x + NODE_W + GAP, y: pp.y } : null;   // right of the step before, if free
      return freeSpot(others, perRow, prefer); })();
    onChange({ ...s, steps, flow: { ...(s.flow || {}), pos: { ...(s.flow?.pos || pos), [st.id]: { x: Math.round(p.x), y: Math.round(p.y) } } } });
    setSel(st.id); setTab('cfg');
  };
  const removeStep = (id) => { const st = s.steps.find(x => x.id === id); const req = st && reqOf(st); if (!confirm(`Remove "${req?.name || 'this step'}" from the flow?${st?.kind === 'saved' ? ' The saved request is kept.' : ''}`)) return; const { [id]: _, ...rest } = s.flow?.pos || {}; onChange({ ...s, steps: s.steps.filter(x => x.id !== id), flow: { ...(s.flow || {}), pos: rest } }); };
  const runNext = (fromId, toId) => {   // the line from → to: "to" runs right after "from"
    if (fromId === toId) return;
    const steps = [...s.steps]; const j = steps.findIndex(x => x.id === toId); if (j < 0) return;
    const [x] = steps.splice(j, 1); const i = steps.findIndex(y => y.id === fromId); if (i < 0) return;
    steps.splice(i + 1, 0, x);
    if (steps.map(z => z.id).join() === s.steps.map(z => z.id).join()) return;
    onChange({ ...s, steps });
    notify?.(`"${reqOf(x)?.name || 'Step'}" now runs after "${reqOf(steps[i])?.name || 'step'}".`, 'info');
  };
  const moveBy = (id, d) => { const i = s.steps.findIndex(x => x.id === id); const j = i + d; if (j < 0 || j >= s.steps.length) return; const steps = [...s.steps]; [steps[i], steps[j]] = [steps[j], steps[i]]; onChange({ ...s, steps }); };
  const arrange = () => { const p = {}; s.steps.forEach((st, i) => { p[st.id] = autoPos(i, perRow); }); setFlow({ pos: p }); setView({ x: 0, y: 0, k: 1 }); };
  const fit = () => {
    const el = stageRef.current; if (!el || !s.steps.length) { setView({ x: 0, y: 0, k: 1 }); return; }
    const ps = s.steps.map(x => pos[x.id]); const minX = Math.min(...ps.map(p => p.x)), minY = Math.min(...ps.map(p => p.y));
    const maxX = Math.max(...ps.map(p => p.x)) + NODE_W, maxY = Math.max(...ps.map(p => p.y)) + 220;
    const k = Math.max(0.4, Math.min(1.2, Math.min(el.clientWidth / (maxX - minX + 60), el.clientHeight / (maxY - minY + 60))));
    setView({ k, x: -minX * k + 30, y: -minY * k + 30 });
  };

  /** Connect a need (or a new input) to a source; everything changes at once. */
  const apply = (need, c, target) => {
    const step = s.steps.find(x => x.id === sel); if (!step) return;
    const index = s.steps.indexOf(step);
    const req = reqOf(step); if (!req) return;
    const list = [];
    let value = c.value;
    if (c.t === 'step') {
      const src = s.steps.find(x => x.id === c.stepId); const sreq = src && reqOf(src); if (!sreq) return;
      const taken = new Set(producedBefore(s, s.steps.length, reqOf).keys());
      const has = (sreq.draft.extract || []).find(r => r.enabled !== false && r.name && (r.from || 'json') === c.from && String(r.path || '') === String(c.path || ''));
      const wanted = has ? has.name : need?.where === 'var' ? need.name : suggestName(c.from === 'header' ? c.path.toLowerCase().split('-').filter(Boolean).map((w, i) => (i ? w[0].toUpperCase() + w.slice(1) : w)).join('') : c.from === 'status' ? 'status' : c.path, taken);
      const name = ensureRule(structuredClone(sreq.draft), { from: c.from, path: c.path, name: wanted });
      list.push({ step: src, fn: (d) => { ensureRule(d, { from: c.from, path: c.path, name }); } });
      if (need?.where === 'var' && name === need.name) value = null;   // the rule sets {{name}} itself
      else value = `{{${name}}}`;
    }
    if (value != null) list.push({ step, fn: (d) => { if (target) passInto(d, target, value); else fillNeed(d, need, value); } });
    if (!list.length) return;
    // the giving step may be a saved request also used by this step: apply in order on the same draft
    if (onEditDrafts(list) && target) notify?.(`Passed into ${target.kind === 'bearer' ? 'the Bearer token' : `${target.kind} ${target.name}`} of step ${index + 1}.`, 'success');
  };

  // ── pointer gestures: pan, move a card, draw a line ──
  const onStageDown = (e) => {
    if (e.button !== 0 || compact) return;
    if (e.target.closest('.wbw-fnode, .wbw-ftools, .wbw-flabel')) return;
    gesture.current = { kind: 'pan', sx: e.clientX, sy: e.clientY, vx: view.x, vy: view.y };
    e.currentTarget.setPointerCapture?.(e.pointerId);
  };
  const onNodeDown = (st) => (e) => {
    if (e.button !== 0 || compact) return;
    if (e.target.closest('button, input, select, .wbw-fport')) return;
    const p = pos[st.id];
    gesture.current = { kind: 'move', id: st.id, sx: e.clientX, sy: e.clientY, ox: p.x, oy: p.y, moved: false };
    stageRef.current.setPointerCapture?.(e.pointerId);
  };
  const onPortDown = (st) => (e) => {
    e.stopPropagation();
    if (e.button !== 0) return;
    const w = toWorld(e.clientX, e.clientY);
    gesture.current = { kind: 'wire', from: st.id };
    setWire({ from: st.id, ...w });
    stageRef.current.setPointerCapture?.(e.pointerId);
  };
  const onMove = (e) => {
    const g = gesture.current; if (!g) return;
    if (g.kind === 'pan') setView(v => ({ ...v, x: g.vx + e.clientX - g.sx, y: g.vy + e.clientY - g.sy }));
    else if (g.kind === 'move') {
      const dx = (e.clientX - g.sx) / view.k, dy = (e.clientY - g.sy) / view.k;
      if (!g.moved && Math.hypot(dx, dy) < 4) return;
      g.moved = true; setLive({ id: g.id, x: Math.max(0, g.ox + dx), y: Math.max(0, g.oy + dy) });
    } else if (g.kind === 'wire') setWire(w => ({ ...w, ...toWorld(e.clientX, e.clientY) }));
  };
  const onUp = (e) => {
    const g = gesture.current; gesture.current = null;
    if (!g) return;
    if (g.kind === 'move') {
      if (g.moved && live) savePos(g.id, live); else { setSel(g.id); }
      setLive(null);
    } else if (g.kind === 'wire') {
      setWire(null);
      const el = document.elementFromPoint(e.clientX, e.clientY)?.closest?.('[data-node]');
      if (el) runNext(g.from, el.getAttribute('data-node'));
    }
  };
  const onWheel = (e) => {
    if (!e.ctrlKey && !e.metaKey) return;
    e.preventDefault();
    const r = stageRef.current.getBoundingClientRect(); const cx = e.clientX - r.left, cy = e.clientY - r.top;
    setView(v => { const k = Math.max(0.4, Math.min(1.6, v.k * (e.deltaY < 0 ? 1.1 : 0.9))); return { k, x: cx - (cx - v.x) * (k / v.k), y: cy - (cy - v.y) * (k / v.k) }; });
  };
  useEffect(() => { const el = stageRef.current; if (!el) return; el.addEventListener('wheel', onWheel, { passive: false }); return () => el.removeEventListener('wheel', onWheel); });

  const onDrop = (e) => {
    setDropHint(false);
    const raw = e.dataTransfer.getData('application/x-hitapi-flow'); if (!raw) return;
    e.preventDefault();
    const payload = JSON.parse(raw);
    const on = document.elementFromPoint(e.clientX, e.clientY)?.closest?.('[data-node]');
    const w = compact ? null : toWorld(e.clientX, e.clientY);
    addStep(payload, on || !w ? null : { x: Math.max(0, w.x - NODE_W / 2), y: Math.max(0, w.y - 30) }, on ? on.getAttribute('data-node') : null);
  };

  const selStep = s.steps.find(x => x.id === sel);
  const selIndex = selStep ? s.steps.indexOf(selStep) : -1;
  const selReq = selStep ? reqOf(selStep) : null;
  const size = useMemo(() => { const ps = Object.values(pos); return { w: Math.max(1600, ...ps.map(p => p.x + NODE_W + 400)), h: Math.max(1000, ...ps.map(p => p.y + 600)) }; }, [pos]);

  return (
    <div className={`wbw-flow${compact ? ' compact' : ''}`}>
      <Palette tree={tree} signedIn={signedIn} compact={compact} onAdd={(p) => addStep(p)} />
      <div className={`wbw-fstage${dropHint ? ' drop' : ''}`} ref={stageRef} aria-label="Flow canvas" role="region"
        onPointerDown={onStageDown} onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={() => { gesture.current = null; setLive(null); setWire(null); }}
        onDragOver={(e) => { if (e.dataTransfer.types.includes('application/x-hitapi-flow')) { e.preventDefault(); e.dataTransfer.dropEffect = 'copy'; if (!dropHint) setDropHint(true); } }}
        onDragLeave={(e) => { if (!e.currentTarget.contains(e.relatedTarget)) setDropHint(false); }} onDrop={onDrop}>
        {!compact && (
          <div className="wbw-ftools">
            <button type="button" className="btn btn-ghost btn-sm" aria-label="Zoom out" onClick={() => setView(v => ({ ...v, k: Math.max(0.4, v.k / 1.15) }))}><ZoomOut size={13} /></button>
            <span className="text-xs">{Math.round(view.k * 100)}%</span>
            <button type="button" className="btn btn-ghost btn-sm" aria-label="Zoom in" onClick={() => setView(v => ({ ...v, k: Math.min(1.6, v.k * 1.15) }))}><ZoomIn size={13} /></button>
            <button type="button" className="btn btn-ghost btn-sm" title="Show every step" onClick={fit}><Maximize2 size={12} /> Fit</button>
            <button type="button" className="btn btn-ghost btn-sm" title="Put the steps in a grid by run order" onClick={arrange}><LayoutGrid size={12} /> Arrange</button>
            {missing.length > 0 && <button type="button" className="wbw-fmissing" onClick={() => { setSel(missing[0].stepId); setTab('cfg'); }}>{missing.length} input{missing.length === 1 ? '' : 's'} missing</button>}
          </div>
        )}
        {compact && missing.length > 0 && <button type="button" className="wbw-fmissing" onClick={() => { setSel(missing[0].stepId); setTab('cfg'); }}>{missing.length} input{missing.length === 1 ? '' : 's'} missing</button>}
        <div className="wbw-fworld" style={compact ? undefined : { transform: `translate(${view.x}px, ${view.y}px) scale(${view.k})`, width: size.w, height: size.h }}>
          {!compact && (
            <svg className="wbw-fwires" width={size.w} height={size.h} aria-hidden="true">
              <defs><marker id="wbw-farrow" markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto"><path d="M0,0 L8,4 L0,8 z" className="wbw-farrow" /></marker></defs>
              {links.map(l => { const a = posOf(l.from), b = posOf(l.to); if (!a || !b) return null; const c = curve(a, b); return <path key={`${l.from}>${l.to}`} d={c.d} className={l.chain ? 'chain' : 'data'} markerEnd={l.chain ? 'url(#wbw-farrow)' : undefined} />; })}
              {wire && posOf(wire.from) && <path d={curve(posOf(wire.from), { x: wire.x, y: wire.y - PORT_Y }).d} className="wire" />}
            </svg>
          )}
          {!compact && links.filter(l => l.names.length).map(l => {
            const a = posOf(l.from), b = posOf(l.to); if (!a || !b) return null; const c = curve(a, b);
            return <button key={`lbl-${l.from}>${l.to}`} type="button" className={`wbw-flabel${l.chain ? '' : ' data'}`} style={{ left: c.mx, top: c.my }}
              title="What this step passes on — click to change" onClick={() => { setSel(l.to); setTab('cfg'); }}>{l.names.join(', ')}</button>;
          })}
          {s.steps.map((st, i) => (
            <Node key={st.id} step={st} index={i} req={reqOf(st)} pos={posOf(st.id)} result={results.get(st.id)} needs={needsBy.get(st.id) || []}
              selected={sel === st.id} compact={compact} onPointerDown={onNodeDown(st)} onSelect={() => setSel(st.id)} onPortDown={onPortDown(st)} />
          ))}
          {!s.steps.length && <div className="wbw-fempty">Drag a request here from the left, or press + next to it. Steps run one after another, along the lines.</div>}
        </div>
      </div>
      <aside className="wbw-fside" aria-label={selStep ? 'Selected step' : 'Flow'}>
        {selStep ? <>
          <div className="wbw-fside-head">
            <div><div className="wbw-fside-k">Selected step {selIndex + 1}</div><b>{selReq?.name || 'Deleted request'}</b></div>
            <button type="button" className="btn btn-ghost btn-sm" aria-label="Close the step" onClick={() => setSel(null)}><X size={13} /></button>
          </div>
          <div className="wbw-ftabs" role="tablist">
            <button type="button" role="tab" aria-selected={tab === 'out'} className={tab === 'out' ? 'on' : ''} onClick={() => setTab('out')}>Preview / Output</button>
            <button type="button" role="tab" aria-selected={tab === 'cfg'} className={tab === 'cfg' ? 'on' : ''} onClick={() => setTab('cfg')}>Configure</button>
          </div>
          {tab === 'cfg' ? (
            <Configure key={selStep.id} scenario={s} step={selStep} index={selIndex} req={selReq} results={results} columns={columns} scope={scopeFor(selReq)} reqOf={reqOf}
              apply={apply} running={running} onOpenStep={onOpenStep} onRemove={() => removeStep(selStep.id)} onMove={(d) => moveBy(selStep.id, d)}
              onStepChange={(n) => onChange({ ...s, steps: s.steps.map(x => (x.id === n.id ? n : x)) })}
              onRunTo={() => {
                const only = new Set(s.steps.slice(0, selIndex + 1).filter(x => x.enabled).map(x => x.id));
                const miss = missing.filter(m => only.has(m.stepId));
                if (miss.length && !confirm(`${miss.length} input${miss.length === 1 ? ' is' : 's are'} missing (${miss.slice(0, 3).map(m => m.need.label).join(', ')}). Run anyway?`)) return;
                onRun(only);
              }} />
          ) : <Output step={selStep} req={selReq} result={results.get(selStep.id)} />}
        </> : overview}
      </aside>
    </div>
  );
}
