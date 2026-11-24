/**
 * HitAPI Web Workbench (web roadmap W1): build any HTTP request, send it from
 * HitAPI cloud, this browser or the HitAPI extension, and read the response.
 * Used by the public /playground page and the signed-in /workbench page.
 * With flowId (W10) it is a flow's own page: /playground/flows/:id, /workbench/flows/:id.
 * The request logic is the HitAPI extension's (@hitapi/shared).
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Send, Square, Terminal, Code2, Copy, FilePlus2, History, X, RotateCcw, Library, Save, Unlink, Workflow, ArrowLeft, Cloud, CloudOff, HardDrive } from 'lucide-react';
import { METHODS, paramsFromUrl, importHeaders, normalizeUrl } from '@hitapi/shared/http.js';
import { detectBody } from '@hitapi/shared/body.js';
import { emptyAuth, authSummary } from '@hitapi/shared/auth.js';
import { find, move, effectiveDraft, inheritedAuth, inheritedHeaders, baseUrlOf, isDirty, newRequest, newCollection, requestName,
  requestsIn, breadcrumb, importCollection, fromProject, toEndpoints } from '@hitapi/shared/collections.js';
import { parseCurl, looksLikeCurl } from '@hitapi/shared/curl.js';
import { emptyDraft, normalizeDraft, loadDraft, saveDraft, autoMode, finalRequest, isLocalUrl } from './core.js';
import { addEntry, getEntry, migrateOld, listIndex, onHistoryChange } from './history-db.js';
import { restoreSecrets, dayLabel } from '@hitapi/shared/history.js';
import { HistoryPanel, setHistoryToast } from './HistoryPanel.jsx';
import { CollectionsPanel } from './CollectionsPanel.jsx';
import { SaveDialog, SettingsDialog, MoveDialog, ExportDialog, PushDialog, PullDialog } from './CollectionDialogs.jsx';
import { Runner } from './Runner.jsx';
import { EnvDialog } from './EnvDialog.jsx';
import { loadEnvs, updateEnvs, setActiveEnv, onEnvChange } from './env-store.js';
import { buildScope, resolveDraft, resolveString, usedVars, shown, varsIn, runExtract, setVar, VAR_RE, DYNAMIC } from '@hitapi/shared/vars.js';
import { runTests, suggestTests, newTest } from '@hitapi/shared/assert.js';
import { newScenario, cloneScenario, parseData, runScenario, reportSummary, storableReport, toFlowStep, fromFlowSuite } from '@hitapi/shared/scenarios.js';
import { ciFile } from '@hitapi/shared/ci.js';
import { ScenariosPanel } from './ScenariosPanel.jsx';
import { ScenarioEditor, requestOfStep } from './ScenarioEditor.jsx';
import { FlowPushDialog, FlowPullDialog } from './ScenarioDialogs.jsx';
import { loadScenarios, updateScenarios, onScenariosChange } from './scenarios-store.js';
import { untilNextMinute } from './Runner.jsx';
import { downloadText } from './CollectionDialogs.jsx';
import { ImportDialog } from './ImportDialog.jsx';
import { newEnvId } from './env-store.js';
import { BackupDialog } from './BackupDialog.jsx';
import { ScheduleDialog } from './ScheduleDialog.jsx';
import { CiDialog, GitHubDialog } from './CiDialogs.jsx';
import { Dialog } from './Dialogs.jsx';
import { loadSyncState, saveSyncState, onSyncStateChange, syncNow, stopSync } from './sync.js';
import { ago } from '@hitapi/shared/sync.js';
import { saveTree } from './collections-store.js';
import { loadTree, updateTree, onTreeChange, WARN_BYTES } from './collections-store.js';
import { send } from './send.js';
import { pingExtension, connectExtension } from './bridge.js';
import { RequestTabs } from './RequestTabs.jsx';
import { ResponseView } from './ResponseView.jsx';
import { ModePicker } from './ModePicker.jsx';
import { loadFlowPrefs, saveFlowPrefs, onFlowPrefs } from './flow-prefs.js';
import { FlowSettingsDialog } from './FlowSettings.jsx';

const HANDOFF_KEY = 'hitapi:web:flowHandoff';   // the flow page → the Workbench: open this step / result
import { CodeDialog, CurlDialog } from './Dialogs.jsx';
import { cachedToken } from './send.js';
import { useStore } from '../../store/index.js';
import './workbench.css';

const MODE_KEY = 'hitapi:web:mode';
const HISTORY_OPEN_KEY = 'hitapi:web:historyOpen';   // W2: replaced by SIDE_KEY, read once
const SIDE_KEY = 'hitapi:web:side';                   // 'collections' | 'scenarios' | 'history' | 'none'
const LINK_KEY = 'hitapi:web:link';                   // id of the saved request open in the editor
const forSave = (d) => { const c = structuredClone(d); delete c.source; delete c.link; return c; };
/** The request with {{variables}} filled in from this scope; secret values used (to blank them out of History). */
function resolveWith(template, scope) {
  const { draft: resolved, missing, used } = resolveDraft(template, scope);
  const secrets = used.map(n => scope.get(n)).filter(v => v?.secret && v.value.length >= 4).map(v => v.value);
  return { resolved, missing, secrets };
}
const scopeOf = (envs, ancestors = [], local = null) => buildScope({ globals: envs.globals, env: envs.envs.find(e => e.id === envs.active) || null, ancestors, local });
const targetOf = (envs) => { const e = envs.envs.find(x => x.id === envs.active); return e ? `the "${e.name}" environment` : 'Globals (no environment is selected)'; };
/** "Set vars" rules on a response: values go to the active environment, or Globals. */
function applyExtract(rules, res) {
  const results = runExtract(rules, res);
  const ok = results.filter(r => r.ok);
  if (ok.length) {
    updateEnvs((s) => {
      const e = s.envs.find(x => x.id === loadEnvs().active);
      for (const r of ok) { if (e) e.vars = setVar(e.vars, r.name, r.value); else s.globals = setVar(s.globals, r.name, r.value); }
    });
  }
  return results;
}
/** Run a request's checks on its response; {{vars}} in paths and expected values are filled in first. null: no checks. */
function checkWith(tests, res, scope) {
  const list = (tests || []).filter(t => t.enabled !== false);
  if (!list.length) return null;
  const fill = (v) => (String(v ?? '').includes('{{') ? resolveString(v, scope).value : v);
  return runTests(list.map(t => ({ ...t, path: fill(t.path), expected: fill(t.expected) })), res);
}
const urlIsPath = (u) => /^\s*\//.test(String(u || '')) && !/^\s*\/\//.test(String(u || ''));

export const SAMPLES = [
  { label: 'Get a user', method: 'GET', url: 'https://services.hitapi.dev/mock/demo/users/42' },
  { label: 'List posts', method: 'GET', url: 'https://jsonplaceholder.typicode.com/posts?_limit=5' },
  { label: 'Create a post', method: 'POST', url: 'https://jsonplaceholder.typicode.com/posts', json: '{\n  "title": "Hello",\n  "body": "From HitAPI",\n  "userId": 1\n}' },
  { label: 'Echo headers', method: 'GET', url: 'https://httpbin.org/headers' },
];


export function Workbench({ variant = 'public', flowId = null }) {
  const navigate = useNavigate();
  const [search, setSearch] = useSearchParams();
  const base = variant === 'app' ? '/workbench' : '/playground';
  const flowUrl = (id) => `${base}/flows/${encodeURIComponent(id)}`;
  const [flowPrefs, setFlowPrefs] = useState(() => (typeof window === 'undefined' ? null : loadFlowPrefs()));
  useEffect(() => onFlowPrefs(setFlowPrefs), []);
  const [flowMissing, setFlowMissing] = useState(false);
  const addToast = useStore((s) => s.addToast);
  const notify = useCallback((m, type = 'info') => addToast?.(m, type), [addToast]);
  const [draft, setDraft] = useState(emptyDraft);
  const [files, setFiles] = useState({ binary: null, form: new Map() });
  const [res, setRes] = useState(null);
  const [sending, setSending] = useState(false);
  const [tab, setTab] = useState('params');
  const [modeChoice, setModeChoice] = useState(null);
  const [ext, setExt] = useState({ installed: false, allowed: false, outdated: false, version: null });
  const [connecting, setConnecting] = useState(false);
  const [historyCount, setHistoryCount] = useState(0);
  const [side, setSide] = useState(null);       // sidebar: 'collections' | 'history' | null
  const [activeHistoryId, setActiveHistoryId] = useState(null);
  const [dialog, setDialog] = useState(null);   // 'code' | 'curl'
  const [tree, setTree] = useState({ items: [] });
  const [linkId, setLinkIdState] = useState(null);
  const [cdlg, setCdlg] = useState(null);       // collection dialogs: { type, id }
  const [run, setRun] = useState(null);         // { key, id, title, items }
  const [showRunner, setShowRunner] = useState(false);
  const [renameId, setRenameId] = useState(null);
  const [expandIds, setExpandIds] = useState(null);   // { ids }: collections to show opened (after an import)
  const [envs, setEnvs] = useState({ globals: [], envs: [], active: '' });
  const [envDlg, setEnvDlg] = useState(null);   // { select, addName }
  const [extractResults, setExtractResults] = useState(null);
  const [problem, setProblem] = useState(null);  // { text, action: { label, fn } } shown under the URL
  // scenarios (W6)
  const [scenState, setScenState] = useState({ items: [] });
  const [openScen, setOpenScen] = useState(null);     // { id, focusName }
  const [scenEdit, setScenEdit] = useState(null);     // the open scenario, as edited
  const [scenReports, setScenReports] = useState({}); // id → report of this visit (with responses)
  const [scenRunning, setScenRunning] = useState(null);
  const [scenPaused, setScenPaused] = useState(0);
  const [stepLink, setStepLink] = useState(null);     // { scenarioId, stepId }: a scenario's copied step is open in the editor
  const scenRun = useRef(null);
  const scenSaveTimer = useRef(null);
  const treeRef = useRef(tree);
  treeRef.current = tree;
  // account storage and sync (W8)
  const [sync, setSync] = useState(() => ({ enabled: false }));
  const [accountAsk, setAccountAsk] = useState(null);   // 'first' (signed in, local data) | 'signedOut'
  const [, setTick] = useState(0);
  const applyingSync = useRef(false);
  const syncTimer = useRef(null);
  const user = useStore((s) => s.user);
  const authLoading = useStore((s) => s.authLoading);
  const signedIn = !!user;
  const lastParentId = useRef(null);
  const warnedSize = useRef(false);
  const [notes, setNotes] = useState([]);
  const [ready, setReady] = useState(false);
  const ctrl = useRef(null);
  const saveTimer = useRef(null);
  const pendingDraft = useRef(null);
  const pendingScen = useRef(null);
  // leaving the page (e.g. Workbench ↔ a flow's page): write what is still waiting to be saved
  useEffect(() => () => {
    if (pendingDraft.current) { clearTimeout(saveTimer.current); saveDraft(pendingDraft.current); }
    if (pendingScen.current) { clearTimeout(scenSaveTimer.current); pendingScen.current(); }
  }, []);

  // load the draft, recent list, chosen mode and the extension state (browser only, after the first paint)
  useEffect(() => {
    const d = loadDraft();
    if (d) { setDraft(d); if (d.bodyType !== 'none' && d.method !== 'GET' && d.method !== 'HEAD') setTab('body'); }
    const t = loadTree();
    setTree(t);
    try {
      const l = localStorage.getItem(LINK_KEY);
      if (l && find(t, l)?.node.type === 'request') setLinkIdState(l);
      const sv = localStorage.getItem(SIDE_KEY); const hv = localStorage.getItem(HISTORY_OPEN_KEY);
      if (sv) setSide(sv === 'none' ? null : sv);
      else if (hv) setSide(hv === '1' ? 'history' : null);
      else if (window.innerWidth >= 1280) setSide(t.items.length ? 'collections' : 'history');
    } catch { /* ignore */ }
    migrateOld().catch(() => {});
    try { const m = localStorage.getItem(MODE_KEY); if (m) setModeChoice(m); } catch { /* ignore */ }
    const refresh = () => pingExtension().then(setExt);
    refresh();
    window.addEventListener('focus', refresh);
    setReady(true);
    return () => window.removeEventListener('focus', refresh);
  }, []);

  useEffect(() => { setHistoryToast((m) => notify(m, 'success')); return () => setHistoryToast(null); }, [notify]);
  const showSide = (name) => { setSide(name); try { localStorage.setItem(SIDE_KEY, name || 'none'); } catch { /* ignore */ } };
  const toggleSide = (name) => showSide(side === name ? null : name);

  // ── saved requests (W3) ──
  useEffect(() => onTreeChange(setTree), []);
  useEffect(() => { setEnvs(loadEnvs()); return onEnvChange(setEnvs); }, []);
  useEffect(() => { setScenState(loadScenarios()); return onScenariosChange(setScenState); }, []);

  // ── account storage and sync (W8) ──
  const syncIO = useMemo(() => ({
    load: (kind) => (kind === 'collections' ? loadTree() : kind === 'environments' ? (({ active, ...e }) => e)(loadEnvs()) : loadScenarios()),
    save: (kind, data) => {
      if (kind === 'collections') saveTree(data);
      else if (kind === 'environments') updateEnvs((st) => { st.globals = data.globals; st.envs = data.envs; });
      else updateScenarios((st) => { st.items = data.items; return true; });
    },
  }), []);
  const runSync = useCallback(async (opts) => {
    applyingSync.current = true;
    let r;
    try { r = await syncNow(syncIO, opts); } finally { applyingSync.current = false; }
    if (r?.conflicts?.length) notify(`Changed here and on another device: both kept (${r.conflicts.map(c => `"${c} (conflict copy)"`).join(', ')}).`, 'info');
    return r;
  }, [syncIO, notify]);
  useEffect(() => { setSync(loadSyncState()); return onSyncStateChange(setSync); }, []);
  useEffect(() => { const t = setInterval(() => setTick(x => x + 1), 30000); return () => clearInterval(t); }, []);
  // signed in / out: decide what happens to this browser's data (once auth is known)
  useEffect(() => {
    if (!ready || authLoading) return;
    const st = loadSyncState();
    if (user) {
      const uid = String(user.id ?? user.email ?? '');
      if (st.userId === uid) { if (st.enabled) runSync(); return; }
      const t = loadTree(); const e = loadEnvs(); const sc = loadScenarios();
      const hasLocal = t.items.length || e.envs.length || e.globals.some(v => v.key) || sc.items.length;
      if (hasLocal) setAccountAsk({ kind: 'first', uid, counts: { collections: t.items.length, envs: e.envs.length, scenarios: sc.items.length } });
      else { saveSyncState({ enabled: true, userId: uid, kinds: {}, lastError: '' }); runSync(); }
    } else if (st.userId) setAccountAsk({ kind: 'signedOut' });
  }, [ready, authLoading, user]);   // eslint-disable-line react-hooks/exhaustive-deps
  // when to save: a few seconds after a change, every 5 minutes, on focus, when back online
  useEffect(() => {
    if (!user || !sync.enabled) return undefined;
    const soon = () => { if (applyingSync.current) return; clearTimeout(syncTimer.current); syncTimer.current = setTimeout(() => runSync(), 3000); };
    const offs = [onTreeChange(soon), onEnvChange(soon), onScenariosChange(soon)];
    const every = setInterval(() => runSync(), 5 * 60 * 1000);
    const now = () => runSync();
    window.addEventListener('focus', now); window.addEventListener('online', now);
    return () => { offs.forEach(f => f()); clearInterval(every); clearTimeout(syncTimer.current); window.removeEventListener('focus', now); window.removeEventListener('online', now); };
  }, [user, sync.enabled, runSync]);
  const clearLocalData = () => { saveTree({ items: [] }); updateEnvs((st) => { st.globals = []; st.envs = []; }); setActiveEnv(''); updateScenarios((st) => { st.items = []; return true; }); setLinkId(null); };
  const syncLabel = !user ? null : !sync.enabled ? 'Not in account' : sync.syncing ? 'Saving…' : sync.offline ? 'Offline' : sync.lastError ? 'Not saved' : sync.lastSyncAt ? `Saved · ${ago(sync.lastSyncAt)}` : 'Saving…';
  // the toolbar's History count, also while the History panel is closed
  useEffect(() => {
    let live = true;
    const load = () => listIndex().then((l) => { if (live) setHistoryCount(l.length); }).catch(() => {});
    load();
    const off = onHistoryChange(load);
    return () => { live = false; off(); };
  }, []);
  const setLinkId = useCallback((id) => { setLinkIdState(id); try { if (id) localStorage.setItem(LINK_KEY, id); else localStorage.removeItem(LINK_KEY); } catch { /* ignore */ } }, []);
  const linked = useMemo(() => { const f = linkId ? find(tree, linkId) : null; return f?.node.type === 'request' ? f : null; }, [tree, linkId]);
  // the saved request that was open got deleted (here or in another tab): keep the edits, unsaved
  useEffect(() => {
    if (ready && linkId && !linked) { setLinkId(null); notify('The saved request you had open was deleted. Your changes are still here, unsaved.', 'info'); }
  }, [ready, linkId, linked, setLinkId, notify]);
  const dirty = useMemo(() => (linked ? isDirty(draft, normalizeDraft(structuredClone(linked.node.draft))) : false), [draft, linked]);
  /** The draft as it will be sent: the collection's base URL, headers and auth applied. */
  const effective = useMemo(() => (linked ? effectiveDraft(draft, linked.ancestors) : draft), [draft, linked]);
  const inherit = useMemo(() => {
    if (!linked) return null;
    const { auth, from } = inheritedAuth(linked.ancestors);
    const s = authSummary(auth);
    return {
      headers: inheritedHeaders(linked.ancestors),
      auth: { label: 'Inherit', describe: s ? `Inherited from "${from?.name}": ${s.text}` : `"${from?.name || 'The collection'}" sets no auth, so none is added. Set it in the collection's settings.` },
    };
  }, [linked]);

  /** Change the saved tree; storage problems become a message. Returns fn's result (undefined on error). */
  const edit = useCallback((fn) => {
    try {
      const { result, tree: t, bytes } = updateTree(fn);
      if (result !== false) setTree(t);
      if (bytes > WARN_BYTES && !warnedSize.current) { warnedSize.current = true; notify(`Your saved requests use ${(bytes / 1048576).toFixed(1)} MB of this browser's storage (about 5 MB in all). Export collections you don't use and delete them here.`, 'info'); }
      return result;
    } catch (e) { notify(e.message, 'error'); return undefined; }
  }, [notify]);

  // ── variables (W4) ──
  const activeEnv = envs.envs.find(e => e.id === envs.active) || null;
  const scope = useMemo(() => scopeOf(envs, linked?.ancestors || []), [envs, linked]);
  const used = useMemo(() => usedVars(effective, scope), [effective, scope]);
  /** The URL as it will be sent, secrets hidden (dynamic variables left as written). */
  const preview = useMemo(() => String(effective.url || '').replace(VAR_RE, (w, n) => (DYNAMIC[n] ? w : scope.get(n) ? shown(scope.get(n)) : w)), [effective, scope]);
  const realUrl = useMemo(() => resolveString(effective.url, scope).value, [effective, scope]);

  const mode = modeChoice || autoMode(realUrl, ext);
  const chooseMode = (m) => { setModeChoice(m); try { localStorage.setItem(MODE_KEY, m); } catch { /* ignore */ } };

  const update = useCallback((patch) => {
    setProblem(null);
    setDraft((d) => {
      const next = { ...d, ...patch };
      if ('url' in patch && !('params' in patch)) next.params = paramsFromUrl(patch.url, d.params);
      clearTimeout(saveTimer.current);
      pendingDraft.current = next;
      saveTimer.current = setTimeout(() => { saveDraft(next); pendingDraft.current = null; }, 300);
      return next;
    });
  }, []);

  const loadInto = useCallback((d, message, { link = null, step = null } = {}) => {
    const next = normalizeDraft(d);
    clearTimeout(saveTimer.current);   // a pending save of the old draft must not overwrite this one
    setDraft(next); saveDraft(next); setFiles({ binary: null, form: new Map() }); setRes(null);
    setTab(next.method !== 'GET' && next.method !== 'HEAD' && next.bodyType !== 'none' ? 'body' : 'params');
    setActiveHistoryId(null);
    setLinkId(link);
    setStepLink(step);
    setExtractResults(null); setProblem(null);
    if (message) notify(message, 'success');
  }, [notify, setLinkId]);

  /** Leaving a saved request with unsaved changes: ask first. */
  const confirmLeave = useCallback(() => !(linked && dirty) || confirm(`Discard your unsaved changes to "${linked.node.name}"?`), [linked, dirty]);

  const openSaved = useCallback((id) => {
    const f = find(tree, id);
    if (!f || f.node.type !== 'request') return false;
    if (id === linkId) return true;
    if (!confirmLeave()) return false;
    loadInto(structuredClone(f.node.draft), null, { link: id });
    setShowRunner(false);
    return true;
  }, [tree, linkId, confirmLeave, loadInto]);

  const saveToStep = useCallback(() => {
    const { scenarioId, stepId } = stepLink || {};
    const d = forSave(draft);
    let ok = false;
    try { ok = updateScenarios((st) => { const step = st.items.find(x => x.id === scenarioId)?.steps.find(x => x.id === stepId); if (!step) return false; step.draft = d; return true; }).result === true; }
    catch (e) { notify(e.message, 'error'); return; }
    if (!ok) { notify('That step no longer exists.', 'error'); return; }
    setScenEdit((se) => (se?.id === scenarioId ? { ...se, steps: se.steps.map(x => (x.id === stepId ? { ...x, draft: d } : x)) } : se));
    notify('Saved to the scenario step', 'success');
  }, [stepLink, draft, notify]);

  const save = useCallback(() => {
    if (stepLink && !linked) { saveToStep(); return; }
    if (!linked) { setCdlg({ type: 'save' }); return; }
    const ok = edit(t => { const x = find(t, linked.node.id); if (!x) return false; x.node.draft = forSave(draft); return true; });
    if (ok === true) notify(`Saved "${linked.node.name}"`, 'success');
  }, [linked, draft, edit, notify, stepLink, saveToStep]);

  const saveNew = ({ name, parentId, newCollectionName }) => {
    const d = forSave(draft);
    if (d.auth.type === 'none') d.auth.type = 'inherit';   // like Postman: use the collection's auth, if it has one
    const req = newRequest(name, d);
    let where = '';
    const ok = edit(t => {
      let p;
      if (!parentId) { p = newCollection(newCollectionName || 'My API'); t.items.push(p); } else p = find(t, parentId)?.node;
      if (!p) return false;
      p.children.push(req);
      lastParentId.current = p.id; where = p.name;
      return true;
    });
    if (ok !== true) return ok === false ? 'That folder no longer exists.' : 'Not saved.';
    setDraft((x) => { const n = { ...x, auth: { ...x.auth, type: d.auth.type } }; saveDraft(n); return n; });
    setLinkId(req.id);
    setCdlg(null);
    notify(`Saved to "${where}"`, 'success');
    return null;
  };

  const newRequestIn = (parentId) => {
    const p = find(tree, parentId);
    if (!p || !confirmLeave()) return;
    const anc = [...p.ancestors, p.node];
    const d = { ...emptyDraft(), url: baseUrlOf(anc) ? '/' : '' };
    d.auth.type = 'inherit';
    const req = newRequest('New request', d);
    if (edit(t => { const x = find(t, parentId); if (!x) return false; x.node.children.push(req); return true; }) !== true) return;
    loadInto(structuredClone(req.draft), null, { link: req.id });
    setShowRunner(false);
    setRenameId(req.id);
  };

  const detach = () => {
    const e = effective;
    const next = { ...draft, url: e.url, headers: e.headers, auth: e.auth };   // keep what it sends
    setDraft(next); saveDraft(next); setLinkId(null);
    notify('Detached: this is now an unsaved request (with the collection\'s URL, headers and auth copied in).', 'info');
  };

  const runNode = (id) => {
    const f = find(tree, id);
    const items = requestsIn(tree, id);
    if (!f || !items.length) { notify('Nothing to run: there are no saved requests in it yet.', 'info'); return; }
    setRun({ key: Date.now(), id, title: f.node.name, items });
    setShowRunner(true);
  };

  /** One request of a run: collection settings applied, sent with the chosen mode, kept in History. */
  /** One request of a collection run or scenario: it = { node: { draft, name }, ancestors }; row: data-row variables (scenarios). */
  const runOne = useCallback(async (it, signal, row = null) => {
    const nd = normalizeDraft(structuredClone(it.node.draft));
    const template = effectiveDraft(nd, it.ancestors);
    const now = loadEnvs();   // fresh: an earlier request of the run may have set variables
    const { resolved: d, missing, secrets } = resolveWith(template, scopeOf(now, it.ancestors, row));
    const envName = now.envs.find(e => e.id === now.active)?.name;
    if (missing.length) return { error: `Not defined${envName ? ` in "${envName}"` : ''}: ${missing.map(n => `{{${n}}}`).join(', ')}`, kind: 'invalid' };
    if (urlIsPath(d.url)) return { error: `"${it.ancestors[0]?.name}" has no base URL, so "${d.url.trim()}" can't be sent.`, kind: 'invalid' };
    const m = modeChoice || autoMode(d.url, ext);
    if (m === 'extension' && !(ext.installed && ext.allowed && !ext.outdated)) return { error: 'Connect the HitAPI extension first, or pick another way to send.', kind: 'not_allowed' };
    const c = new AbortController();
    const stop = () => c.abort('cancel');
    signal?.addEventListener('abort', stop);
    const limit = m === 'cloud' ? Math.min(15, d.settings.timeoutSec) + 2 : d.settings.timeoutSec;
    const t = setTimeout(() => c.abort('timeout'), limit * 1000);
    try {
      const r = await send(d, { mode: m, files: {}, signal: c.signal, id: `run${Date.now()}` });
      if (r.kind !== 'rate' && r.kind !== 'cancel') {
        const results = checkWith(nd.tests, r, scopeOf(now, it.ancestors, row));   // pass/fail of the run comes from these
        if (results) r.tests = results;
        // "Set vars" run in order, so a login request can set {{token}} for the next ones
        const x = applyExtract(nd.extract || [], r);
        r.setVars = x.filter(v => v.ok).map(v => v.name);
        const bad = x.filter(v => !v.ok);
        if (bad.length) r.warnings = [...(r.warnings || []), ...bad.map(v => `${v.name} not set: ${v.reason}`)];
        addEntry(template, r, { resolved: d, redact: secrets }).catch(() => {});
      }
      return r;
    } finally { clearTimeout(t); signal?.removeEventListener('abort', stop); }
  }, [modeChoice, ext]);

  const openRunResult = (i, r) => {
    const it = run?.items[i];
    if (!it || !openSaved(it.node.id)) return;
    setShowRunner(false);
    if (r) setRes({ ...r, fromRun: { title: run.title } });
  };

  // ── scenarios (W6) ──
  const scenEditRef = useRef(scenEdit);
  scenEditRef.current = scenEdit;
  const editScen = useCallback((fn) => {
    try { return updateScenarios(fn).result; } catch (e) { notify(e.message, 'error'); return undefined; }
  }, [notify]);
  /**
   * Open a scenario. W10: by the Flow settings, on its own page (default), in a new tab or here.
   * Returns 'here' | 'page' | 'tab' | null (not found).
   */
  const openScenario = useCallback((id, { focusName = false, run = false, here = false } = {}) => {
    const sc = loadScenarios().items.find(x => x.id === id);
    if (!sc) return null;
    const where = flowId || here ? 'inline' : (loadFlowPrefs().open);
    if (where !== 'inline') {
      const url = `${flowUrl(id)}${run ? '?run=1' : focusName ? '?name=1' : ''}`;
      if (where === 'tab') { const w = window.open(url, '_blank'); if (w) { try { w.opener = null; } catch { /* ignore */ } return 'tab'; } }
      navigate(url);
      return 'page';
    }
    setScenEdit(structuredClone(sc)); setOpenScen({ id, focusName }); if (!flowId) showSide('scenarios');
    return 'here';
  }, [flowId, navigate, base]);   // eslint-disable-line react-hooks/exhaustive-deps
  const closeScenario = () => { setOpenScen(null); setScenEdit(null); };
  /** Edits of the open scenario are saved shortly after (typing in a number box writes once). */
  const changeScenario = (next) => {
    setScenEdit(next);
    clearTimeout(scenSaveTimer.current);
    const write = () => { pendingScen.current = null; editScen((st) => {
      const i = st.items.findIndex(x => x.id === next.id);
      if (i < 0) return false;
      st.items[i] = { ...structuredClone(next), lastReport: st.items[i].lastReport, hitapi: st.items[i].hitapi ?? next.hitapi };
      return true;
    }); };
    pendingScen.current = write;
    scenSaveTimer.current = setTimeout(write, 300);
  };
  const uniqueScenName = (base) => { const names = new Set(scenState.items.map(x => x.name)); if (!names.has(base)) return base; for (let i = 2; ; i++) if (!names.has(`${base} ${i}`)) return `${base} ${i}`; };
  const newScenarioNow = () => {
    const sc = newScenario(uniqueScenName('New scenario'));
    sc.flow = { view: loadFlowPrefs().defaultView };
    if (editScen((st) => { st.items.push(sc); return true; }) === true) openScenario(sc.id, { focusName: true });
  };

  /** One step of a scenario run: the saved request (collection settings applied) or the step's own copy; data row on top. */
  const runScenarioStep = useCallback(async (step, { row, signal }) => {
    const req = requestOfStep(step, treeRef.current);
    if (!req) return { error: 'The saved request for this step was deleted.', kind: 'invalid', name: 'Deleted request' };
    const it = { node: { draft: req.draft, name: req.name }, ancestors: req.ancestors };
    const method = String(req.draft.method || 'GET').toUpperCase();
    for (;;) {
      const r = await runOne(it, signal, row);
      if (r.kind !== 'rate' || signal?.aborted) return { ...r, name: req.name, method };
      // HitAPI cloud's per-minute limit: wait for the next minute, then send this step again
      const until = Date.now() + untilNextMinute();
      while (Date.now() < until && !signal?.aborted) { setScenPaused(Math.ceil((until - Date.now()) / 1000)); await new Promise(res => setTimeout(res, Math.min(1000, until - Date.now()))); }
      setScenPaused(0);
      if (signal?.aborted) return { error: 'Request cancelled.', kind: 'cancel', name: req.name, method };
    }
  }, [runOne]);

  const runScenarioNow = useCallback(async (sc, only) => {
    if (scenRun.current) { notify('A scenario is already running. Stop it first.', 'info'); return; }
    if (!sc.steps.some(x => x.enabled)) { notify('Add a step first.', 'info'); return; }
    let rows;
    try { rows = parseData(sc.data); } catch (e) { notify(`Data: ${e.message}`, 'error'); return; }
    const controller = new AbortController();
    scenRun.current = { controller, id: sc.id };
    setScenRunning(sc.id);
    const report = await runScenario({
      scenario: sc, rows, only, runStep: runScenarioStep, signal: controller.signal,
      onUpdate: (r) => setScenReports((m) => ({ ...m, [sc.id]: { ...r, results: r.results.map(x => ({ ...x })) } })),
    });
    scenRun.current = null; setScenRunning(null); setScenPaused(0);
    setScenReports((m) => ({ ...m, [sc.id]: { ...report, results: report.results.map(x => ({ ...x })) } }));
    editScen((st) => { const x = st.items.find(i => i.id === sc.id); if (!x) return false; x.lastReport = storableReport(report); return true; });
    const sm = reportSummary(report);
    notify(`${sc.name}: ${sm.passed} passed, ${sm.failed} failed`, sm.failed ? 'error' : 'success');
  }, [runScenarioStep, notify, editScen]);

  /**
   * W10 flow builder: change step drafts together — saved requests (one tree edit) and the
   * flow's own copies (one scenario change). fn(draft) mutates. Returns true when saved.
   */
  const editStepDrafts = (list) => {
    try {
      const saved = list.filter(x => x.step.kind === 'saved');
      const own = list.filter(x => x.step.kind !== 'saved');
      // check everything on copies first, so a mistake (e.g. a broken JSON body) changes nothing
      for (const x of list) { const req = requestOfStep(x.step, treeRef.current); if (!req) throw new Error('The saved request for this step was deleted.'); x.fn(normalizeDraft(structuredClone(req.draft))); }
      if (saved.length) {
        const openWasClean = linked && !dirty;
        const ok = edit((t) => { for (const x of saved) { const f = find(t, x.step.requestId); if (!f) return false; const d = normalizeDraft(structuredClone(f.node.draft)); x.fn(d); f.node.draft = d; } return true; });
        if (ok !== true) return false;
        // the open request is one of them and had no unsaved edits: show the new version
        const hit = openWasClean && saved.find(x => x.step.requestId === linked.node.id);
        if (hit) { const f = find(loadTree(), linked.node.id); if (f) setDraft(normalizeDraft(structuredClone(f.node.draft))); }
      }
      if (own.length) {
        const next = structuredClone(scenEditRef.current);
        for (const x of own) { const st = next.steps.find(y => y.id === x.step.id); if (!st) return false; st.draft = normalizeDraft(st.draft); x.fn(st.draft); }
        changeScenario(next);
      }
      return true;
    } catch (e) { notify(e.message, 'error'); return false; }
  };
  const scopeForStep = useCallback((req) => scopeOf(envs, req?.ancestors || []), [envs]);

  /** Open a step's request: a saved one as itself, a copied one with "Save to step". */
  const openStep = (scenarioId, step) => {
    if (flowId) { leaveFlow({ type: 'step', scenarioId, stepId: step.id }); return false; }
    if (step.kind === 'saved') { if (!openSaved(step.requestId)) return false; closeScenario(); return true; }
    if (!confirmLeave()) return false;
    loadInto(structuredClone(step.draft), null, { step: { scenarioId, stepId: step.id } });
    closeScenario();
    return true;
  };
  const openScenarioResult = (scenarioId, r, step) => {
    if (flowId) { leaveFlow({ type: 'result', scenarioId, stepId: step?.id, response: r.response && JSON.stringify(r.response).length < 2e6 ? r.response : null }); return; }
    const name = scenEditRef.current?.name;
    if (!step || !openStep(scenarioId, step)) return;
    if (r.response) setRes({ ...r.response, fromScenario: { id: scenarioId, name } });
  };

  /** From a flow's page back to the Workbench, optionally opening a step or a run result there. */
  const leaveFlow = (handoff = null) => {
    if (scenRun.current && !confirm('A run is in progress. Leave the flow and stop it?')) return;
    scenRun.current?.controller.abort('cancel');
    try { if (handoff) sessionStorage.setItem(HANDOFF_KEY, JSON.stringify(handoff)); } catch { /* too big or blocked */ }
    navigate(base);
  };
  // the Workbench page: a flow's page asked to open a step or a result here
  useEffect(() => {
    if (!ready || flowId) return;
    let h = null; try { h = JSON.parse(sessionStorage.getItem(HANDOFF_KEY) || 'null'); sessionStorage.removeItem(HANDOFF_KEY); } catch { /* ignore */ }
    if (!h) return;
    const sc = loadScenarios().items.find(x => x.id === h.scenarioId); const step = sc?.steps.find(x => x.id === h.stepId);
    if (!step) return;
    if (openStep(h.scenarioId, step) && h.type === 'result' && h.response) setRes({ ...h.response, fromScenario: { id: sc.id, name: sc.name } });
  }, [ready]);   // eslint-disable-line react-hooks/exhaustive-deps
  // a flow's page: open it (and run it when asked)
  useEffect(() => {
    if (!ready || !flowId) return;
    const r = openScenario(flowId, { here: true, focusName: search.get('name') === '1' });
    if (!r) { setFlowMissing(true); return; }
    if (search.get('run') === '1') { const sc = loadScenarios().items.find(x => x.id === flowId); if (sc) setTimeout(() => runScenarioNow(sc, null), 0); }
    if (search.get('run') || search.get('name')) setSearch({}, { replace: true });
  }, [ready, flowId]);   // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (flowId && scenEdit?.name) document.title = `${scenEdit.name} · Flow · HitAPI`; }, [flowId, scenEdit?.name]);

  /** A scenario → flow suite steps: environment values filled in, except secrets and variables a step sets. */
  const flowSteps = (sc) => {
    const produced = new Set();
    const now = loadEnvs();
    return sc.steps.filter(x => x.enabled).map((step) => {
      const req = requestOfStep(step, tree);
      if (!req) return null;
      const template = effectiveDraft(normalizeDraft(structuredClone(req.draft)), req.ancestors);
      const scope = scopeOf(now, req.ancestors);
      for (const n of produced) scope.delete(n);
      for (const [k, v] of [...scope]) if (v.secret) scope.delete(k);
      const { draft: resolved, missing } = resolveDraft(template, scope);
      resolved.tests = template.tests; resolved.extract = template.extract;
      const out = toFlowStep(req.name, resolved);
      for (const e of out.extract) produced.add(e.var);
      return { name: req.name, ...out, unresolved: missing.filter(n => !DYNAMIC[n]) };
    }).filter(Boolean);
  };
  const exportScenarioFile = (id) => {
    const f = ciFile('scenario', id, { tree, scenarios: loadScenarios() });
    if (!f) return;
    downloadText(f.fileName, f.text);
    const notes = [];
    if (f.skipped.length) notes.push(`left out ${f.skipped.length} step(s) whose request was deleted`);
    if (f.vars.length) notes.push(`give ${f.vars.map(v => `{{${v}}}`).join(', ')} with --env-file or --var`);
    notify(`Exported "${f.name}"${notes.length ? `: ${notes.join('; ')}` : ''}. Run it with: npx hitapi-cli run ${f.fileName}`, f.skipped.length ? 'info' : 'success');
  };

  /** "Use in CI" / "Publish to GitHub": the file is made once, when the dialog opens. */
  const openCi = (type, kind, id) => {
    const file = ciFile(kind, id, { tree: loadTree(), scenarios: loadScenarios() });
    if (!file) { notify('Only a whole collection or a scenario can be used in CI.', 'info'); return; }
    setCdlg({ type, kind, id, file });
  };

  /** Add what the Import dialog converted. Returns an error message, or null. */
  const applyImport = (r, { into }) => {
    const done = [];
    if (r.collections.length || r.request) {
      let target = null;
      const ok = edit((t) => {
        t.items.push(...r.collections);
        if (r.request) {
          let p = into && find(t, into)?.node;
          if (!p) { p = t.items.find(c => c.name === 'Imported requests') || newCollection('Imported requests'); if (!t.items.includes(p)) t.items.push(p); }
          p.children.push(r.request);
          target = p;
        }
        return true;
      });
      if (ok !== true) return 'Nothing was imported (see the message).';
      if (r.collections.length) done.push(r.collections.length === 1 ? `"${r.collections[0].name}"` : `${r.collections.length} collections`);
      if (r.request) { done.push(`"${r.request.name}" into "${target.name}"`); }
    }
    if (r.envs.length || r.globals.length) {
      try {
        setEnvs(updateEnvs((st) => {
          for (const e of r.envs) {
            let name = e.name; let i = 2;
            while (st.envs.some(x => x.name.toLowerCase() === name.toLowerCase())) name = `${e.name} (${i++})`;
            st.envs.push({ id: newEnvId(), name, vars: e.vars });
          }
          for (const v of r.globals) st.globals = setVar(st.globals, v.key, v.value, { secret: v.secret });
        }));
      } catch (e) { return e.message; }
      if (r.envs.length) done.push(`${r.envs.length} environment${r.envs.length === 1 ? '' : 's'}`);
      if (r.globals.length) done.push(`${r.globals.length} global variable${r.globals.length === 1 ? '' : 's'}`);
    }
    if (r.scenarios.length) {
      if (editScen((st) => { st.items.push(...r.scenarios); return true; }) !== true) return 'The scenario wasn\'t imported (see the message).';
      done.push(`scenario "${r.scenarios[0].name}"`);
    }
    if (r.request) { if (confirmLeave()) { loadInto(structuredClone(r.request.draft), null, { link: r.request.id }); setShowRunner(false); closeScenario(); } }
    else if (r.scenarios.length && !r.collections.length) openScenario(r.scenarios[0].id);
    if (r.collections.length || r.request) { showSide('collections'); setExpandIds({ ids: r.collections.map(x => x.id) }); }
    notify(`Imported ${done.join(', ')}`, 'success');
    return null;
  };

  const importCurl = useCallback((text) => {
    let parsed;
    try { parsed = parseCurl(text); } catch (e) { return `Couldn't read that cURL command: ${e.message}`; }
    if (!confirmLeave()) return null;
    const { rows: headers, skipped } = importHeaders(parsed.headers.map(h => [h.key, h.value]));
    const n = [...(parsed.warnings || [])];
    if (skipped.length) n.push(`Skipped ${skipped.length} header${skipped.length === 1 ? '' : 's'} the browser sets itself (${skipped.slice(0, 3).join(', ')}${skipped.length > 3 ? ', …' : ''}).`);
    if (headers.some(h => !h.enabled)) n.push('User-Agent, Origin and Referer were imported switched off; switch them on if the API checks them.');
    const auth = emptyAuth();
    if (parsed.auth?.type === 'basic' && !headers.some(h => h.key.toLowerCase() === 'authorization')) { auth.type = 'basic'; auth.basic = { username: parsed.auth.username, password: parsed.auth.password }; n.push('-u user:… was put in the Auth tab as Basic auth.'); }
    const ct = headers.find(h => h.enabled && h.key.toLowerCase() === 'content-type')?.value || '';
    const { bodyType, bodies } = detectBody(parsed.body || '', ct);
    loadInto({ ...emptyDraft(), method: parsed.method, url: parsed.url, params: paramsFromUrl(parsed.url), headers, bodyType, bodies, auth, settings: draft.settings }, 'Imported from cURL. Check it, then Send.');
    setNotes(n); setDialog(null);
    return null;
  }, [draft.settings, loadInto, confirmLeave]);

  const openEnvs = useCallback((select, addName) => setEnvDlg({ select, addName }), []);

  const doSend = useCallback(async (force) => {
    if (sending) return;
    setShowRunner(false);
    if (!draft.url.trim()) { setRes({ error: 'Enter a URL first.', kind: 'invalid', warnings: [] }); return; }
    const { resolved, missing, secrets } = resolveWith(effective, scope);
    if (missing.length && force !== true) {
      const inUrl = missing.some(n => varsIn(effective.url).includes(n));
      setProblem({
        text: `Not defined${activeEnv ? ` in "${activeEnv.name}"` : ''}: ${missing.map(n => `{{${n}}}`).join(', ')}. Add ${missing.length === 1 ? 'it' : 'them'} to an environment, the collection or Globals.`,
        action: inUrl ? { label: 'Add variables', fn: () => openEnvs(undefined, missing[0]) } : { label: 'Send anyway', fn: () => doSendRef.current(true) },
      });
      return;
    }
    setProblem(null);
    if (urlIsPath(resolved.url)) {
      setRes({ error: linked ? `"${linked.ancestors[0].name}" has no base URL, so "${draft.url.trim()}" can't be sent. Add one in the collection's settings, or type a full URL.` : 'Enter a full URL (https://…). A URL starting with "/" works for requests saved in a collection with a base URL.', kind: 'invalid', warnings: [] });
      return;
    }
    if (mode === 'extension' && !(ext.installed && ext.allowed && !ext.outdated)) {
      setRes({ error: !ext.installed ? 'The HitAPI extension isn\'t installed in this browser.' : ext.outdated ? 'Your HitAPI extension is too old. Update it to 2.1 or newer.' : 'Connect the HitAPI extension first (button above).', kind: 'not_allowed', warnings: [] });
      return;
    }
    const c = new AbortController(); ctrl.current = c;
    const limit = mode === 'cloud' ? Math.min(15, draft.settings.timeoutSec) + 2 : draft.settings.timeoutSec;
    const t = setTimeout(() => c.abort('timeout'), limit * 1000);
    setSending(true); setRes(null);
    try {
      const rules = structuredClone(draft.extract || []);
      const r = await send(resolved, { mode, files, signal: c.signal, id: `${Date.now()}` });
      if (r.kind !== 'cancel') { const results = checkWith(draft.tests, r, scope); if (results) r.tests = results; }
      setRes(r);
      if (r.kind !== 'cancel' && rules.some(x => x.enabled !== false && String(x.name || '').trim())) {
        const results = applyExtract(rules, r);
        setExtractResults(results);
        const ok = results.filter(x => x.ok).map(x => x.name);
        const bad = results.filter(x => !x.ok);
        if (bad.length) notify(`Couldn't set ${bad.map(x => `${x.name} (${x.reason})`).join(', ')}`, 'error');
        else if (ok.length) notify(`Set ${ok.join(', ')} in ${targetOf(loadEnvs()).replace(/ \(.*\)$/, '')}`, 'success');
      }
      addEntry(effective, r, { resolved, redact: secrets }).then((m) => setActiveHistoryId(m?.id || null)).catch(() => {});
    } finally { clearTimeout(t); ctrl.current = null; setSending(false); }
  }, [draft, effective, scope, activeEnv, linked, files, mode, ext, sending, notify, openEnvs]);
  /** "test" on a value in the JSON response → a check for it in the Tests tab. */
  const addTestFromResponse = useCallback((p, value) => {
    const isObj = value !== null && typeof value === 'object';
    const t = isObj ? newTest('json', { path: p, op: 'type_is', expected: Array.isArray(value) ? 'array' : 'object' })
      : newTest('json', { path: p, op: 'equals', expected: typeof value === 'string' ? value : JSON.stringify(value) });
    update({ tests: [...(draft.tests || []), t] });
    setTab('tests');
    notify(`Added a test: ${p} ${isObj ? `is an ${t.expected}` : `equals ${t.expected}`}`, 'success');
  }, [draft.tests, update, notify]);
  const suggestFromLast = useCallback(() => (res && !res.error ? suggestTests(res) : null), [res]);
  const doSendRef = useRef(doSend);
  doSendRef.current = doSend;

  const cancel = () => ctrl.current?.abort('cancel');

  useEffect(() => {
    const onKey = (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'Enter' && !dialog && !cdlg && !openScen && !envDlg) { e.preventDefault(); doSend(); }
      else if ((e.ctrlKey || e.metaKey) && !e.altKey && e.key.toLowerCase() === 's') {
        e.preventDefault();
        if (dialog || cdlg || openScen || envDlg) return;
        if (e.shiftKey) setCdlg({ type: 'saveAs' }); else save();
      } else if (e.key === 'Escape' && sending) cancel();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [doSend, save, sending, dialog, cdlg, openScen, envDlg]);

  const onUrlPaste = (e) => {
    const text = e.clipboardData?.getData('text') || '';
    if (looksLikeCurl(text)) { e.preventDefault(); const err = importCurl(text); if (err) notify(err, 'error'); }
  };

  // Open a request from History: the stored request (secrets put back from the current one where possible) and its response
  const openFromHistory = useCallback(async (meta) => {
    const entry = await getEntry(meta.id);
    if (!entry) { notify('That request is no longer in history.', 'error'); return; }
    if (!confirmLeave()) return;
    setShowRunner(false);
    const { draft: restored, missing } = restoreSecrets(entry.draft, entry.masked, draft);
    loadInto({ ...restored, settings: { ...draft.settings, ...(restored.settings || {}) } });
    setActiveHistoryId(meta.id);
    setRes({ ...entry.response, fromHistory: { at: meta.at, missing } });
  }, [draft, loadInto, notify, confirmLeave]);

  const connect = async () => {
    setConnecting(true);
    const ok = await connectExtension();
    setConnecting(false);
    setExt(await pingExtension());
    notify(ok ? 'The HitAPI extension is connected.' : 'Not connected. You can try again any time.', ok ? 'success' : 'info');
  };

  // Code and Copy as cURL: the request as it will be sent, variables filled in
  const final = useMemo(() => { if (dialog !== 'code') return null; const d = resolveDraft(effective, scope).draft; return finalRequest(d, files, d.auth.type === 'oauth2' ? cachedToken(d.auth.oauth2) : null); }, [dialog, effective, scope, files]);
  const copyCurl = () => {
    const d = resolveDraft(effective, scope).draft;
    const { curl } = finalRequest(d, files, d.auth.type === 'oauth2' ? cachedToken(d.auth.oauth2) : null);
    navigator.clipboard?.writeText(curl).then(() => notify('Copied as cURL', 'success'), () => notify('Copy failed', 'error'));
  };

  const methodClass = `method-${String(draft.method).toUpperCase()}`;
  const sideTabs = (
    <div className="wbw-sidetabs" role="tablist" aria-label="Sidebar">
      <button type="button" role="tab" aria-selected={side === 'collections'} className={`wbw-sidetab${side === 'collections' ? ' on' : ''}`} onClick={() => showSide('collections')}>Collections</button>
      <button type="button" role="tab" aria-selected={side === 'scenarios'} className={`wbw-sidetab${side === 'scenarios' ? ' on' : ''}`} onClick={() => showSide('scenarios')}>Scenarios</button>
      <button type="button" role="tab" aria-selected={side === 'history'} className={`wbw-sidetab${side === 'history' ? ' on' : ''}`} onClick={() => showSide('history')}>History</button>
    </div>
  );
  const envSelect = (
        <select className={`input wbw-env${envs.active ? ' on' : ''}`} aria-label="Environment" value={envs.active}
          title={activeEnv ? `Environment: ${activeEnv.name}` : 'No environment: {{variables}} come from the collection and Globals'}
          onChange={(e) => { const v = e.target.value; if (v === '__manage__') openEnvs(); else { try { setActiveEnv(v); } catch (err) { notify(err.message, 'error'); } } }}>
          <option value="">No environment</option>
          {envs.envs.map(e => <option key={e.id} value={e.id}>{e.name}</option>)}
          <option value="__manage__">{envs.envs.length ? 'Manage environments…' : '+ Add an environment…'}</option>
        </select>
  );
  const flowExtra = (<>
    {envSelect}
    {signedIn && scenEdit && <button type="button" className="btn btn-ghost btn-sm wbw-flow-sched" onClick={() => setCdlg({ type: 'schedule', target: { kind: 'scenario', id: scenEdit.id, name: scenEdit.name } })}>Schedule…</button>}
  </>);
  const scenEditorEl = openScen && scenEdit ? (
          <ScenarioEditor scenario={scenEdit} onChange={changeScenario} tree={tree} report={scenReports[scenEdit.id] || scenEdit.lastReport || scenState.items.find(x => x.id === scenEdit.id)?.lastReport || null}
            running={scenRunning === scenEdit.id} paused={scenRunning === scenEdit.id ? scenPaused : 0} envLabel={activeEnv?.name || 'none'} focusName={openScen.focusName}
            onRun={(only) => runScenarioNow(structuredClone(scenEdit), only)} onStop={() => scenRun.current?.controller.abort('cancel')} onBack={flowId ? () => leaveFlow() : closeScenario}
            onOpenStep={(step) => openStep(scenEdit.id, step)} onOpenResult={(r, step) => openScenarioResult(scenEdit.id, r, step)}
            currentRequest={() => (draft.url ? { draft: forSave(draft), name: linked?.node.name || requestName(draft), savedId: linked?.node.id || null } : null)}
            signedIn={signedIn} scopeFor={scopeForStep} onEditDrafts={editStepDrafts} notify={notify}
            prefs={flowPrefs} onSettings={() => setCdlg({ type: 'flowSettings' })} page={!!flowId} extra={flowId ? flowExtra : null} />
  ) : null;
  const dialogs = (<>
      {dialog === 'code' && final && <CodeDialog request={final} onClose={() => setDialog(null)} onNotify={(m) => notify(m, 'success')} />}
      {dialog === 'curl' && <CurlDialog onImport={importCurl} onClose={() => setDialog(null)} />}
      {cdlg?.type === 'schedule' && (
        <ScheduleDialog target={cdlg.target} signedIn={signedIn} syncOn={!!sync.enabled} onClose={() => setCdlg(null)}
          onOpenBackup={() => setCdlg({ type: 'backup' })}
          beforeSave={async () => { const r = await runSync({ force: true }); if (r && !r.ok && !r.skipped) throw new Error(`Couldn't save your Workbench to your account first: ${r.error}`); }}
          onSaved={(sch) => notify(`Scheduled "${sch.name}". See its runs on the Schedules page.`, 'success')} />
      )}
      {(cdlg?.type === 'ci' || cdlg?.type === 'github') && cdlg.file && (() => {
        const f = cdlg.file;
        return cdlg.type === 'ci'
          ? <CiDialog file={f} signedIn={signedIn} onNotify={(m) => notify(m, 'success')} onPublish={() => setCdlg({ ...cdlg, type: 'github' })} onClose={() => setCdlg(null)} />
          : <GitHubDialog itemKey={cdlg.id} file={f} onNotify={(m) => notify(m, 'success')} onClose={() => setCdlg(null)} />;
      })()}
      {cdlg?.type === 'backup' && (
        <BackupDialog signedIn={signedIn} sync={sync} onClose={() => setCdlg(null)} onNotify={(m) => notify(m, 'success')}
          onImported={() => { setTree(loadTree()); setEnvs(loadEnvs()); setScenState(loadScenarios()); }}
          onSyncToggle={(on) => { if (on) { saveSyncState({ enabled: true, userId: String(user.id ?? user.email ?? ''), lastError: '' }); runSync(); } else stopSync(); }}
          onSyncNow={() => runSync({ force: true })}
          onDeleteCloud={async () => { await stopSync({ deleteCloud: true }); notify('The account copy was deleted. This browser keeps its own copy.', 'info'); }} />
      )}
      {accountAsk?.kind === 'first' && (
        <Dialog title="Keep your Workbench in your account?" onClose={() => setAccountAsk(null)} footer={<>
          <span className="wbw-grow" />
          <button type="button" className="btn btn-ghost btn-sm wbw-acct-local" onClick={() => { saveSyncState({ enabled: false, userId: accountAsk.uid, kinds: {} }); setAccountAsk(null); notify('Kept in this browser only. Turn on "Keep my Workbench in my HitAPI account" in Backup and sync any time.', 'info'); }}>Keep them in this browser only</button>
          <button type="button" className="btn btn-ghost btn-sm text-red wbw-acct-discard" onClick={() => { if (!confirm('Delete the collections, environments and scenarios in this browser and use only the ones in your account?')) return; clearLocalData(); saveSyncState({ enabled: true, userId: accountAsk.uid, kinds: {}, lastError: '' }); setAccountAsk(null); runSync(); }}>Use only my account's</button>
          <button type="button" className="btn btn-primary btn-sm wbw-acct-merge" onClick={() => { saveSyncState({ enabled: true, userId: accountAsk.uid, kinds: {}, lastError: '' }); setAccountAsk(null); runSync(); }}>Add them to my account</button>
        </>}>
          <p className="text-sm">This browser has {[accountAsk.counts.collections && `${accountAsk.counts.collections} collection${accountAsk.counts.collections === 1 ? '' : 's'}`, accountAsk.counts.envs && `${accountAsk.counts.envs} environment${accountAsk.counts.envs === 1 ? '' : 's'}`, accountAsk.counts.scenarios && `${accountAsk.counts.scenarios} scenario${accountAsk.counts.scenarios === 1 ? '' : 's'}`].filter(Boolean).join(', ') || 'variables'} made before you signed in.</p>
          <p className="text-sm">Add them to your HitAPI account? Then they are on every computer you sign in on, and in the HitAPI extension (with sync on). Whatever is already in your account is kept too.</p>
          <p className="text-xs text-tertiary">Tokens, passwords and secret values stay in this browser; they are never saved to your account.</p>
        </Dialog>
      )}
      {accountAsk?.kind === 'signedOut' && (
        <Dialog title="You signed out" onClose={() => { saveSyncState({ enabled: false, userId: null, kinds: {} }); setAccountAsk(null); }} footer={<>
          <span className="wbw-grow" />
          <button type="button" className="btn btn-ghost btn-sm wbw-out-keep" onClick={() => { saveSyncState({ enabled: false, userId: null, kinds: {}, lastError: '' }); setAccountAsk(null); }}>Keep a copy in this browser</button>
          <button type="button" className="btn btn-primary btn-sm wbw-out-remove" onClick={() => { clearLocalData(); saveSyncState({ enabled: false, userId: null, kinds: {}, lastError: '', lastSyncAt: 0, lastResult: null }); setAccountAsk(null); notify('Your account\'s Workbench was removed from this browser. It is still in your account.', 'info'); }}>Remove it from this browser</button>
        </>}>
          <p className="text-sm">This browser still has the collections, environments and scenarios from your HitAPI account (and the tokens and passwords you typed here).</p>
          <p className="text-sm">On a shared computer, remove them. They stay in your account: sign in again to get them back (tokens and passwords need filling in again).</p>
        </Dialog>
      )}
      {cdlg?.type === 'import' && <ImportDialog tree={tree} onImport={applyImport} onFromProject={() => setCdlg({ type: 'pull' })} onClose={() => setCdlg(null)} />}
      {cdlg?.type === 'flowPush' && scenState.items.find(x => x.id === cdlg.id) && (
        <FlowPushDialog scenario={scenState.items.find(x => x.id === cdlg.id)} signedIn={signedIn} onClose={() => setCdlg(null)}
          steps={() => flowSteps(scenState.items.find(x => x.id === cdlg.id))}
          onLinked={(projectId, suiteId) => editScen((st) => { const x = st.items.find(i => i.id === cdlg.id); if (!x) return false; x.hitapi = { projectId, suiteId }; return true; })} />
      )}
      {cdlg?.type === 'flowPull' && (
        <FlowPullDialog signedIn={signedIn} onClose={() => setCdlg(null)} onImport={(project, suite, steps) => {
          const sc = fromFlowSuite(suite, steps, project, emptyDraft);
          if (editScen((st) => { st.items.push(sc); return true; }) === true) { openScenario(sc.id); notify(`Imported "${sc.name}" (${sc.steps.length} steps)`, 'success'); }
        }} />
      )}
      {(cdlg?.type === 'save' || cdlg?.type === 'saveAs') && (
        <SaveDialog tree={tree} title={linked && cdlg.type === 'saveAs' ? 'Save as a new request' : 'Save request'}
          defaultName={linked && cdlg.type === 'saveAs' ? `${linked.node.name} copy` : linked ? linked.node.name : requestName(draft)}
          defaultParentId={linked?.parent?.id || (lastParentId.current && find(tree, lastParentId.current) ? lastParentId.current : tree.items[0]?.id)}
          onSave={saveNew} onClose={() => setCdlg(null)} />
      )}
      {envDlg && (
        <EnvDialog state={envs} select={envDlg.select} addName={envDlg.addName} onClose={() => setEnvDlg(null)}
          onSave={(work, active) => {
            try { updateEnvs((st) => { st.globals = work.globals; st.envs = work.envs; }); setEnvs(setActiveEnv(active)); }
            catch (e) { return e.message; }
            setEnvDlg(null); notify('Environments saved', 'success'); return null;
          }} />
      )}
      {cdlg?.type === 'settings' && (
        <SettingsDialog tree={tree} id={cdlg.id} mode={mode} onClose={() => setCdlg(null)}
          onSave={({ name, settings }) => { if (edit(t => { const x = find(t, cdlg.id); if (!x) return false; x.node.name = name; x.node.settings = settings; return true; }) === true) { setCdlg(null); notify('Settings saved', 'success'); } }} />
      )}
      {cdlg?.type === 'move' && (
        <MoveDialog tree={tree} id={cdlg.id} onClose={() => setCdlg(null)}
          onMove={(target) => { if (edit(t => (move(t, cdlg.id, target, 'inside') ? true : false)) === true) { setCdlg(null); notify(`Moved to "${find(loadTree(), target)?.node.name || 'the folder'}"`, 'success'); } }} />
      )}
      {cdlg?.type === 'export' && find(tree, cdlg.id) && <ExportDialog node={find(tree, cdlg.id).node} onClose={() => setCdlg(null)} onNotify={(m) => notify(m, 'success')} />}
      {cdlg?.type === 'push' && find(tree, cdlg.id) && (
        <PushDialog collection={find(tree, cdlg.id).node} signedIn={signedIn} onClose={() => setCdlg(null)}
          endpoints={(base) => toEndpoints(tree, cdlg.id, base)}
          onLinked={(pid) => edit(t => { const x = find(t, cdlg.id); if (!x) return false; x.node.hitapiProjectId = pid; return true; })} />
      )}
      {cdlg?.type === 'pull' && (
        <PullDialog signedIn={signedIn} onClose={() => setCdlg(null)}
          onImport={(project, eps) => { const c = fromProject(project, eps); if (edit(t => { t.items.push(c); return true; }) === true) { showSide('collections'); notify(`Imported "${c.name}" (${eps.length} endpoint${eps.length === 1 ? '' : 's'})`, 'success'); } }} />
      )}
      {cdlg?.type === 'flowSettings' && flowPrefs && <FlowSettingsDialog prefs={flowPrefs} onChange={(p) => setFlowPrefs(saveFlowPrefs(p))} onClose={() => setCdlg(null)} />}
  </>);
  // W10: a flow's own page — just the flow, the whole window
  if (flowId) {
    return (
      <div className={`wbw wbw-${variant} wbw-flowpage`} data-ready={ready ? '1' : '0'}>
        {flowMissing ? (
          <div className="card wbw-flowmissing" role="alert">
            <h2>This flow isn't here</h2>
            <p className="text-sm text-tertiary">It may have been deleted, or it was made in another browser.{signedIn ? ' Turn on "Keep my Workbench in my account" (Backup and sync) to have your flows on every device.' : ''}</p>
            <button type="button" className="btn btn-primary btn-sm" onClick={() => navigate(base)}>Open the Workbench</button>
          </div>
        ) : scenEditorEl ? <>
          <ModePicker mode={mode} setMode={chooseMode} ext={ext} onConnect={connect} connecting={connecting} auto={false} />
          {scenEditorEl}
        </> : <p className="text-sm text-tertiary">Loading the flow…</p>}
        {dialogs}
      </div>
    );
  }
  return (
    <div className={`wbw wbw-${variant}`} data-ready={ready ? '1' : '0'}>
      <div className="wbw-toolbar">
        <button type="button" className="btn btn-ghost btn-sm" onClick={() => setDialog('curl')}><Terminal size={13} /> Import cURL</button>
        <button type="button" className="btn btn-ghost btn-sm" onClick={copyCurl} disabled={!draft.url.trim()}><Copy size={13} /> Copy as cURL</button>
        <button type="button" className="btn btn-ghost btn-sm" onClick={() => setDialog('code')} disabled={!draft.url.trim()}><Code2 size={13} /> Code</button>
        <button type="button" className="btn btn-ghost btn-sm" onClick={() => { if (linked ? confirmLeave() : (!draft.url || confirm('Start a new request? The current one is cleared.'))) { loadInto(emptyDraft()); setNotes([]); setShowRunner(false); } }}><FilePlus2 size={13} /> New request</button>
        <button type="button" className="btn btn-ghost btn-sm wbw-save-btn" onClick={save} title="Save (Ctrl/⌘ + S)"><Save size={13} /> Save</button>
        <span className="wbw-grow" />
        <button type="button" className={`btn btn-ghost btn-sm wbw-backup-btn${user && sync.enabled && (sync.lastError || sync.offline) ? ' warn' : ''}`} onClick={() => setCdlg({ type: 'backup' })}
          title={user ? (sync.enabled ? `Your Workbench is kept in your HitAPI account${sync.lastSyncAt ? ` (last saved ${ago(sync.lastSyncAt)})` : ''}. Click for backup and sync.` : 'Kept in this browser only. Click to keep it in your account.') : 'Backup: export or import everything'}>
          {user ? (sync.enabled && !sync.offline && !sync.lastError ? <Cloud size={13} /> : <CloudOff size={13} />) : <HardDrive size={13} />} {user ? syncLabel : 'Backup'}
        </button>
        {envSelect}
        <button type="button" className="btn btn-ghost btn-sm wbw-collections-btn" aria-expanded={side === 'collections'} onClick={() => toggleSide('collections')}><Library size={13} /> Collections</button>
        <button type="button" className="btn btn-ghost btn-sm wbw-scenarios-btn" aria-expanded={side === 'scenarios'} onClick={() => toggleSide('scenarios')}><Workflow size={13} /> Scenarios</button>
        <button type="button" className="btn btn-ghost btn-sm wbw-history-btn" aria-expanded={side === 'history'} onClick={() => toggleSide('history')}><History size={13} /> History{historyCount ? ` (${historyCount})` : ''}</button>
      </div>
      {variant === 'public' && (
        <div className="wbw-samples">
          <span className="text-xs text-tertiary">Try:</span>
          {SAMPLES.map(s => (
            <button key={s.label} type="button" className="btn btn-ghost btn-sm" onClick={() => confirmLeave() && loadInto({ ...emptyDraft(), method: s.method, url: s.url, params: paramsFromUrl(s.url), bodyType: s.json ? 'json' : 'none', bodies: { ...emptyDraft().bodies, json: s.json || '' } })}>
              <span className={`method-badge method-${s.method}`}>{s.method}</span> {s.label}
            </button>
          ))}
        </div>
      )}

      {!openScen && <>
      {stepLink && !linked && (() => {
        const sc = scenState.items.find(x => x.id === stepLink.scenarioId);
        const idx = sc ? sc.steps.findIndex(x => x.id === stepLink.stepId) : -1;
        return (
          <div className="wbw-linkbar wbw-stepbar" aria-label="Scenario step">
            <span className="wbw-crumbs">{idx >= 0 ? <>Step {idx + 1} of the scenario <strong>"{sc.name}"</strong> <span className="text-tertiary">(a copy kept in the scenario)</span></> : 'This step is no longer in its scenario.'}</span>
            <span className="wbw-grow" />
            {idx >= 0 && <button type="button" className="btn btn-primary btn-sm wbw-step-save" onClick={saveToStep} title="Save your changes to the step (Ctrl/⌘ + S)">Save to step</button>}
            {sc && <button type="button" className="btn btn-ghost btn-sm wbw-step-back" onClick={() => openScenario(sc.id)}><ArrowLeft size={12} /> Back to the scenario</button>}
          </div>
        );
      })()}
      {linked && (
        <div className="wbw-linkbar" aria-label="Saved request">
          <span className="wbw-crumbs">
            {breadcrumb(linked).map((name, i, all) => <span key={i}>{i ? <span className="text-tertiary"> / </span> : null}{i === all.length - 1 ? <strong className="wbw-crumb-name">{name}</strong> : <span className="text-tertiary">{name}</span>}</span>)}
          </span>
          {dirty ? <span className="wbw-dirty" title="Changed since it was saved">● edited</span> : <span className="wbw-saved text-xs text-tertiary">✓ saved</span>}
          <span className="wbw-grow" />
          <button type="button" className={`btn btn-sm ${dirty ? 'btn-primary' : 'btn-ghost'} wbw-link-save`} disabled={!dirty} onClick={save} title="Save changes (Ctrl/⌘ + S)">Save</button>
          <button type="button" className="btn btn-ghost btn-sm wbw-link-saveas" onClick={() => setCdlg({ type: 'saveAs' })} title="Save a copy (Ctrl/⌘ + Shift + S)">Save as…</button>
          <button type="button" className="btn btn-ghost btn-sm wbw-link-detach" onClick={detach} title="Stop editing the saved request; keep this as an unsaved request"><Unlink size={12} /> Detach</button>
        </div>
      )}
      <div className="wbw-bar">
        <input className={`input font-mono wbw-method ${methodClass}`} list="wbw-methods" aria-label="HTTP method" value={draft.method} spellCheck={false}
          onChange={(e) => update({ method: e.target.value.toUpperCase().replace(/\s/g, '') })} onFocus={(e) => e.target.select()} />
        <datalist id="wbw-methods">{METHODS.map(m => <option key={m} value={m} />)}</datalist>
        <input className="input font-mono wbw-url" aria-label="Request URL" placeholder="https://api.example.com/v1/users — or paste a cURL command" spellCheck={false}
          value={draft.url} onChange={(e) => update({ url: e.target.value })} onPaste={onUrlPaste}
          onBlur={() => { const u = draft.url.trim(); if (u && !/^[a-z][\w+.-]*:\/\//i.test(u) && !u.startsWith('/') && !u.startsWith('{{')) update({ url: normalizeUrl(draft.url) }); }} />
        {sending ? <button type="button" className="btn btn-danger wbw-send" onClick={cancel}><Square size={13} /> Cancel</button>
          : <button type="button" className="btn btn-primary wbw-send" onClick={doSend} title="Send (Ctrl/⌘ + Enter)"><Send size={14} /> Send</button>}
      </div>
      {problem && (
        <div className="wbw-problem" role="alert">
          <span>{problem.text}</span>
          {problem.action && <button type="button" className="btn btn-ghost btn-sm wbw-problem-act" onClick={() => { const a = problem.action; setProblem(null); a.fn(); }}>{problem.action.label}</button>}
        </div>
      )}
      {linked && urlIsPath(draft.url) && !baseUrlOf(linked.ancestors) && <div className="wbw-resolved text-xs text-amber">"{linked.ancestors[0].name}" has no base URL, so "{draft.url.trim()}" can't be sent. Add one in the collection's settings, or type a full URL.</div>}
      {preview.trim() && preview !== draft.url.trim() && !(linked && urlIsPath(draft.url) && !baseUrlOf(linked.ancestors)) && <div className="wbw-resolved text-xs text-tertiary font-mono" title="The URL as it will be sent">→ {preview}</div>}
      {used.length > 0 && (
        <div className="wbw-vars" aria-label="Variables in this request">
          {used.map(v => {
            const title = v.missing ? `Not defined${activeEnv ? ` in "${activeEnv.name}"` : ''}, the collection or Globals. Click to add it.`
              : v.dynamic ? `${v.about}. A new value every time.` : `From ${v.scope === 'environment' ? `the "${v.from}" environment` : v.scope === 'globals' ? 'Globals' : `"${v.from}" (${v.scope})`}. Click to edit.`;
            const click = () => {
              if (v.dynamic) return;
              if (v.missing) openEnvs(undefined, v.name);
              else if (v.scope === 'globals') openEnvs('globals');
              else if (v.scope === 'environment') openEnvs(envs.active);
              else { const a = linked?.ancestors.find(x => x.name === v.from && x.type === v.scope); if (a) setCdlg({ type: 'settings', id: a.id }); }
            };
            return (
              <button key={v.name} type="button" className={`wbw-var${v.missing ? ' missing' : ''}${v.dynamic ? ' dynamic' : ''}`} title={title} onClick={click}>
                <span className="font-mono">{`{{${v.name}}}`}</span>
                <span className="wbw-var-val">{v.missing ? 'not defined' : v.dynamic ? 'new each send' : (shown(v) || '(empty)')}</span>
              </button>
            );
          })}
        </div>
      )}
      </>}
      <ModePicker mode={mode} setMode={chooseMode} ext={ext} onConnect={connect} connecting={connecting} auto={!modeChoice && !!draft.url.trim() && isLocalUrl(realUrl)} />

      {notes.length > 0 && (
        <div className="wbw-note wbw-notes">
          <div>{notes.map((n, i) => <div key={i}>{n}</div>)}</div>
          <button type="button" className="btn btn-ghost btn-icon" aria-label="Dismiss" onClick={() => setNotes([])}><X size={12} /></button>
        </div>
      )}

      <div className={`wbw-main${side ? ' with-side' : ''}`}>
        {side === 'history' && <HistoryPanel activeId={activeHistoryId} onOpen={openFromHistory} onClose={() => showSide(null)} onCount={setHistoryCount} tabs={sideTabs} />}
        {side === 'collections' && (
          <CollectionsPanel tree={tree} activeId={linkId} edit={edit} notify={notify} signedIn={signedIn} tabs={sideTabs} renameId={renameId} onRenamed={() => setRenameId(null)} expand={expandIds}
            onSchedule={(id) => { const f = find(tree, id); if (f) setCdlg({ type: 'schedule', target: { kind: f.node.type, id, name: f.node.name } }); }}
            onCi={(id) => openCi('ci', 'collection', id)} onGitHub={(id) => openCi('github', 'collection', id)}
            onClose={() => showSide(null)} onOpen={openSaved} onNewRequest={newRequestIn} onRun={runNode} onSaveCurrent={save}
            onSettings={(id) => setCdlg({ type: 'settings', id })} onExport={(id) => setCdlg({ type: 'export', id })} onPush={(id) => setCdlg({ type: 'push', id })}
            onMove={(id) => setCdlg({ type: 'move', id })} onImport={() => setCdlg({ type: 'import' })} onPull={() => setCdlg({ type: 'pull' })} />
        )}
        {side === 'scenarios' && (
          <ScenariosPanel state={scenState} activeId={openScen?.id || null} runningId={scenRunning} signedIn={signedIn} tabs={sideTabs} onClose={() => showSide(null)}
            onNew={newScenarioNow} onOpen={(id) => openScenario(id)} onRename={(id) => openScenario(id, { focusName: true })}
            onRun={(id) => { if (openScenario(id, { run: true }) !== 'here') return; const sc = loadScenarios().items.find(x => x.id === id); if (sc) runScenarioNow(sc, null); }}
            onDuplicate={(id) => { const sc = scenState.items.find(x => x.id === id); if (!sc) return; const c = cloneScenario(sc); if (editScen((st) => { const i = st.items.findIndex(x => x.id === id); st.items.splice(i + 1, 0, c); return true; }) === true) notify(`Duplicated as "${c.name}"`, 'success'); }}
            onExportCli={exportScenarioFile} onPush={(id) => { const sc = scenState.items.find(x => x.id === id); if (!sc?.steps.some(x => x.enabled)) { notify('Add a step first.', 'info'); return; } setCdlg({ type: 'flowPush', id }); }}
            onPull={() => setCdlg({ type: 'flowPull' })}
            onSchedule={(id) => { const sc = scenState.items.find(x => x.id === id); if (sc) setCdlg({ type: 'schedule', target: { kind: 'scenario', id, name: sc.name } }); }}
            onCi={(id) => openCi('ci', 'scenario', id)} onGitHub={(id) => openCi('github', 'scenario', id)}
            onDelete={(id) => { const sc = scenState.items.find(x => x.id === id); if (!sc || !confirm(`Delete the scenario "${sc.name}"? This can't be undone.`)) return; if (editScen((st) => { st.items = st.items.filter(x => x.id !== id); return true; }) === true) { if (openScen?.id === id) closeScenario(); notify('Deleted', 'info'); } }} />
        )}
        {scenEditorEl || <>
        <section className="card wbw-req" aria-label="Request">
          <RequestTabs draft={draft} update={update} files={files} setFiles={setFiles} mode={mode} tab={tab} setTab={setTab} inherit={inherit} extract={{ target: targetOf(envs), results: extractResults }} onSuggestTests={suggestFromLast} />
        </section>
        <section className="card wbw-resp" aria-label="Response" aria-live="polite">
          {run && <Runner key={run.key} runKey={run.key} title={run.title} items={run.items} runOne={runOne} hidden={!showRunner} onOpen={openRunResult} onClose={() => { setRun(null); setShowRunner(false); }} />}
          {!(run && showRunner) && <ResponseView res={res} onAddTest={res && !res.error ? addTestFromResponse : null} sending={sending} onNotify={(m) => notify(m, 'success')} onSwitchMode={(m) => { chooseMode(m); setRes(null); }}
            banner={res?.fromRun ? (
              <div className="wbw-histnote" role="status">
                <span>Response from the run of "{res.fromRun.title}"</span>
                {run && <button type="button" className="btn btn-ghost btn-sm wbw-backtorun" onClick={() => setShowRunner(true)}>← Back to the run results</button>}
              </div>
            ) : res?.fromHistory ? (
              <div className="wbw-histnote" role="status">
                <span>From history · {dayLabel(res.fromHistory.at)} {new Date(res.fromHistory.at).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })}
                  {res.fromHistory.missing?.length ? <> · <span className="text-amber">fill in again: {res.fromHistory.missing.join(', ')}</span></> : null}</span>
                <button type="button" className="btn btn-primary btn-sm" onClick={doSend}><RotateCcw size={12} /> Resend</button>
              </div>
            ) : res?.fromScenario ? (
              <div className="wbw-histnote" role="status">
                <span>Response from the run of "{res.fromScenario.name}"</span>
                <button type="button" className="btn btn-ghost btn-sm wbw-backtoscen" onClick={() => openScenario(res.fromScenario.id)}>← Back to the scenario</button>
              </div>
            ) : null} />}
        </section>
        </>}
      </div>

      {dialogs}
    </div>
  );
}
