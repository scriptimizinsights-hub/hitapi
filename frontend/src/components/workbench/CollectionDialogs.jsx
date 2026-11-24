/**
 * Web Workbench (W3) — dialogs for collections: save, settings, move, export,
 * send to a HitAPI project and import from one.
 */

import { useEffect, useMemo, useState } from 'react';
import { Download, ExternalLink } from 'lucide-react';
import { containerOptions, find, canMove, inheritedAuth, exportCollection } from '@hitapi/shared/collections.js';
import { authSummary } from '@hitapi/shared/auth.js';
import { Dialog } from './Dialogs.jsx';
import { KvTable } from './KvTable.jsx';
import { AuthTab } from './RequestTabs.jsx';
import { VarsTable } from './VarsTable.jsx';
import { COMMON_HEADERS } from '@hitapi/shared/http.js';
import { api } from '../../store/index.js';
import { exportPostman } from '@hitapi/shared/convert/postman.js';
import { exportOpenApi } from '@hitapi/shared/convert/openapi.js';
import { fileSafe } from '@hitapi/shared/convert/draft.js';
import yaml from '@hitapi/lib/js-yaml.mjs';

const NEW = '__new__';
const indent = (depth) => '   '.repeat(depth);

/** Save the open request into a collection or folder (or a new collection). */
export function SaveDialog({ tree, title, defaultName, defaultParentId, onSave, onClose }) {
  const options = useMemo(() => containerOptions(tree), [tree]);
  const [name, setName] = useState(defaultName);
  const [parent, setParent] = useState(defaultParentId && options.some(o => o.id === defaultParentId) ? defaultParentId : options[0]?.id || NEW);
  const [colName, setColName] = useState(tree.items.length ? 'New collection' : 'My API');
  const [error, setError] = useState('');
  const go = () => {
    if (!name.trim()) { setError('Enter a name.'); return; }
    if (parent === NEW && !colName.trim()) { setError('Enter a name for the new collection.'); return; }
    const e = onSave({ name: name.trim().slice(0, 120), parentId: parent === NEW ? null : parent, newCollectionName: colName.trim().slice(0, 120) });
    if (e) setError(e);
  };
  return (
    <Dialog title={title} onClose={onClose} footer={<>
      <span className="wbw-grow" />
      <button type="button" className="btn btn-ghost btn-sm" onClick={onClose}>Cancel</button>
      <button type="button" className="btn btn-primary btn-sm wbw-save-ok" onClick={go}>Save</button>
    </>}>
      <form className="wbw-form" onSubmit={(e) => { e.preventDefault(); go(); }}>
        <label className="wbw-field"><span>Name</span><input className="input" aria-label="Request name" value={name} maxLength={120} onChange={(e) => { setName(e.target.value); setError(''); }} /></label>
        <label className="wbw-field"><span>Save in</span>
          <select className="input" aria-label="Save in" value={parent} onChange={(e) => setParent(e.target.value)}>
            {options.map(o => <option key={o.id} value={o.id}>{indent(o.depth)}{o.type === 'collection' ? '' : '└ '}{o.label}</option>)}
            <option value={NEW}>+ New collection…</option>
          </select>
        </label>
        {parent === NEW && <label className="wbw-field"><span>New collection name</span><input className="input" aria-label="New collection name" value={colName} maxLength={120} onChange={(e) => setColName(e.target.value)} /></label>}
        <p className="text-xs text-tertiary">Saved in this browser. Tokens and passwords are saved with it, so you can send it again later; they're left out when you export.</p>
        {error && <div className="wbw-err" role="alert">{error}</div>}
        <button type="submit" hidden />
      </form>
    </Dialog>
  );
}

/** Collection settings (name, base URL, headers, auth) or folder settings (name, headers, auth). */
export function SettingsDialog({ tree, id, mode, onSave, onClose }) {
  const f = find(tree, id);
  const isCol = f?.node.type === 'collection';
  const [name, setName] = useState(f?.node.name || '');
  const [settings, setSettings] = useState(() => structuredClone(f?.node.settings || {}));
  const [error, setError] = useState('');
  if (!f) return null;
  const set = (patch) => setSettings((s) => ({ ...s, ...patch }));
  const inh = !isCol ? (() => {
    const { auth, from } = inheritedAuth(f.ancestors);
    const s = authSummary(auth);
    return { label: 'Inherit', describe: s ? `Uses the auth of "${from?.name}": ${s.text}` : `"${from?.name || 'The collection'}" sets no auth, so none is added.` };
  })() : null;
  const go = () => {
    if (!name.trim()) { setError('Enter a name.'); return; }
    const base = String(settings.baseUrl || '').trim();
    if (isCol && base && !/^(https?:\/\/[^\s]+|\{\{[^{}]+\}\}.*)$/i.test(base)) { setError('The base URL must start with http:// or https://'); return; }
    const out = { ...settings, headers: (settings.headers || []).filter(r => String(r.key || '').trim() || String(r.value || '').trim()) };
    if (isCol) out.baseUrl = base.replace(/\/+$/, '');
    onSave({ name: name.trim().slice(0, 120), settings: out });
  };
  return (
    <Dialog wide title={isCol ? `Collection settings: ${f.node.name}` : `Folder settings: ${f.node.name}`} onClose={onClose} footer={<>
      <span className="text-xs text-tertiary">{isCol ? 'Every request in this collection uses these.' : 'Every request in this folder uses these, after the collection\'s.'}</span>
      <span className="wbw-grow" />
      <button type="button" className="btn btn-ghost btn-sm" onClick={onClose}>Cancel</button>
      <button type="button" className="btn btn-primary btn-sm wbw-settings-ok" onClick={go}>Save</button>
    </>}>
      <div className="wbw-form">
        <label className="wbw-field"><span>Name</span><input className="input" aria-label="Name" value={name} maxLength={120} onChange={(e) => setName(e.target.value)} /></label>
        {isCol && (
          <label className="wbw-field"><span>Base URL</span>
            <input className="input font-mono" aria-label="Base URL" placeholder="https://api.example.com/v1" spellCheck={false} value={settings.baseUrl || ''} onChange={(e) => { set({ baseUrl: e.target.value }); setError(''); }} />
            <span className="text-xs text-tertiary">Requests whose URL starts with "/" are sent to this base URL, e.g. /users → https://api.example.com/v1/users.</span>
          </label>
        )}
        <div className="wbw-field"><span>Headers</span>
          <KvTable label="Headers" rows={settings.headers || []} suggestions={COMMON_HEADERS} onChange={(headers) => set({ headers })}
            hint={isCol ? 'Added to every request. A request\'s own header with the same name wins.' : 'Added after the collection\'s headers. A request\'s own header with the same name wins.'} />
        </div>
        <div className="wbw-field"><span>Auth</span>
          <AuthTab draft={{ auth: settings.auth }} update={(p) => set(p)} mode={mode} inherit={inh}
            note={'Used by requests whose Auth is "Inherit" (new saved requests are). Kept in this browser; left out when you export.'} />
        </div>
        <div className="wbw-field"><span>Variables</span>
          <VarsTable label={isCol ? 'Collection variables' : 'Folder variables'} rows={settings.variables || []} onChange={(variables) => set({ variables })}
            hint={isCol ? 'Defaults for every request in this collection, as {{name}}. A folder variable or the environment you pick wins over these.' : 'For the requests in this folder. They win over the collection\'s; the environment you pick wins over these.'} />
        </div>
        {error && <div className="wbw-err" role="alert">{error}</div>}
      </div>
    </Dialog>
  );
}

/** Move a request or folder into another collection or folder. */
export function MoveDialog({ tree, id, onMove, onClose }) {
  const f = find(tree, id);
  const options = useMemo(() => containerOptions(tree).filter(o => canMove(tree, id, o.id, 'inside')), [tree, id]);
  const [target, setTarget] = useState(options.find(o => o.id !== f?.parent?.id)?.id || options[0]?.id || '');
  if (!f) return null;
  return (
    <Dialog title={`Move "${f.node.name}"`} onClose={onClose} footer={<>
      <span className="wbw-grow" />
      <button type="button" className="btn btn-ghost btn-sm" onClick={onClose}>Cancel</button>
      <button type="button" className="btn btn-primary btn-sm wbw-move-ok" disabled={!target || target === f.parent?.id} onClick={() => onMove(target)}>Move</button>
    </>}>
      {options.length ? (
        <label className="wbw-field"><span>Move into</span>
          <select className="input" aria-label="Move into" value={target} onChange={(e) => setTarget(e.target.value)}>
            {options.map(o => <option key={o.id} value={o.id}>{indent(o.depth)}{o.type === 'collection' ? '' : '└ '}{o.label}{o.id === f.parent?.id ? ' (where it is now)' : ''}</option>)}
          </select>
        </label>
      ) : <p className="text-sm text-tertiary">There's nowhere else to move it. Create another collection or folder first.</p>}
      <p className="text-xs text-tertiary">You can also drag it in the sidebar.</p>
    </Dialog>
  );
}


export function downloadText(name, text, type = 'application/json') {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = Object.assign(document.createElement('a'), { href: url, download: name });
  document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

const EXPORT_FORMATS = [
  ['hitapi', 'HitAPI collection (.hitapi.json)', 'Everything, to import into HitAPI on another computer or in the HitAPI Chrome extension.'],
  ['postman', 'Postman collection v2.1 (.json)', 'Opens in Postman, Insomnia, Bruno and others. Tests and Set vars rules become Postman scripts.'],
  ['openapi-json', 'OpenAPI 3 (.json)', 'A best-effort API description: one path per request, example bodies, tags from folders. No secrets.'],
  ['openapi-yaml', 'OpenAPI 3 (.yaml)', 'The same, as YAML.'],
];

/** Export one collection: HitAPI, Postman v2.1 or OpenAPI 3 (the extension's converters). */
export function ExportDialog({ node, onClose, onNotify }) {
  const [fmt, setFmt] = useState('hitapi');
  const [secrets, setSecrets] = useState(false);
  const withSecrets = !fmt.startsWith('openapi');
  const go = () => {
    const base = fileSafe(node.name);
    const data = exportCollection(node, { secrets: withSecrets ? secrets : false });
    let file; let text; let type = 'application/json';
    if (fmt === 'hitapi') { file = `${base}.hitapi.json`; text = JSON.stringify(data, null, 2); }
    else if (fmt === 'postman') { file = `${base}.postman_collection.json`; text = JSON.stringify(exportPostman(data.collection), null, 2); }
    else if (fmt === 'openapi-json') { file = `${base}.openapi.json`; text = JSON.stringify(exportOpenApi(data.collection), null, 2); }
    else { file = `${base}.openapi.yaml`; text = yaml.dump(exportOpenApi(data.collection), { noRefs: true, lineWidth: 120 }); type = 'application/yaml'; }
    downloadText(file, text, type);
    onNotify?.(`Exported ${file}`);
    onClose();
  };
  return (
    <Dialog title={`Export "${node.name}"`} onClose={onClose} footer={<>
      <span className="wbw-grow" />
      <button type="button" className="btn btn-ghost btn-sm" onClick={onClose}>Cancel</button>
      <button type="button" className="btn btn-primary btn-sm wbw-export-ok" onClick={go}><Download size={12} /> Download</button>
    </>}>
      <label className="wbw-field"><span>Format</span>
        <select className="input" aria-label="Export format" value={fmt} onChange={(e) => setFmt(e.target.value)}>
          {EXPORT_FORMATS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
        </select>
      </label>
      <p className="text-sm text-tertiary">{EXPORT_FORMATS.find(x => x[0] === fmt)[2]}</p>
      {withSecrets && <>
        <label className="wbw-check"><input type="checkbox" checked={secrets} onChange={(e) => setSecrets(e.target.checked)} aria-label="Include tokens and passwords" /> Include tokens, passwords, API keys and secret variables</label>
        <p className={`text-xs ${secrets ? 'text-amber' : 'text-tertiary'}`}>{secrets ? 'Anyone with the file can use these secrets. Keep it private.' : 'Secrets are left out ({{variables}} are kept). Fill them in again after importing. Leave this off if you will share the file.'}</p>
      </>}
    </Dialog>
  );
}

const SignInNote = () => (
  <div className="wbw-note">
    <strong>Sign in to HitAPI first.</strong>
    <div className="text-xs">A free account works. <a href="/login">Sign in or create an account</a>, then try again. Collections themselves work without an account.</div>
  </div>
);

const listOf = (data, key) => (Array.isArray(data) ? data : Array.isArray(data?.[key]) ? data[key] : []);
const keyOf = (e) => `${String(e.method).toUpperCase()} ${String(e.path).replace(/\/+$/, '') || '/'}`;

function useProjects(signedIn) {
  const [state, setState] = useState({ loading: signedIn, projects: [], error: '' });
  useEffect(() => {
    if (!signedIn) return;
    let live = true;
    api.projects.list().then((d) => live && setState({ loading: false, projects: listOf(d, 'projects'), error: '' }))
      .catch((e) => live && setState({ loading: false, projects: [], error: e.message }));
    return () => { live = false; };
  }, [signedIn]);
  return state;
}

/** Send a collection's requests to a HitAPI project as endpoints (signed-in). endpoints(baseUrl) → list. */
export function PushDialog({ collection, signedIn, endpoints, onLinked, onClose }) {
  const { loading, projects: loaded, error: loadError } = useProjects(signedIn);
  const [created, setCreated] = useState([]);   // a project made here: "Send again" goes to it, not to another new one
  const projects = useMemo(() => [...loaded, ...created], [loaded, created]);
  const [pick, setPick] = useState('');
  const [pname, setPname] = useState(collection.name);
  const [pbase, setPbase] = useState(collection.settings.baseUrl || '');
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');
  useEffect(() => { if (!loading) setPick(loaded.some(p => p.id === collection.hitapiProjectId) ? collection.hitapiProjectId : loaded[0]?.id || NEW); }, [loading, loaded]);   // eslint-disable-line react-hooks/exhaustive-deps
  const project = projects.find(p => p.id === pick);
  const all = pick ? endpoints(pick === NEW ? pbase.trim() : project?.base_url || '') : [];
  const list = all.filter(e => !e.outside);
  const out = all.filter(e => e.outside);
  const go = async () => {
    setBusy(true); setError('');
    try {
      let p = project;
      if (pick === NEW) {
        if (!pname.trim()) throw new Error('Enter a project name.');
        if (!/^https?:\/\/[^\s]+$/i.test(pbase.trim())) throw new Error('Enter a base URL starting with http:// or https://');
        const d = await api.projects.create({ name: pname.trim(), base_url: pbase.trim().replace(/\/+$/, ''), environment: 'development' });
        p = d?.project || d;
        if (!p?.id) throw new Error('HitAPI did not return the new project.');
        setCreated((c) => [...c, p]); setPick(p.id);
      }
      const send = endpoints(p.base_url || '').filter(e => !e.outside);
      const existing = new Set(listOf(await api.endpoints.list(p.id), 'endpoints').map(keyOf));
      const r = { created: 0, skipped: 0, failed: [], project: p };
      for (const ep of send.slice(0, 500)) {
        const k = keyOf(ep);
        if (existing.has(k)) { r.skipped++; continue; }
        try { await api.endpoints.create(p.id, ep); existing.add(k); r.created++; } catch (e) { r.failed.push({ key: k, error: e.message }); }
      }
      onLinked?.(p.id);
      setResult(r);
    } catch (e) { setError(e.message); }
    setBusy(false);
  };
  return (
    <Dialog title={`Send "${collection.name}" to HitAPI`} onClose={onClose} footer={<>
      <span className="wbw-grow" />
      <button type="button" className="btn btn-ghost btn-sm" onClick={onClose}>Close</button>
      {signedIn && !loadError && <button type="button" className="btn btn-primary btn-sm wbw-push-ok" disabled={busy || loading || !list.length} onClick={go}>{busy ? 'Sending…' : result ? 'Send again' : 'Send'}</button>}
    </>}>
      {!signedIn ? <SignInNote /> : loading ? <p className="text-sm text-tertiary">Loading your HitAPI projects…</p> : loadError ? <div className="wbw-err">{loadError}</div> : (
        <div className="wbw-form">
          <p className="text-sm text-tertiary">Adds your saved requests to a HitAPI project, so HitAPI can generate tests and mock data for them.</p>
          <label className="wbw-field"><span>Project</span>
            <select className="input" aria-label="HitAPI project" value={pick} onChange={(e) => { setPick(e.target.value); setResult(null); }}>
              {projects.map(p => <option key={p.id} value={p.id}>{p.name}{p.base_url ? ` (${p.base_url})` : ''}</option>)}
              <option value={NEW}>+ New project…</option>
            </select>
          </label>
          {pick === NEW && <>
            <label className="wbw-field"><span>Project name</span><input className="input" aria-label="Project name" value={pname} onChange={(e) => setPname(e.target.value)} /></label>
            <label className="wbw-field"><span>Base URL</span><input className="input font-mono" aria-label="Project base URL" placeholder="https://api.example.com" value={pbase} onChange={(e) => setPbase(e.target.value)} /></label>
          </>}
          <p className="text-xs text-tertiary wbw-push-preview">
            {list.length} request{list.length === 1 ? '' : 's'} will be added as endpoints{list.length ? <> ({list.slice(0, 3).map((e, i) => <span key={i}>{i ? ', ' : ''}<code>{e.method} {e.path}</code></span>)}{list.length > 3 ? ', …' : ''})</> : ''}. Endpoints the project already has (same method and path) are left as they are. Secrets are never sent.
          </p>
          {out.length > 0 && <p className="text-xs text-amber">{out.length} request{out.length === 1 ? ' is' : 's are'} not under the project's base URL and will be left out: {out.slice(0, 3).map(e => `${e.method} ${e.url}`).join(', ')}{out.length > 3 ? ', …' : ''}</p>}
          {result && (
            <div className="wbw-okbox" role="status">
              <strong>✓ Added {result.created} endpoint{result.created === 1 ? '' : 's'} to "{result.project.name}".</strong>
              {result.skipped > 0 && <div className="text-xs">{result.skipped} {result.skipped === 1 ? 'was' : 'were'} already there.</div>}
              {result.failed.length > 0 && <div className="text-xs text-red">{result.failed.length} failed: {result.failed.slice(0, 3).map(x => `${x.key} (${x.error})`).join('; ')}</div>}
              <a href={`/projects/${encodeURIComponent(result.project.id)}`} target="_blank" rel="noopener noreferrer">Open the project <ExternalLink size={11} /></a>
            </div>
          )}
          {error && <div className="wbw-err" role="alert">{error}</div>}
        </div>
      )}
    </Dialog>
  );
}

/** Make a collection from a HitAPI project's endpoints (signed-in). onImport(project, endpoints) */
export function PullDialog({ signedIn, onImport, onClose }) {
  const { loading, projects, error: loadError } = useProjects(signedIn);
  const [pick, setPick] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => { if (!loading) setPick(projects[0]?.id || ''); }, [loading, projects]);
  const go = async () => {
    setBusy(true); setError('');
    try {
      const project = projects.find(p => p.id === pick);
      const eps = listOf(await api.endpoints.list(project.id), 'endpoints');
      if (!eps.length) { setError('This project has no endpoints yet.'); setBusy(false); return; }
      onImport(project, eps);
      onClose();
    } catch (e) { setError(e.message); setBusy(false); }
  };
  return (
    <Dialog title="Import from a HitAPI project" onClose={onClose} footer={<>
      <span className="wbw-grow" />
      <button type="button" className="btn btn-ghost btn-sm" onClick={onClose}>Cancel</button>
      {signedIn && projects.length > 0 && <button type="button" className="btn btn-primary btn-sm wbw-pull-ok" disabled={busy || !pick} onClick={go}>{busy ? 'Importing…' : 'Import'}</button>}
    </>}>
      {!signedIn ? <SignInNote /> : loading ? <p className="text-sm text-tertiary">Loading your HitAPI projects…</p> : loadError ? <div className="wbw-err">{loadError}</div>
        : !projects.length ? <p className="text-sm text-tertiary">You have no HitAPI projects yet. Create one, or send a collection to HitAPI.</p> : (
          <div className="wbw-form">
            <p className="text-sm text-tertiary">Creates a collection with one request per endpoint (a folder per tag), using the project's base URL. Your project isn't changed.</p>
            <label className="wbw-field"><span>Project</span>
              <select className="input" aria-label="HitAPI project" value={pick} onChange={(e) => setPick(e.target.value)}>
                {projects.map(p => <option key={p.id} value={p.id}>{p.name}{p.base_url ? ` (${p.base_url})` : ''}</option>)}
              </select>
            </label>
            {error && <div className="wbw-err" role="alert">{error}</div>}
          </div>
        )}
    </Dialog>
  );
}
