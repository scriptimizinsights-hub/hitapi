/**
 * Web Workbench (W9) — "Schedules" page (signed in): cloud runs of collections, folders
 * and scenarios — what, how often, environment, last and next run, on/off, Run now,
 * run history (each request, with what failed and why), edit, delete.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Play, Pencil, Trash2, Plus, ChevronDown, ChevronRight, Clock } from 'lucide-react';
import { useStore } from '../../store/index.js';
import { walk } from '@hitapi/shared/collections.js';
import { inTime } from '@hitapi/shared/schedules.js';
import { ago } from '@hitapi/shared/sync.js';
import { ScheduleDialog } from './ScheduleDialog.jsx';
import { Dialog } from './Dialogs.jsx';
import { schedulesApi, everyLabel, KIND_LABEL, targetName } from './schedules-api.js';
import { loadSyncState, syncNow, localIO } from './sync.js';
import { loadTree } from './collections-store.js';
import { loadEnvs } from './env-store.js';
import { loadScenarios } from './scenarios-store.js';
import './workbench.css';

const statusTone = (s) => (s === 'passed' ? 'green' : s === 'running' ? 'gray' : s ? 'red' : 'gray');
const statusText = (r) => (r.status === 'passed' ? `✓ ${r.passed}/${r.total}` : r.status === 'running' ? 'running…' : r.status === 'error' ? 'Error' : `✗ ${r.failed} failed`);

function RunDetail({ schedule, runId, onClose }) {
  const [run, setRun] = useState(null);
  const [error, setError] = useState('');
  useEffect(() => { schedulesApi.run(schedule.id, runId).then(setRun).catch(e => setError(e.message)); }, [schedule.id, runId]);
  return (
    <Dialog wide title={`Run of "${schedule.name}"`} onClose={onClose}>
      {error ? <div className="wbw-err">{error}</div> : !run ? <p className="text-sm text-tertiary">Loading…</p> : (
        <div className="wbw-form">
          <div className="text-sm">{new Date(run.started_at).toLocaleString()} · {run.reason === 'manual' ? 'Run now' : 'Scheduled'} · {run.ms} ms · <strong className={run.status === 'passed' ? 'text-green' : 'text-red'}>{run.status === 'passed' ? `all ${run.total} passed` : run.status === 'error' ? 'could not run' : `${run.failed} of ${run.total} failed`}</strong></div>
          {run.error && <div className="wbw-err">{run.error}</div>}
          {run.alert && <div className="text-xs text-tertiary">Alerts: {run.alert}</div>}
          <ol className="wbw-rn-list wbw-sch-results">
            {run.results.map((r, i) => (
              <li key={i} className={`wbw-rn-item ${r.pass ? 'ok' : 'bad'}`}>
                <details>
                  <summary className="wbw-sch-res">
                    <span className="wbw-rn-mark">{r.pass ? '✓' : '✗'}</span>
                    <span className={`method-badge method-${r.method}`}>{r.method}</span>
                    <span className="wbw-rn-name"><span>{r.name}{r.iteration ? <span className="text-xs text-tertiary"> · row {r.iteration + 1}</span> : null}</span>
                      {r.error ? <span className="wbw-rn-err text-xs">{r.error}</span> : r.tests?.find(t => !t.pass) ? <span className="wbw-rn-err text-xs">✗ {r.tests.find(t => !t.pass).message || r.tests.find(t => !t.pass).name}</span> : null}</span>
                    <span className="text-xs text-tertiary">{r.tests?.length ? `${r.tests.filter(t => t.pass).length}/${r.tests.length} tests · ` : ''}{r.error ? '' : `${r.ms} ms`}</span>
                    <span className={`wbw-st sm ${r.pass ? 'green' : 'red'}`}>{r.error ? 'Error' : r.status}</span>
                  </summary>
                  <div className="wbw-sch-resbody text-xs">
                    <div className="font-mono">{r.method} {r.url}</div>
                    {r.tests?.map((t, j) => <div key={j} className={t.pass ? 'text-green' : 'text-red'}>{t.pass ? '✓' : '✗'} {t.name}{!t.pass && t.message ? ` — ${t.message}` : ''}</div>)}
                    {r.setVars?.length > 0 && <div className="text-tertiary">Set {r.setVars.join(', ')}</div>}
                    {r.response && <pre className="wbw-pre">{r.response.body || '(empty body)'}</pre>}
                  </div>
                </details>
              </li>
            ))}
          </ol>
          <p className="text-xs text-tertiary">Bodies are cut to 10 KB. Secret values are blanked.</p>
        </div>
      )}
    </Dialog>
  );
}

/** Collections, folders and scenarios in this browser, for "+ New schedule". */
function targets() {
  const out = [];
  walk(loadTree(), (n, _p, anc) => { if (n.type !== 'request') out.push({ kind: n.type, id: n.id, name: n.name, label: [...anc.map(a => a.name), n.name].join(' / ') }); });
  for (const s of loadScenarios().items) out.push({ kind: 'scenario', id: s.id, name: s.name, label: `Scenario: ${s.name}` });
  return out;
}

export function SchedulesPage() {
  const user = useStore((s) => s.user);
  const addToast = useStore((s) => s.addToast);
  const notify = useCallback((m, t = 'info') => addToast?.(m, t), [addToast]);
  const [state, setState] = useState({ loading: true, schedules: [], error: '', email: false });
  const [open, setOpen] = useState({});          // id → runs (or 'loading')
  const [dlg, setDlg] = useState(null);          // { type: 'new'|'edit'|'run'|'pick', … }
  const [busy, setBusy] = useState({});
  const sync = loadSyncState();
  const data = useMemo(() => ({ tree: loadTree(), envs: loadEnvs(), scenarios: loadScenarios() }), [dlg]);   // eslint-disable-line react-hooks/exhaustive-deps

  const load = useCallback(() => schedulesApi.list().then((d) => setState({ loading: false, schedules: d.schedules, error: '', email: d.email, limits: d.limits })).catch((e) => setState((s) => ({ ...s, loading: false, error: e.message }))), []);
  useEffect(() => { if (user) load(); }, [user, load]);
  const loadRuns = (id) => schedulesApi.runs(id).then((d) => setOpen((o) => ({ ...o, [id]: d.runs }))).catch((e) => notify(e.message, 'error'));
  const beforeSave = async () => { const r = await syncNow(await localIO(), { force: true }); if (r && !r.ok && !r.skipped) throw new Error(`Couldn't save your Workbench to your account first: ${r.error}`); };
  const envName = (id) => (id ? data.envs.envs.find(e => e.id === id)?.name || '(deleted environment)' : 'No environment');

  const act = async (id, fn, done) => {
    setBusy((b) => ({ ...b, [id]: true }));
    try { const r = await fn(); done?.(r); } catch (e) { notify(e.message, 'error'); }
    setBusy((b) => ({ ...b, [id]: false }));
  };

  if (!user) return <div className="card"><p className="text-sm">Sign in to use cloud schedules.</p></div>;
  const pick = targets();
  return (
    <div className="wbw wbw-schedules">
      <div className="wbw-toolbar">
        <span className="text-sm text-tertiary">Collections, folders and scenarios from your Workbench, run on HitAPI's servers — your browser can be closed. {state.limits ? `Up to ${state.limits.MAX_SCHEDULES} schedules, every ${state.limits.MIN_EVERY} minutes at most, ${state.limits.MAX_REQUESTS} requests a run.` : ''}</span>
        <span className="wbw-grow" />
        <button type="button" className="btn btn-primary btn-sm wbw-sch-new" disabled={!pick.length} onClick={() => setDlg({ type: 'pick', target: pick[0] })}><Plus size={12} /> New schedule</button>
      </div>
      {!sync.enabled && <div className="wbw-note">Cloud schedules run what is in your HitAPI account. Turn on "Keep my Workbench in my HitAPI account" (API Workbench → Backup and sync) so they can see your collections and scenarios.</div>}
      {!state.email && !state.loading && <p className="text-xs text-tertiary">Email alerts aren't set up on this server yet; webhook alerts work.</p>}
      {state.error && <div className="wbw-err">{state.error}</div>}
      {state.loading ? <p className="text-sm text-tertiary">Loading…</p> : !state.schedules.length ? (
        <div className="card wbw-empty"><Clock size={22} /><p><strong>No schedules yet.</strong></p><p className="text-sm text-tertiary">In the API Workbench, open a collection's, folder's or scenario's ⋯ menu and choose "Schedule runs in the cloud", or press New schedule.</p></div>
      ) : (
        <div className="wbw-sch-list">
          {state.schedules.map((s) => {
            const tName = targetName({ kind: s.target_kind, id: s.target_id }, data);
            const runs = open[s.id];
            return (
              <div key={s.id} className={`card wbw-sch-item${s.enabled ? '' : ' off'}`} data-id={s.id}>
                <div className="wbw-sch-head">
                  <button type="button" className="btn btn-ghost btn-icon" aria-label={runs ? 'Hide runs' : 'Show runs'} onClick={() => (runs ? setOpen((o) => { const n = { ...o }; delete n[s.id]; return n; }) : loadRuns(s.id))}>{runs ? <ChevronDown size={14} /> : <ChevronRight size={14} />}</button>
                  <div className="wbw-sch-what">
                    <strong className="wbw-sch-name">{s.name}</strong>
                    <span className="text-xs text-tertiary">{KIND_LABEL[s.target_kind]}: {tName || <span className="text-amber">not in this browser</span>} · {everyLabel(s.every_min)} · {envName(s.env_id)}{s.secret_names.length ? ` · secrets: ${s.secret_names.join(', ')}` : ''}</span>
                  </div>
                  <span className="wbw-sch-last text-xs">
                    {s.running ? <span className="text-tertiary">running…</span> : s.last_run ? <span className={`wbw-st sm ${statusTone(s.last_run.status)}`} title={s.last_run.error || (s.last_run.failures || []).map(f => `${f.name}: ${f.reason}`).join('\n')}>{statusText(s.last_run)}</span> : <span className="text-tertiary">not run yet</span>}
                    {s.last_run_at && <span className="text-tertiary"> {ago(s.last_run_at)}</span>}
                  </span>
                  <span className="wbw-sch-next text-xs text-tertiary">{s.enabled ? `next ${inTime(s.next_run_at)}` : 'paused'}</span>
                  <label className="wbw-check text-xs" title={s.enabled ? 'Pause' : 'Resume'}><input type="checkbox" aria-label={`Run ${s.name} on schedule`} checked={s.enabled} disabled={busy[s.id]} onChange={(e) => { const on = e.target.checked; setState((st) => ({ ...st, schedules: st.schedules.map(x => (x.id === s.id ? { ...x, enabled: on } : x)) })); act(s.id, () => schedulesApi.update(s.id, { enabled: on }), load); }} /> On</label>
                  <button type="button" className="btn btn-ghost btn-sm wbw-sch-runnow" disabled={busy[s.id]} onClick={() => act(s.id, () => schedulesApi.runNow(s.id), (r) => { notify(r.status === 'passed' ? `"${s.name}": all ${r.total} passed` : r.status === 'error' ? `"${s.name}" could not run: ${r.error}` : `"${s.name}": ${r.failed} of ${r.total} failed`, r.status === 'passed' ? 'success' : 'error'); load(); if (open[s.id]) loadRuns(s.id); })}><Play size={12} /> {busy[s.id] ? 'Running…' : 'Run now'}</button>
                  <button type="button" className="btn btn-ghost btn-icon" aria-label={`Edit ${s.name}`} onClick={() => setDlg({ type: 'edit', schedule: s, target: { kind: s.target_kind, id: s.target_id, name: tName || s.name } })}><Pencil size={13} /></button>
                  <button type="button" className="btn btn-ghost btn-icon" aria-label={`Delete ${s.name}`} onClick={() => { if (confirm(`Delete the schedule "${s.name}" and its run history?`)) act(s.id, () => schedulesApi.remove(s.id), () => { notify('Schedule deleted', 'info'); load(); }); }}><Trash2 size={13} /></button>
                </div>
                {s.last_run?.failures?.length > 0 && !runs && <div className="wbw-sch-fail text-xs">{s.last_run.failures.map((f, i) => <div key={i}>✗ {f.name}: {f.reason}</div>)}</div>}
                {s.last_run?.error && !runs && <div className="wbw-sch-fail text-xs">{s.last_run.error}</div>}
                {runs && (
                  <div className="wbw-sch-runs">
                    {!runs.length ? <p className="text-xs text-tertiary">No runs yet. Press Run now, or wait for {inTime(s.next_run_at)}.</p> : (
                      <table className="wbw-table"><thead><tr><th>When</th><th>How</th><th>Result</th><th>Time</th><th>Failures</th></tr></thead><tbody>
                        {runs.map(r => (
                          <tr key={r.id} className="wbw-sch-run" onClick={() => setDlg({ type: 'run', schedule: s, runId: r.id })} style={{ cursor: 'pointer' }}>
                            <td>{new Date(r.started_at).toLocaleString()}</td><td>{r.reason === 'manual' ? 'Run now' : 'Scheduled'}</td>
                            <td><span className={`wbw-st sm ${statusTone(r.status)}`}>{statusText(r)}</span></td><td>{r.ms} ms</td>
                            <td className="text-xs">{r.error || (r.failures || []).map(f => `${f.name}: ${f.reason}`).join('; ')}</td>
                          </tr>
                        ))}
                      </tbody></table>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
      {dlg?.type === 'pick' && (
        <Dialog title="New schedule" onClose={() => setDlg(null)} footer={<>
          <span className="wbw-grow" />
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => setDlg(null)}>Cancel</button>
          <button type="button" className="btn btn-primary btn-sm wbw-sch-pickok" onClick={() => setDlg({ type: 'new', target: dlg.target })}>Next</button>
        </>}>
          <label className="wbw-field"><span>What to run</span>
            <select className="input" aria-label="What to run" value={`${dlg.target.kind}:${dlg.target.id}`} onChange={(e) => setDlg({ ...dlg, target: pick.find(x => `${x.kind}:${x.id}` === e.target.value) })}>
              {pick.map(x => <option key={`${x.kind}:${x.id}`} value={`${x.kind}:${x.id}`}>{x.label}</option>)}
            </select>
          </label>
        </Dialog>
      )}
      {(dlg?.type === 'new' || dlg?.type === 'edit') && (
        <ScheduleDialog target={dlg.target} schedule={dlg.schedule || null} syncOn={sync.enabled} beforeSave={beforeSave}
          onOpenBackup={() => { window.location.href = '/workbench'; }} onClose={() => setDlg(null)}
          onSaved={(s) => { notify(dlg.type === 'edit' ? 'Schedule saved' : `Scheduled "${s.name}": ${everyLabel(s.every_min).toLowerCase()}`, 'success'); load(); }} />
      )}
      {dlg?.type === 'run' && <RunDetail schedule={dlg.schedule} runId={dlg.runId} onClose={() => setDlg(null)} />}
    </div>
  );
}
