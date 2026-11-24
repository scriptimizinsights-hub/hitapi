/**
 * Web Workbench (W6) — scenarios ↔ HitAPI flow suites (signed in).
 * Send: a scenario becomes a flow suite in a project, so it can run in the cloud.
 * From HitAPI: a flow suite becomes a scenario with its steps copied in.
 * Same conversion as the HitAPI extension (shared/scenarios.js toFlowStep / fromFlowSuite).
 */

import { useEffect, useState } from 'react';
import { ExternalLink } from 'lucide-react';
import { Dialog } from './Dialogs.jsx';
import { api } from '../../store/index.js';

const listOf = (d, key) => (Array.isArray(d) ? d : Array.isArray(d?.[key]) ? d[key] : []);

const SignInNote = () => (
  <div className="wbw-note">
    <strong>Sign in to HitAPI first.</strong>
    <div className="text-xs">A free account works. <a href="/login">Sign in or create an account</a>, then try again. Scenarios themselves work without an account.</div>
  </div>
);

function useProjects(signedIn) {
  const [st, setSt] = useState({ loading: signedIn, projects: [], error: '' });
  useEffect(() => {
    if (!signedIn) return;
    let live = true;
    api.projects.list().then((d) => live && setSt({ loading: false, projects: listOf(d, 'projects'), error: '' }))
      .catch((e) => live && setSt({ loading: false, projects: [], error: e.message }));
    return () => { live = false; };
  }, [signedIn]);
  return st;
}

/**
 * @param {{ scenario, signedIn, steps: () => Array<{ name, step, extract, dropped, unresolved }>, onLinked: (projectId, suiteId) => void, onClose }} p
 */
export function FlowPushDialog({ scenario, signedIn, steps, onLinked, onClose }) {
  const { loading, projects, error: loadError } = useProjects(signedIn);
  const [pick, setPick] = useState('');
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(null);
  const [error, setError] = useState('');
  const [list] = useState(() => steps());
  useEffect(() => { if (!loading) setPick(projects.some(p => p.id === scenario.hitapi?.projectId) ? scenario.hitapi.projectId : projects[0]?.id || ''); }, [loading, projects, scenario.hitapi?.projectId]);
  const dropped = [...new Set(list.flatMap(x => x.dropped))];
  const unresolved = [...new Set(list.flatMap(x => x.unresolved))];
  const go = async () => {
    setBusy(true); setError('');
    try {
      if (list.length > 100) throw new Error('A flow suite can have at most 100 steps.');
      const suite = await api.flows.create(pick, { name: String(scenario.name || 'Scenario').slice(0, 120), description: 'Sent from the HitAPI web Workbench scenario', steps: [] });
      const suiteId = suite?.suite?.id || suite?.id;
      if (!suiteId) throw new Error('HitAPI did not return the new flow suite.');
      // one by one (the bulk create drops steps that share a method), then their "Set vars" rules
      for (const { step, extract } of list) {
        const created = await api.flows.addStep(pick, suiteId, step);
        const stepId = created?.id || created?.step?.id;
        if (stepId && extract?.length) await api.flows.updateStep(pick, suiteId, stepId, { extract_vars: extract });
      }
      onLinked?.(pick, suiteId);
      setDone({ projectId: pick, suiteId, steps: list.length });
    } catch (e) { setError(e.message); }
    setBusy(false);
  };
  return (
    <Dialog wide title={`Send "${scenario.name}" to HitAPI`} onClose={onClose} footer={<>
      <span className="wbw-grow" />
      <button type="button" className="btn btn-ghost btn-sm" onClick={onClose}>Close</button>
      {signedIn && projects.length > 0 && <button type="button" className="btn btn-primary btn-sm wbw-flowpush-ok" disabled={busy || !pick || !list.length} onClick={go}>{busy ? 'Creating…' : done ? 'Create another copy' : 'Create flow suite'}</button>}
    </>}>
      {!signedIn ? <SignInNote /> : loading ? <p className="text-sm text-tertiary">Loading your HitAPI projects…</p> : loadError ? <div className="wbw-err">{loadError}</div>
        : !projects.length ? <p className="text-sm text-tertiary">You have no HitAPI projects yet. Create one first (or send a collection to HitAPI).</p> : (
          <div className="wbw-form">
            <p className="text-sm text-tertiary">Creates a flow suite with these steps in the project, so it can run in the cloud (on a schedule, with AI bug reports). Your scenario here isn't changed.</p>
            <label className="wbw-field"><span>Project</span>
              <select className="input" aria-label="HitAPI project" value={pick} onChange={(e) => setPick(e.target.value)}>
                {projects.map(p => <option key={p.id} value={p.id}>{p.name}{p.base_url ? ` (${p.base_url})` : ''}</option>)}
              </select>
            </label>
            <ol className="wbw-flow-list text-xs">
              {list.map((x, i) => <li key={i}><code>{x.step.method} {x.step.url_override}</code>{x.extract.length ? <span className="text-tertiary"> → sets {x.extract.map(e => e.var).join(', ')}</span> : null}</li>)}
            </ol>
            {dropped.length > 0 && <p className="text-xs text-amber">Not sent (secrets): {dropped.join(', ')}. In the cloud, a login step that sets a token variable is used for auth, or the suite/project token.</p>}
            {unresolved.length > 0 && <p className="text-xs text-tertiary">Kept as variables for the cloud run: {unresolved.map(n => `{{${n}}}`).join(', ')}.</p>}
            {done && (
              <div className="wbw-okbox" role="status">
                <strong>✓ Created the flow suite "{scenario.name}" with {done.steps} step{done.steps === 1 ? '' : 's'}.</strong>
                <a href={`/projects/${encodeURIComponent(done.projectId)}/flows`} target="_blank" rel="noopener noreferrer">Open flow suites <ExternalLink size={11} /></a>
              </div>
            )}
            {error && <div className="wbw-err" role="alert">{error}</div>}
          </div>
        )}
    </Dialog>
  );
}

/** Pick a project and one of its flow suites → onImport(project, suite, steps). */
export function FlowPullDialog({ signedIn, onImport, onClose }) {
  const { loading, projects, error: loadError } = useProjects(signedIn);
  const [pick, setPick] = useState('');
  const [suites, setSuites] = useState({ loading: false, list: [], error: '' });
  const [suite, setSuite] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => { if (!loading) setPick(projects[0]?.id || ''); }, [loading, projects]);
  useEffect(() => {
    if (!pick) return;
    let live = true;
    setSuites({ loading: true, list: [], error: '' });
    api.flows.list(pick).then((d) => { if (!live) return; const list = listOf(d, 'suites'); setSuites({ loading: false, list, error: '' }); setSuite(list[0]?.id || ''); })
      .catch((e) => live && setSuites({ loading: false, list: [], error: e.message }));
    return () => { live = false; };
  }, [pick]);
  const go = async () => {
    setBusy(true); setError('');
    try {
      const project = projects.find(p => p.id === pick);
      const d = await api.flows.get(pick, suite);
      const steps = d?.steps || [];
      if (!steps.length) { setError('This flow suite has no steps.'); setBusy(false); return; }
      onImport(project, d?.suite || d, steps);
      onClose();
    } catch (e) { setError(e.message); setBusy(false); }
  };
  return (
    <Dialog title="Import a HitAPI flow suite" onClose={onClose} footer={<>
      <span className="wbw-grow" />
      <button type="button" className="btn btn-ghost btn-sm" onClick={onClose}>Cancel</button>
      {signedIn && projects.length > 0 && <button type="button" className="btn btn-primary btn-sm wbw-flowpull-ok" disabled={busy || !suite} onClick={go}>{busy ? 'Importing…' : 'Import'}</button>}
    </>}>
      {!signedIn ? <SignInNote /> : loading ? <p className="text-sm text-tertiary">Loading your HitAPI projects…</p> : loadError ? <div className="wbw-err">{loadError}</div>
        : !projects.length ? <p className="text-sm text-tertiary">You have no HitAPI projects yet.</p> : (
          <div className="wbw-form">
            <p className="text-sm text-tertiary">Copies the suite's steps into a new scenario (method, URL, headers, body, extracted variables, expected status). The suite in HitAPI isn't changed.</p>
            <label className="wbw-field"><span>Project</span>
              <select className="input" aria-label="HitAPI project" value={pick} onChange={(e) => setPick(e.target.value)}>{projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}</select>
            </label>
            <label className="wbw-field"><span>Flow suite</span>
              <select className="input" aria-label="Flow suite" value={suite} disabled={suites.loading || !suites.list.length} onChange={(e) => setSuite(e.target.value)}>
                {suites.list.map(x => <option key={x.id} value={x.id}>{x.name}{x.step_count != null ? ` (${x.step_count} steps)` : ''}</option>)}
              </select>
            </label>
            {suites.loading ? <p className="text-xs text-tertiary">Loading flow suites…</p> : suites.error ? <div className="wbw-err">{suites.error}</div> : !suites.list.length ? <p className="text-xs text-tertiary">This project has no flow suites.</p> : null}
            {error && <div className="wbw-err" role="alert">{error}</div>}
          </div>
        )}
    </Dialog>
  );
}
