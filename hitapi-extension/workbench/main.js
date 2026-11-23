/**
 * workbench/main.js — the Request Workbench page (roadmap feature 1).
 *
 * Opened in its own tab from the popup, the DevTools panel, the right-click
 * menu, or "Open in Workbench" on a captured request. Works without signing in.
 *
 *   state.js           the draft, saved to chrome.storage.local
 *   send.js            sends it (no CORS limits; protected headers via a rule)
 *   views/request-bar  method, URL, Send/Cancel
 *   views/request-tabs Params, Headers, Body, Settings
 *   views/response/    Pretty (JSON/XML trees), Raw, Preview, Headers, Cookies, Timing
 *   history-store.js   every send is kept (roadmap feature 5); views/history-sidebar shows it
 *   collections-store  saved requests in collections and folders (roadmap feature 6);
 *                      views/collections-pane, collection-dialogs, runner
 *   env-store.js       environments and global variables (roadmap feature 7); shared/vars.js resolves {{vars}}
 *   shared/assert.js   the Tests tab's checks (roadmap feature 8); views/tests-pane
 *   scenarios-store    scenarios (roadmap feature 9); views/scenarios-pane, scenario-editor, scenario-dialogs
 *   sync.js            backup & sync across devices (roadmap feature 11); views/backup-dialog
 */

import { h, mount, toast, copyText } from '../ui/core/dom.js';
import { DASHBOARD_URL } from '../shared/config.js';
import { splitUrl, buildUrl, paramsFromUrl, urlProblem, methodProblem, normalizeUrl, hasNoBody, importHeaders } from '../shared/http.js';
import { loadDraft, saveDraftSoon, onIncoming, emptyDraft, normalizeDraft, EMBED, shouldWelcome, dismissWelcome } from './state.js';
import { send } from './send.js';
import { parseCurl, toCurl, looksLikeCurl } from '../shared/curl.js';
import { detectBody, curlBodyArgs, AUTO_CONTENT_TYPE } from '../shared/body.js';
import { emptyAuth, authParts, addQuery } from '../shared/auth.js';
import { cachedToken } from './oauth.js';
import { openCurlDialog } from './views/curl-dialog.js';
import { createRequestBar } from './views/request-bar.js';
import { createRequestTabs } from './views/request-tabs.js';
import { createResponse } from './views/response/response.js';
import { createHistorySidebar } from './views/history-sidebar.js';
import { addEntry, getEntry, listIndex, onHistoryChange, sweepOrphans } from './history-store.js';
import { restoreSecrets, dayLabel } from '../shared/history.js';
import { loadTree, updateTree, onTreeChange } from './collections-store.js';
import { find, effectiveDraft, inheritedAuth, inheritedHeaders, baseUrlOf, isDirty, newRequest, newCollection, requestName, requestsIn,
  breadcrumb, importCollection, fromProject, toEndpoints, countRequests } from '../shared/collections.js';
import { authSummary } from '../shared/auth.js';
import { createCollectionsPane } from './views/collections-pane.js';
import { openSaveDialog, openSettingsDialog, openExportDialog, openPushDialog, openPullDialog } from './views/collection-dialogs.js';
import { createRunner } from './views/runner.js';
import { loadEnvs, updateEnvs, setActiveEnv, onEnvChange } from './env-store.js';
import { openEnvDialog } from './views/env-dialog.js';
import { buildScope, resolveDraft, resolveString, usedVars, runExtract, setVar, shown, varsIn, VAR_RE, DYNAMIC } from '../shared/vars.js';
import { runTests, suggestTests, newTest } from '../shared/assert.js';
import { loadScenarios, updateScenarios, onScenariosChange } from './scenarios-store.js';
import { newScenario, cloneScenario, parseData, runScenario, reportSummary, storableReport, toFlowStep, fromFlowSuite } from '../shared/scenarios.js';
import { createScenariosPane } from './views/scenarios-pane.js';
import { createScenarioEditor } from './views/scenario-editor.js';
import { openFlowPushDialog, openFlowPullDialog } from './views/scenario-dialogs.js';
import { openImportDialog } from './views/import-dialog.js';
import { openCodeDialog } from './views/code-dialog.js';
import { generate } from '../shared/convert/codegen.js';
import { newEnvId, setActiveEnv as setActiveEnvStore } from './env-store.js';
import { openBackupDialog } from './views/backup-dialog.js';
import { makeBackup, applyImport } from '../shared/backup.js';
import { loadSyncState, saveSyncState, syncNow, stopSync, onSyncStateChange } from './sync.js';
import { exportHistory, importHistory, clearAll as clearHistoryAll, getSettings as getHistorySettings, setSettings as setHistorySettings } from './history-store.js';
import { MSG as MSGS } from '../shared/messages.js';
import { call as bridgeCall } from '../ui/core/bridge.js';
import { runRequest, prepareRequest, checkWith, applyVars } from './run-core.js';
import { openScheduleDialog, openSchedulesOverview } from './views/schedule-dialog.js';
import { openGitHubDialog } from './views/github-dialog.js';
import { ciFile } from '../shared/ci.js';
import { download } from './views/collection-dialogs.js';

let draft = emptyDraft();
let controller = null;
let bar, tabs, response;
// Files picked for the body (form-data fields, binary). Never saved: chrome.storage can't hold files.
const files = { binary: null, form: new Map() };
let welcome = false;
let shortcut = '';

// Sidebar (Collections | History): open by default in a wide tab, closed in the DevTools panel. Remembered.
const HISTORY_KEY = EMBED ? 'hitapi:wbHistory:panel' : 'hitapi:wbHistory';
const SIDE_TAB_KEY = 'hitapi:wbSideTab';
let historyOpen = (() => { try { const v = localStorage.getItem(HISTORY_KEY); return v ? v === 'open' : (!EMBED && innerWidth >= 1200); } catch { return !EMBED; } })();
let sideTab = (() => { try { const v = localStorage.getItem(SIDE_TAB_KEY); return ['history', 'scenarios'].includes(v) ? v : 'collections'; } catch { return 'collections'; } })();
const history = createHistorySidebar({ onOpen: openFromHistory });
let historyBtn = null;

// ── Collections (roadmap feature 6) ──
let tree = { items: [] };
let lastParentId = null;          // where the last request was saved: the default next time
let runner = null;                // the collection runner, shown in place of the response
let showRunner = false;
let linkBar = null;

const collections = createCollectionsPane({
  onOpen: (id) => openSaved(id),
  onNewRequest: (id) => newRequestIn(id),
  onSettings: (id) => openSettingsDialog({ tree, id, onSave: ({ name, settings }) => editTree(t => { const x = find(t, id); if (!x) return false; x.node.name = name; x.node.settings = settings; }).then(() => toast('Settings saved', 'ok')) }),
  onRun: (id) => runNode(id),
  onSchedule: (id) => { const f = find(tree, id); if (f) openScheduleDialog({ target: { kind: f.node.type, id }, name: f.node.name, getEnvs: () => envState }); },
  onPublish: (id) => publishToGitHub({ kind: 'collection', id }),
  onExport: (id) => openExportDialog({ tree, id }),
  onPush: (id) => {
    const f = find(tree, id);
    if (f) openPushDialog({ collection: f.node, endpoints: (base) => toEndpoints(tree, id, base), onLinked: (pid) => editTree(t => { const x = find(t, id); if (x) x.node.hitapiProjectId = pid; }) });
  },
  onImport: () => importFile(),
  onPull: () => openPullDialog({ onImport: async (project, endpoints) => {
    const c = fromProject(project, endpoints);
    await editTree(t => { t.items.push(c); });
    collections.expand(c.id);
    toast(`Imported ${countRequests(c)} requests from "${project.name}"`, 'ok');
  } }),
  onSaveCurrent: () => save(),
});

// ── Scenarios (roadmap feature 9) ──
let scenState = { items: [] };
let openScenarioId = null;     // a scenario shown in place of the request
let lastScenarioId = null;     // for "← Back to scenario"
let scenarioEditor = null;
let scenRun = null;            // { controller, id }
const runReports = new Map();  // scenario id → last report of this session (with responses)
let scenSaveTimer = null;
let scenSelfWrite = 0;

const scenarios = createScenariosPane({
  onOpen: (id) => openScenario(id),
  onNew: async () => {
    const s = newScenario(uniqueScenarioName('New scenario'));
    scenState = (await updateScenarios((st) => { st.items.push(s); })).state;
    scenarios.setState(scenState);
    openScenario(s.id, { focusName: true });
  },
  onPull: () => openFlowPullDialog({ onImport: async (project, suite, steps) => {
    const s = fromFlowSuite(suite, steps, project, emptyDraft);
    scenState = (await updateScenarios((st) => { st.items.push(s); })).state;
    scenarios.setState(scenState);
    openScenario(s.id);
    toast(`Imported "${s.name}" (${s.steps.length} steps)`, 'ok');
  } }),
  onRun: (id) => { openScenario(id); const s = scenState.items.find(x => x.id === id); if (s) runScenarioNow(structuredClone(s), null); },
  onRename: (id) => openScenario(id, { focusName: true }),
  onDuplicate: async (id) => {
    const s = scenState.items.find(x => x.id === id);
    if (!s) return;
    const c = cloneScenario(s);
    await updateScenarios((st) => { const i = st.items.findIndex(x => x.id === id); st.items.splice(i + 1, 0, c); });
    toast(`Duplicated as "${c.name}"`, 'info');
  },
  onPush: (id) => pushScenario(id),
  onSchedule: (id) => { const s = scenState.items.find(x => x.id === id); if (s) openScheduleDialog({ target: { kind: 'scenario', id }, name: s.name, getEnvs: () => envState }); },
  onSchedules: () => openSchedulesOverview({ getData: () => ({ tree, scenarios: scenState }), getEnvs: () => envState }),
  onExportCli: (id) => exportScenarioFile(id),
  onPublish: (id) => publishToGitHub({ kind: 'scenario', id }),
  onDelete: async (id) => {
    const s = scenState.items.find(x => x.id === id);
    if (!s || !confirm(`Delete the scenario "${s.name}"? This can't be undone.`)) return;
    await updateScenarios((st) => { st.items = st.items.filter(x => x.id !== id); });
    if (openScenarioId === id) closeScenario();
    toast('Deleted', 'info');
  },
});

const uniqueScenarioName = (base) => {
  const names = new Set(scenState.items.map(s => s.name));
  if (!names.has(base)) return base;
  for (let i = 2; ; i++) if (!names.has(`${base} ${i}`)) return `${base} ${i}`;
};

function openScenario(id, { focusName = false } = {}) {
  const s = scenState.items.find(x => x.id === id);
  if (!s) return;
  if (scenarioEditor?.id !== id) {
    scenarioEditor = createScenarioEditor({
      scenario: structuredClone(s),
      getTree: () => tree,
      persist: persistScenario,
      onRun: (sc, only) => runScenarioNow(structuredClone(sc), only),
      onStop: () => scenRun?.controller.abort('cancel'),
      onSchedule: (sc) => openScheduleDialog({ target: { kind: 'scenario', id: sc.id }, name: sc.name, getEnvs: () => envState }),
      onBack: () => closeScenario(),
      onOpenStep: (step) => openStep(id, step),
      onOpenResult: (r, step) => openRunResult(id, r, step),
      currentRequest: () => (draft.url ? { draft: forSave(), name: linked()?.node.name || requestName(draft), savedId: linked()?.node.id || null } : null),
      envLabel: () => activeEnv()?.name || 'none',
    });
    const live = runReports.get(id);
    if (scenRun?.id === id && scenRun.report) scenarioEditor.showReport(scenRun.report, true);
    else if (live) scenarioEditor.showReport(live, false);
  }
  openScenarioId = id;
  lastScenarioId = id;
  scenarios.setActive(id);
  selectSideTab('scenarios');
  render();
  if (focusName) setTimeout(() => { const n = document.querySelector('.sc-name'); n?.focus(); n?.select(); }, 0);
}

function closeScenario() {
  openScenarioId = null;
  scenarios.setActive(null);
  render();
}

/** Save the open scenario shortly after an edit (typing in a delay box writes once). */
function persistScenario(s) {
  clearTimeout(scenSaveTimer);
  scenSaveTimer = setTimeout(async () => {
    scenSelfWrite = Date.now();
    await updateScenarios((st) => {
      const i = st.items.findIndex(x => x.id === s.id);
      if (i < 0) return false;
      st.items[i] = { ...structuredClone(s), lastReport: st.items[i].lastReport, hitapi: st.items[i].hitapi ?? s.hitapi };
    });
  }, 300);
}

/** One step of a run: the saved request (collection settings applied) or the step's own copy. */
async function runScenarioStep(step, { row, signal }) {
  let d; let ancestors = []; let name;
  if (step.kind === 'saved') {
    const f = find(tree, step.requestId);
    if (!f || f.node.type !== 'request') return { error: 'The saved request for this step was deleted.', kind: 'invalid', name: 'Deleted request' };
    d = f.node.draft; ancestors = f.ancestors; name = f.node.name;
  } else { d = step.draft; name = step.name || 'Request'; }
  return runRequest({ draft: d, ancestors, name, row, signal, getEnv: () => envState, setEnv: (st) => { envState = st; } });
}

async function runScenarioNow(s, only) {
  if (scenRun) { toast('A scenario is already running. Stop it first.', 'info'); return; }
  if (!s.steps.some(x => x.enabled)) { toast('Add a step first.', 'info'); return; }
  let rows;
  try { rows = parseData(s.data); } catch (e) { toast(`Data: ${e.message}`, 'error'); return; }
  scenRun = { controller: new AbortController(), id: s.id, report: null };
  const report = await runScenario({
    scenario: s, rows, only, runStep: runScenarioStep, signal: scenRun.controller.signal,
    onUpdate: (r) => { if (scenRun) scenRun.report = r; if (scenarioEditor?.id === s.id) scenarioEditor.showReport(r, true); },
  });
  scenRun = null;
  runReports.set(s.id, report);
  if (scenarioEditor?.id === s.id) scenarioEditor.showReport(report, false);
  await updateScenarios((st) => { const x = st.items.find(i => i.id === s.id); if (!x) return false; x.lastReport = storableReport(report); });
  const sm = reportSummary(report);
  toast(`${s.name}: ${sm.passed} passed, ${sm.failed} failed`, sm.failed ? 'error' : 'ok');
}

/** Open a step's request in the editor. A copied (inline) step can be saved back with "Save to step". */
function openStep(scenarioId, step) {
  if (step.kind === 'saved') {
    openScenarioId = null;
    if (!openSaved(step.requestId, { quiet: true })) { render(); return false; }
    render();
    return true;
  }
  const cur = linked();
  if (cur && isDirty(draft, cur.node.draft) && !confirm(`Discard your unsaved changes to "${cur.node.name}"?`)) return false;
  openScenarioId = null;
  collections.setActive(null);
  loadInto({ ...normalizeDraft(structuredClone(step.draft)), link: null, source: { kind: 'step', scenarioId, stepId: step.id } });
  return true;
}

function openRunResult(scenarioId, r, step) {
  if (!step || !openStep(scenarioId, step)) return;
  const s = scenState.items.find(x => x.id === scenarioId);
  if (r.response) {
    response.show(r.response, { banner: h('div', { class: 'wb-history-note small' }, `Response from the run of "${s?.name || 'the scenario'}". `,
      h('button', { type: 'button', class: 'link-btn', onclick: () => openScenario(scenarioId) }, '← Back to the scenario')) });
  }
}

async function saveToStep() {
  const { scenarioId, stepId } = draft.source || {};
  const d = forSave();
  const { out } = await updateScenarios((st) => {
    const step = st.items.find(x => x.id === scenarioId)?.steps.find(x => x.id === stepId);
    if (!step) return false;
    step.draft = d;
  });
  if (out === false) { toast('That step no longer exists.', 'error'); return; }
  if (scenarioEditor?.id === scenarioId) { const step = scenarioEditor.scenario.steps.find(x => x.id === stepId); if (step) step.draft = d; }
  toast('Saved to the scenario step', 'ok');
}

/** Scenario → flow suite steps: environment values filled in, except secrets and variables a step sets. */
function flowSteps(s) {
  const produced = new Set();
  return s.steps.filter(x => x.enabled).map((step) => {
    let d; let ancestors = []; let name;
    if (step.kind === 'saved') { const f = find(tree, step.requestId); if (!f) return null; d = f.node.draft; ancestors = f.ancestors; name = f.node.name; }
    else { d = step.draft; name = step.name; }
    const template = effectiveDraft(normalizeDraft(structuredClone(d)), ancestors);
    const scope = scopeFor(ancestors);
    for (const n of produced) scope.delete(n);
    for (const [k, v] of [...scope]) if (v.secret) scope.delete(k);
    const { draft: resolved, missing } = resolveDraft(template, scope);
    resolved.tests = template.tests; resolved.extract = template.extract;
    const out = toFlowStep(name, resolved);
    for (const e of out.extract) produced.add(e.var);
    return { name, ...out, unresolved: missing.filter(n => !DYNAMIC[n]) };
  }).filter(Boolean);
}

/** A scenario as one self-contained file for the hitapi CLI (CI). */
function exportScenarioFile(id) {
  const f = ciFile('scenario', id, { tree, scenarios: scenState });
  if (!f) return;
  download(f.fileName, f.text);
  const notes = [];
  if (f.skipped.length) notes.push(`left out ${f.skipped.length} step(s) whose request was deleted`);
  if (f.vars.length) notes.push(`give ${f.vars.map(v => `{{${v}}}`).join(', ')} with --env-file or --var`);
  toast(`Exported "${f.name}"${notes.length ? `: ${notes.join('; ')}` : ''}. Run it with: npx hitapi-cli run ${f.fileName}`, f.skipped.length ? 'info' : 'ok');
}

/** Publish a collection or scenario file (and a workflow) to a GitHub repository. */
function publishToGitHub({ kind, id }) {
  const f = ciFile(kind, id, { tree, scenarios: scenState });
  if (!f) { toast('Only a whole collection or a scenario can be published.', 'info'); return; }
  openGitHubDialog({ key: id, file: f });
}

function pushScenario(id) {
  const s = scenState.items.find(x => x.id === id);
  if (!s) return;
  if (!s.steps.some(x => x.enabled)) { toast('Add a step first.', 'info'); return; }
  openFlowPushDialog({
    scenario: s, steps: () => flowSteps(s),
    onLinked: (projectId, suiteId) => updateScenarios((st) => { const x = st.items.find(i => i.id === id); if (x) x.hitapi = { projectId, suiteId }; }),
  });
}

const sideTabBtns = {};
const SIDE_LABELS = { collections: 'Collections', scenarios: 'Scenarios', history: 'History' };
const sidebar = h('aside', { class: 'wb-history wb-sidebar', 'aria-label': 'Sidebar' },
  h('div', { class: 'sb-tabs', role: 'tablist' },
    ['collections', 'scenarios', 'history'].map(id => (sideTabBtns[id] = h('button', { type: 'button', role: 'tab', class: 'sb-tab', dataset: { tab: id }, onclick: () => selectSideTab(id) }))),
    h('span', { class: 'grow' }),
    h('button', { type: 'button', class: 'btn-ghost btn-sm', title: 'Hide the sidebar', 'aria-label': 'Hide the sidebar', onclick: () => toggleHistory(false) }, '«')),
  collections.el, scenarios.el, history.el);

function paintSideTabs() {
  const n = { collections: tree.items.reduce((k, c) => k + countRequests(c), 0), scenarios: scenState.items.length, history: history.count() };
  for (const [id, b] of Object.entries(sideTabBtns)) {
    mount(b, SIDE_LABELS[id], n[id] ? h('span', { class: 'wb-count' }, ` ${n[id]}`) : null);
    b.setAttribute('aria-selected', String(id === sideTab));
  }
  collections.el.hidden = sideTab !== 'collections';
  scenarios.el.hidden = sideTab !== 'scenarios';
  history.el.hidden = sideTab !== 'history';
}
function selectSideTab(id) {
  sideTab = id;
  try { localStorage.setItem(SIDE_TAB_KEY, id); } catch { /* storage blocked */ }
  paintSideTabs();
}

/** Change the tree in storage and keep the in-memory copy current right away. */
async function editTree(fn) {
  return updateTree((t) => { const out = fn(t); tree = t; return out; });
}

/** The saved request the open draft belongs to: { node, parent, ancestors } or null. */
const linked = () => (draft.link?.id ? find(tree, draft.link.id) : null);
/** The draft as it will be sent: collection base URL, headers and auth applied. */
const effective = () => effectiveDraft(draft, linked()?.ancestors || []);

// ── Variables and environments (roadmap feature 7) ──
let envState = { globals: [], envs: [], active: '' };
let envSelect = null;
let varsLine = null;
const activeEnv = () => envState.envs.find(e => e.id === envState.active) || null;
const scopeFor = (ancestors = [], local = null) => buildScope({ globals: envState.globals, env: activeEnv(), ancestors, local });
const extractTarget = () => (activeEnv() ? `the "${activeEnv().name}" environment` : 'Globals (no environment is selected)');

/**
 * What a request sends: template = collection base URL, headers and auth applied
 * ({{vars}} kept, as saved in history); resolved = variables filled in too.
 */
function prepareDraft(d = draft, ancestors = linked()?.ancestors || [], local = null) {
  return prepareRequest(d, ancestors, local, envState);
}

// ── Tests (roadmap feature 8) ──
let lastRes = null;   // the last response, for "Suggest checks"

/** Run a request's checks on its response; {{vars}} in paths and expected values are filled in first. */
function checkResponse(tests, res, ancestors = linked()?.ancestors || [], local = null) {
  return checkWith(tests, res, scopeFor(ancestors, local));
}

/** "test" on a JSON value in the response → a check for it in the Tests tab. */
function addTestFromResponse(path, value) {
  const isObj = value !== null && typeof value === 'object';
  const t = isObj ? newTest('json', { path, op: 'type_is', expected: Array.isArray(value) ? 'array' : 'object' })
    : newTest('json', { path, op: 'equals', expected: typeof value === 'string' ? value : JSON.stringify(value) });
  tabs.addTest(t);
  tabs.select('tests');
  changed();
  toast(`Added a test: ${path} ${isObj ? `is an ${t.expected}` : `equals ${t.expected}`}`, 'ok');
}

/** Run a request's "Set vars" rules on its response; values go to the active environment, or Globals. */
async function applyExtract(rules, res) {
  const { results, envState: next } = await applyVars(rules, res, envState.active);
  if (next) envState = next;
  return results;
}

function openEnvs(select) {
  openEnvDialog({
    state: envState, select: select ?? (envState.envs.length ? undefined : 'new'),
    onSave: async (work, active) => {
      envState = { ...(await updateEnvs((s) => { s.globals = work.globals; s.envs = work.envs; })), active };
      await setActiveEnv(active);
      paintEnvSelect(); paintVarsLine();
      toast('Environments saved', 'ok');
    },
  });
}

function paintEnvSelect() {
  if (!envSelect) return;
  mount(envSelect,
    h('option', { value: '' }, 'No environment'),
    envState.envs.map(e => h('option', { value: e.id }, e.name)),
    h('option', { value: '__manage__' }, envState.envs.length ? 'Manage environments…' : '+ Add an environment…'));
  envSelect.value = envState.active;
  envSelect.classList.toggle('on', !!envState.active);
  envSelect.title = activeEnv() ? `Environment: ${activeEnv().name}` : 'No environment: {{variables}} come from the collection and Globals';
}

/** The variables this request uses and what they are now; the URL as it will be sent. */
function paintVarsLine() {
  if (!varsLine) return;
  const anc = linked()?.ancestors || [];
  const template = effectiveDraft(draft, anc);
  const scope = scopeFor(anc);
  const list = usedVars(template, scope);
  const url = String(template.url || '');
  const preview = url.replace(VAR_RE, (w, n) => (DYNAMIC[n] ? w : scope.get(n) ? shown(scope.get(n)) : w));
  const showUrl = preview !== String(draft.url || '').trim() && preview.trim();
  varsLine.hidden = !list.length && !showUrl;
  if (varsLine.hidden) { mount(varsLine); return; }
  mount(varsLine,
    showUrl ? h('div', { class: 'muted small mono wb-resolved', title: 'The URL as it will be sent' }, `→ ${preview}`) : null,
    list.length ? h('div', { class: 'wb-vars' },
      list.map(v => h('button', {
        type: 'button', class: `wb-var${v.missing ? ' missing' : ''}${v.dynamic ? ' dynamic' : ''}`,
        title: v.missing ? `Not defined${activeEnv() ? ` in "${activeEnv().name}"` : ''}, the collection or Globals. Click to add it.`
          : v.dynamic ? `${v.about}. A new value every time.` : `From ${v.scope === 'environment' ? `the "${v.from}" environment` : v.scope === 'globals' ? 'Globals' : `"${v.from}" (${v.scope})`}`,
        onclick: () => (v.missing || v.scope === 'environment' || v.scope === 'globals' ? openEnvs(v.scope === 'globals' ? 'globals' : undefined) : null),
      }, h('span', { class: 'mono' }, `{{${v.name}}}`), ' ',
      h('span', { class: 'wb-var-val' }, v.missing ? 'not defined' : v.dynamic ? 'new each send' : (shown(v) || '(empty)'))))) : null);
}

function inheritedInfo() {
  const f = linked();
  if (!f) return null;
  const { auth, from } = inheritedAuth(f.ancestors);
  const s = authSummary(auth);
  return {
    headers: inheritedHeaders(f.ancestors),
    auth: { text: s ? `Inherited from "${from?.name}": ${s.text}` : `"${from?.name || 'The collection'}" sets no auth, so none is added. Set it in the collection's settings.` },
  };
}

const forSave = () => { const d = structuredClone(draft); delete d.source; delete d.link; return d; };

async function save() {
  const f = linked();
  if (!f) { saveAs(); return; }
  await editTree(t => { const x = find(t, f.node.id); if (!x) return false; x.node.draft = forSave(); });
  paintLinkBar();
  toast(`Saved "${f.node.name}"`, 'ok');
}

function saveAs() {
  const f = linked();
  const fallbackParent = f?.parent?.id || (lastParentId && find(tree, lastParentId) ? lastParentId : tree.items[0]?.id);
  openSaveDialog({
    tree, title: f ? 'Save as a new request' : 'Save request',
    defaultName: f ? `${f.node.name} copy` : requestName(draft), defaultParentId: fallbackParent,
    onSave: async ({ name, parentId, newCollectionName }) => {
      const d = forSave();
      if (d.auth.type === 'none') d.auth.type = 'inherit';   // like Postman: use the collection's auth, if it has one
      const req = newRequest(name, d);
      let where = '';
      await editTree(t => {
        let p;
        if (!parentId) { p = newCollection(newCollectionName); t.items.push(p); } else p = find(t, parentId)?.node;
        if (!p) throw new Error('That folder no longer exists.');
        p.children.push(req);
        lastParentId = p.id;
        where = p.name;
      });
      draft.auth.type = d.auth.type;
      draft.link = { id: req.id };
      draft.source = null;
      changed();
      render();
      collections.setActive(req.id);
      toast(`Saved to "${where}"`, 'ok');
    },
  });
}

/** Open a saved request. */
function openSaved(id, { quiet = false } = {}) {
  const f = find(tree, id);
  if (!f || f.node.type !== 'request') return false;
  if (draft.link?.id === id) { collections.setActive(id); if (openScenarioId) { openScenarioId = null; scenarios.setActive(null); render(); } return true; }
  const cur = linked();
  if (cur && isDirty(draft, cur.node.draft) && !confirm(`Discard your unsaved changes to "${cur.node.name}"?`)) return false;
  const previous = !cur && draft.url ? { ...structuredClone(draft), source: null } : null;
  showRunner = false;
  if (openScenarioId) { openScenarioId = null; scenarios.setActive(null); }
  loadInto({ ...normalizeDraft(structuredClone(f.node.draft)), link: { id }, source: previous && !quiet ? { kind: 'saved', previous } : null });
  collections.setActive(id);
  return true;
}

async function newRequestIn(parentId) {
  const p = find(tree, parentId);
  if (!p) return;
  const anc = [...p.ancestors, p.node];
  const d = { ...emptyDraft(), url: baseUrlOf(anc) ? '/' : '' };
  d.auth.type = 'inherit';
  const req = newRequest('New request', d);
  await editTree(t => { const x = find(t, parentId); if (!x) return false; x.node.children.push(req); });
  collections.expand(parentId);
  if (openSaved(req.id, { quiet: true })) { collections.rename(req.id); }
}

// ── Backup & sync (roadmap feature 11) ──
let syncState = { enabled: false };
let syncBtn = null;
let syncTimer = null;

const syncIO = {
  load: async (kind) => (kind === 'collections' ? loadTree() : kind === 'environments' ? loadEnvs() : loadScenarios()),
  save: async (kind, data) => {
    if (kind === 'collections') await editTree((t) => { t.items = data.items; });
    else if (kind === 'environments') envState = await updateEnvs((s) => { s.globals = data.globals; s.envs = data.envs; });
    else scenState = (await updateScenarios((st) => { st.items = data.items; })).state;
  },
};

async function runSync(opts) {
  paintSyncBtn('busy');
  const r = await syncNow(syncIO, opts);
  syncState = await loadSyncState();
  paintSyncBtn();
  if (r.conflicts?.length) toast(`Sync: changed on two devices: ${r.conflicts.join(', ')}. Your version was kept as a "(conflict copy)".`, 'info');
  return r;
}

/**
 * After a local change: sync a few seconds later (several changes → one sync).
 * Our own writes from a sync land here too; the next sync then finds nothing to send.
 */
function scheduleSync() {
  if (!syncState.enabled) return;
  clearTimeout(syncTimer);
  syncTimer = setTimeout(() => runSync(), 4000);
}

function paintSyncBtn(busy) {
  if (!syncBtn) return;
  const s = syncState;
  syncBtn.classList.toggle('on', !!s.enabled);
  syncBtn.classList.toggle('err', !!(s.enabled && s.lastError));
  syncBtn.textContent = busy ? '☁ Syncing…' : s.enabled ? (s.lastError ? '☁ Sync ⚠' : '☁ Synced') : '☁ Backup';
  syncBtn.title = s.enabled ? (s.lastError ? `Sync problem: ${s.lastError}` : `Synced with your HitAPI account${s.lastSyncAt ? ` (${new Date(s.lastSyncAt).toLocaleTimeString()})` : ''}. Backup & sync settings`) : 'Backup, restore, storage and sync across devices';
}

function openBackup() {
  openBackupDialog({
    current: async () => ({ tree, envs: envState, scenarios: scenState }),
    makeBackup: async ({ history: withHistory, secrets }) => makeBackup({
      tree: await loadTree(), envs: await loadEnvs(), scenarios: await loadScenarios(), historySettings: await getHistorySettings(),
      history: withHistory ? await exportHistory() : null,
    }, { secrets }),
    importBackup: async (backup, mode) => {
      const next = applyImport({ tree: await loadTree(), envs: await loadEnvs(), scenarios: await loadScenarios() }, backup, mode);
      await editTree((t) => { t.items = next.tree.items; });
      envState = await updateEnvs((s) => { s.globals = next.envs.globals; s.envs = next.envs.envs; });
      await setActiveEnvStore(next.envs.active); envState = { ...envState, active: next.envs.active };
      scenState = (await updateScenarios((st) => { st.items = next.scenarios.items; })).state;
      scenarios.setState(scenState);
      if (next.historySettings) await setHistorySettings(next.historySettings);
      const h = backup.history ? await importHistory(backup.history) : 0;
      paintEnvSelect(); paintVarsLine(); paintSideTabs();
      const n = (x, one) => `${x} ${one}${x === 1 ? '' : 's'}`;
      return `Imported: ${n(next.tree.items.length, 'collection')}, ${n(next.envs.envs.length, 'environment')} and ${n(next.scenarios.items.length, 'scenario')} are now in this browser${h ? `; ${n(h, 'history entry').replace('entrys', 'entries')} added` : ''}.`;
    },
    clearHistory: () => clearHistoryAll(),
    syncState: () => loadSyncState(),
    authState: () => bridgeCall(MSGS.GET_AUTH_STATE),
    setSync: async (on, device) => {
      syncState = await saveSyncState({ enabled: on, device, ...(on ? {} : { lastError: '' }) });
      paintSyncBtn();
    },
    syncNow: () => runSync({ force: true }),
    deleteCloud: async () => { syncState = await stopSync({ deleteCloud: true }); paintSyncBtn(); },
  });
}

/** Import (roadmap feature 10): Postman, OpenAPI, HAR, Insomnia, HitAPI files, environments, cURL. */
function importFile() {
  openImportDialog({
    tree,
    onImport: async (r, { into }) => {
      const done = [];
      if (r.collections.length) {
        await editTree(t => { t.items.push(...r.collections); });
        for (const c of r.collections) collections.expand(c.id);
        done.push(r.collections.length === 1 ? `"${r.collections[0].name}"` : `${r.collections.length} collections`);
      }
      if (r.request) {
        let target = into;
        await editTree(t => {
          let p = target && find(t, target)?.node;
          if (!p) { p = t.items.find(c => c.name === 'Imported requests') || newCollection('Imported requests'); if (!t.items.includes(p)) t.items.push(p); }
          p.children.push(r.request);
          target = p.id;
        });
        collections.expand(target);
        done.push(`"${r.request.name}"`);
      }
      if (r.envs.length || r.globals.length) {
        envState = await updateEnvs((s) => {
          for (const e of r.envs) {
            let name = e.name; let i = 2;
            while (s.envs.some(x => x.name.toLowerCase() === name.toLowerCase())) name = `${e.name} (${i++})`;
            s.envs.push({ id: newEnvId(), name, vars: e.vars });
          }
          for (const v of r.globals) s.globals = setVar(s.globals, v.key, v.value, { secret: v.secret });
        });
        paintEnvSelect(); paintVarsLine();
        if (r.envs.length) done.push(`${r.envs.length} environment${r.envs.length === 1 ? '' : 's'}`);
        if (r.globals.length) done.push(`${r.globals.length} global variable${r.globals.length === 1 ? '' : 's'}`);
      }
      selectSideTab('collections');
      if (r.request && !r.collections.length) openSaved(r.request.id, { quiet: true });
      toast(`Imported ${done.join(', ')}`, 'ok');
    },
  });
}

/** Run every request of a collection or folder, in order. */
function runNode(id) {
  const f = find(tree, id);
  const items = requestsIn(tree, id);
  if (!f || !items.length) { toast('Nothing to run: there are no saved requests in it yet.', 'info'); return; }
  if (runner?.isRunning()) runner.stop();
  runner = createRunner({
    title: f.node.name, items,
    runOne: (it, signal) => runRequest({ draft: it.node.draft, ancestors: it.ancestors, name: it.node.name, signal, getEnv: () => envState, setEnv: (st) => { envState = st; } }),
    onOpen: (it, res) => {
      if (!openSaved(it.node.id, { quiet: true })) return;
      showRunner = false;
      render();
      if (res) response.show(res, { banner: h('div', { class: 'wb-history-note small' }, `Response from the run of "${f.node.name}". `,
        h('button', { type: 'button', class: 'link-btn', onclick: backToRun }, '← Back to the run results')) });
    },
    onClose: () => { runner = null; showRunner = false; document.querySelector('.wb-runner')?.replaceWith(response.el); },
  });
  showRunner = true;
  document.querySelector('.wb-response')?.replaceWith(runner.el);
}
function backToRun() {
  if (!runner) return;
  showRunner = true;
  document.querySelector('.wb-response')?.replaceWith(runner.el);
}

/** Collection, folder and name of the open saved request, with Save. */
function paintLinkBar() {
  if (!linkBar) return;
  const f = linked();
  linkBar.hidden = !f;
  if (!f) { mount(linkBar); return; }
  const dirty = isDirty(draft, f.node.draft);
  const base = baseUrlOf(f.ancestors);
  const u = String(draft.url || '').trim();
  let urlNote = null;
  if (u.startsWith('/') && !base) urlNote = h('div', { class: 'wb-warn-text small' }, `"${f.ancestors[0].name}" has no base URL, so "${u}" can't be sent. Add one in the collection's settings, or type a full URL.`);
  mount(linkBar,
    h('div', { class: 'wb-crumbs' },
      breadcrumb(f).map((name, i, all) => [i ? h('span', { class: 'muted' }, ' / ') : null,
        h(i === all.length - 1 ? 'strong' : 'span', { class: i === all.length - 1 ? 'wb-crumb-name' : 'muted' }, name)]),
      dirty ? h('span', { class: 'wb-dirty', title: 'Changed since it was saved' }, '● edited') : h('span', { class: 'wb-saved muted small' }, '✓ saved'),
      h('span', { class: 'grow' }),
      h('button', { type: 'button', class: `btn-sm ${dirty ? 'btn-primary' : 'btn-ghost'} wb-link-save`, title: 'Save changes (Ctrl/⌘ + S)', disabled: !dirty, onclick: save }, 'Save'),
      h('button', { type: 'button', class: 'btn-ghost btn-sm', title: 'Save a copy (Ctrl/⌘ + Shift + S)', onclick: saveAs }, 'Save as…'),
      h('button', { type: 'button', class: 'btn-ghost btn-sm', title: 'Stop editing the saved request; keep this as an unsaved request',
        onclick: () => {
          const eff = effective();
          draft = { ...draft, url: eff.url, headers: eff.headers, auth: eff.auth, link: null };   // keep what it sends
          changed(); render(); collections.setActive(null);
          toast('Detached: this is now an unsaved request (with the collection\'s URL, headers and auth copied in).', 'info');
        } }, 'Detach')),
    urlNote);
}

function toggleHistory(open = !historyOpen) {
  historyOpen = open;
  try { localStorage.setItem(HISTORY_KEY, open ? 'open' : 'closed'); } catch { /* storage blocked */ }
  document.querySelector('.wb-shell')?.classList.toggle('with-history', open);
  historyBtn?.setAttribute('aria-pressed', String(open));
}

function paintHistoryCount() { paintSideTabs(); }

/** Open a history entry: its request (secrets put back from the current one), and its old response greyed. */
async function openFromHistory(meta) {
  const entry = await getEntry(meta.id);
  if (!entry) { toast('That request is no longer in history.', 'error'); return; }
  const previous = { ...structuredClone(draft), source: null };
  const { draft: restored, missing } = restoreSecrets(entry.draft, entry.masked, draft);
  loadInto({ ...normalizeDraft(restored), settings: { ...draft.settings, ...(restored.settings || {}) }, source: { kind: 'history', at: meta.at, missing, previous } });
  history.setActive(meta.id);
  if (entry.response) response.show(entry.response, { fromHistory: meta.at });
}

const changed = () => { saveDraftSoon(draft); paintLinkBar(); paintVarsLine(); };

function setUrl(value) {
  draft.url = value;
  draft.params = paramsFromUrl(value, draft.params);
  tabs.setParams(draft.params);
  bar.showProblem(null);
  changed();
}

function setParams(rows) {
  draft.params = rows;
  const { base, hash } = splitUrl(draft.url);
  draft.url = buildUrl(base, rows, hash);
  bar.setUrl(draft.url);
  tabs.refresh();
  changed();
}

async function doSend(force = false) {
  if (controller) return;
  if (looksLikeCurl(draft.url)) { importCurl(draft.url); return; }   // a cURL command typed into the URL bar
  const { template, resolved: eff, missing, secrets } = prepareDraft();   // collection settings and {{variables}} applied
  const problem = methodProblem(eff.method) || (String(draft.url).trim().startsWith('/') && !linked()
    ? 'Enter a full URL (https://…). A URL starting with "/" works for requests saved in a collection with a base URL.'
    : (missing.length && varsIn(eff.url).length ? null : urlProblem(eff.url)));
  if (problem) { bar.showProblem(problem); bar.focusUrl(); return; }
  if (missing.length && force !== true) {
    bar.showProblem(`Not defined${activeEnv() ? ` in "${activeEnv().name}"` : ''}: ${missing.map(n => `{{${n}}}`).join(', ')}. Add ${missing.length === 1 ? 'it' : 'them'} to an environment, the collection or Globals.`,
      varsIn(eff.url).length ? { label: 'Add variables', fn: () => openEnvs() } : { label: 'Send anyway', fn: () => doSend(true) });
    return;
  }
  bar.showProblem(null);
  if (showRunner) { showRunner = false; document.querySelector('.wb-runner')?.replaceWith(response.el); }
  controller = new AbortController();
  const timeout = setTimeout(() => controller.abort('timeout'), draft.settings.timeoutSec * 1000);
  bar.setSending(true);
  response.sending(performance.now());
  try {
    const sent = structuredClone(template);   // history keeps {{variables}}, never their (secret) values
    const rules = structuredClone(draft.extract || []);
    const res = await send(eff, { signal: controller.signal, files });
    if (res.oauthToken) tabs.setOauthToken(res.oauthToken);
    if (res.kind !== 'cancel' && res.kind !== 'invalid') {
      const results = checkResponse(draft.tests, res);
      if (results) res.tests = results;
      lastRes = res;
    }
    response.show(res);
    if (draft.source?.kind === 'history') { draft.source = null; changed(); render(); response.show(res); }
    if (res.kind !== 'cancel') {
      if (rules.some(r => r.enabled !== false && r.name)) {
        const results = await applyExtract(rules, res);
        tabs.showExtract(results);
        const ok = results.filter(r => r.ok).map(r => r.name);
        const bad = results.filter(r => !r.ok);
        if (bad.length) toast(`Couldn't set ${bad.map(r => `${r.name} (${r.reason})`).join(', ')}`, 'error');
        else if (ok.length) toast(`Set ${ok.join(', ')} in ${extractTarget().replace(/ \(.*\)$/, '')}`, 'ok');
        paintVarsLine();
      }
      const meta = await addEntry(sent, res, { resolvedUrl: eff.url, redact: secrets }).catch(() => null);
      if (meta) history.setActive(meta.id);
    }
  } finally {
    clearTimeout(timeout);
    controller = null;
    bar.setSending(false);
  }
}

function cancel() { controller?.abort('cancel'); }

const hasHeader = (name) => draft.headers.some(r => r.enabled !== false && String(r.key).trim().toLowerCase() === name.toLowerCase() && String(r.value).trim());

/** A parsed cURL command → the draft (the previous draft can be restored with Undo). */
function applyParsedCurl(parsed) {
  const previous = { ...structuredClone(draft), source: null }; // one level of Undo only
  const { rows: headers, skipped } = importHeaders(parsed.headers.map(hd => [hd.key, hd.value]));
  const notes = [...(parsed.warnings || [])];
  if (skipped.length) notes.push(`Skipped ${skipped.length} header${skipped.length === 1 ? '' : 's'} the browser sets itself (${skipped.slice(0, 3).join(', ')}${skipped.length > 3 ? ', …' : ''}).`);
  if (headers.some(hd => !hd.enabled)) notes.push('User-Agent, Origin and Referer were imported switched off; switch them on if the API checks them.');
  const auth = emptyAuth();
  if (parsed.auth?.type === 'basic' && !headers.some(hd => hd.key.toLowerCase() === 'authorization')) {
    auth.type = 'basic';
    auth.basic = { username: parsed.auth.username, password: parsed.auth.password };
    notes.push(`-u ${parsed.auth.username}:… was put in the Auth tab as Basic auth.`);
  }
  const ct = headers.find(hd => hd.enabled && hd.key.toLowerCase() === 'content-type')?.value || '';
  const { bodyType, bodies } = detectBody(parsed.body || '', ct);
  if (parsed.bodyType === 'json' && !ct) notes.push('The body is JSON, so it is sent with Content-Type: application/json (plain curl would send it as a form).');
  loadInto({
    ...emptyDraft(),
    method: parsed.method,
    url: parsed.url,
    headers,
    bodyType,
    bodies,
    auth,
    settings: draft.settings,
    source: { kind: 'curl', notes, previous },
  }, 'Imported from cURL. Check it, then Send.');
}

function importCurl(text) {
  try { applyParsedCurl(parseCurl(text)); }
  catch (e) { bar.showProblem(`Couldn't read that cURL command: ${e.message}`); }
}

/** A link clicked in a response: open it as a GET request (same headers and auth), with Undo. */
function openLink(url) {
  const previous = { ...structuredClone(draft), source: null };
  loadInto({
    ...structuredClone(draft),
    method: 'GET',
    url,
    params: paramsFromUrl(url, []),
    link: null,
    source: { kind: 'link', previous, notes: [] },
  }, 'Opened the link as a GET request. Press Send.');
}

/** The request as it will be sent, for cURL and code snippets: { method, url, headers, body, form, curl } */
async function finalRequest() {
  const draft = prepareDraft().resolved;   // collection settings and {{variables}} are part of the request too
  const hasHeader = (name) => draft.headers.some(r => r.enabled !== false && String(r.key).trim().toLowerCase() === name.toLowerCase() && String(r.value).trim());
  // what the Auth tab adds is part of the request too
  const oauthToken = draft.auth.type === 'oauth2' ? ((await cachedToken(draft.auth.oauth2)) || { access_token: '<access-token>' }) : null;
  const auth = authParts(draft.auth, { oauthToken });
  const names = new Set(auth.headers.map(a => a.key.toLowerCase()));
  const headers = [...draft.headers.filter(r => !names.has(String(r.key).trim().toLowerCase())), ...auth.headers.map(a => ({ ...a, enabled: true }))];
  // the automatic Content-Type is part of the request, so it goes into the command too
  if (!hasNoBody(draft.method) && !hasHeader('content-type') && ['json', 'xml', 'text', 'graphql'].includes(draft.bodyType)) {
    headers.push({ key: 'Content-Type', value: AUTO_CONTENT_TYPE[draft.bodyType], enabled: true });
  }
  const url = addQuery(normalizeUrl(draft.url), auth.query);
  const curl = toCurl({ method: draft.method, url, headers, bodyArgs: curlBodyArgs(draft, files) });
  let body = null; let form = null; let note = '';
  if (!hasNoBody(draft.method)) {
    const b = draft.bodies;
    if (['json', 'xml', 'text'].includes(draft.bodyType) && b[draft.bodyType]) body = b[draft.bodyType];
    else if (draft.bodyType === 'urlencoded') { const p = new URLSearchParams(); for (const r of b.urlencoded) if (r.enabled !== false && r.key) p.append(r.key, r.value ?? ''); body = p.toString() || null; if (body && !hasHeader('content-type')) headers.push({ key: 'Content-Type', value: 'application/x-www-form-urlencoded', enabled: true }); }
    else if (draft.bodyType === 'graphql') { const built = curlBodyArgs(draft, files); body = built[0]?.[1] ?? null; }
    else if (draft.bodyType === 'form') form = b.form.filter(r => r.enabled !== false && r.key).map(r => (r.kind === 'file' ? { key: r.key, file: files.form.get(r.id)?.name || r.fileName || 'file' } : { key: r.key, value: r.value ?? '' }));
    else if (draft.bodyType === 'binary' && (files.binary || b.binary.fileName)) note = `The binary file (${files.binary?.name || b.binary.fileName}) is only in the cURL version.`;
  }
  return { method: draft.method, url, headers: headers.filter(r => r.enabled !== false && String(r.key).trim()).map(r => [String(r.key).trim(), String(r.value ?? '')]), body, form, curl, note };
}

async function copyAsCurl() {
  const { curl } = await finalRequest();
  const ok = await copyText(curl);
  toast(ok ? 'Copied as cURL' : 'Could not copy', ok ? 'ok' : 'error');
}

async function showCode() {
  const req = await finalRequest();
  openCodeDialog({ make: (lang) => (lang === 'curl' ? req.curl : generate(lang, req)), note: req.note });
}


function loadInto(next, note) {
  draft = next;
  files.binary = null;   // another request: its files are not this one's
  files.form.clear();
  if (!draft.params.length && draft.url) draft.params = paramsFromUrl(draft.url, []);
  render();
  changed();
  if (note) toast(note, 'info');
}

function render() {
  bar = createRequestBar({
    draft,
    onMethod: (m) => { draft.method = m; tabs.refresh(); changed(); },
    onUrl: setUrl,
    onSend: doSend,
    onCancel: cancel,
    onCurl: importCurl,
  });
  tabs = createRequestTabs({
    draft,
    onParams: setParams,
    files,
    onHeaders: (rows) => { draft.headers = rows; tabs.refresh(); changed(); },
    onBodyChange: () => { tabs.refresh(); changed(); },
    onAuthChange: () => changed(),
    onSettings: (patch) => { draft.settings = { ...draft.settings, ...patch }; changed(); },
    inherited: inheritedInfo,
    onExtractChange: () => changed(),
    extractTarget,
    onTestsChange: () => changed(),
    onSuggestTests: () => (lastRes && !lastRes.error ? suggestTests(lastRes) : null),
    onMethod: (m) => { draft.method = m; bar.setMethod(m); tabs.refresh(); changed(); },
  });
  response = createResponse({ onOpenUrl: openLink, onAssert: addTestFromResponse });

  const welcomeNote = welcome ? h('div', { class: 'wb-welcome' },
    h('div', { class: 'wb-welcome-head' },
      h('strong', {}, 'Welcome to the HitAPI Workbench'),
      h('button', { type: 'button', class: 'btn-ghost btn-sm', onclick: () => { welcome = false; dismissWelcome(); render(); } }, 'Got it')),
    h('ol', {},
      h('li', {}, 'A sample request is ready: press ', h('strong', {}, 'Send'), ' to call HitAPI\'s public demo API.'),
      h('li', {}, 'Change the method, URL, params, headers or body and send again. Ctrl/⌘ + Enter sends.'),
      h('li', {}, 'Open the Workbench any time: the HitAPI toolbar button',
        shortcut ? [', or ', h('kbd', {}, shortcut), ' on any page'] : '', '. No account needed.')),
  ) : null;

  const dismiss = () => { draft.source = null; changed(); render(); };
  let sourceNote = null;
  if (draft.source?.kind === 'step') {
    const sc = scenState.items.find(x => x.id === draft.source.scenarioId);
    const idx = sc ? sc.steps.findIndex(x => x.id === draft.source.stepId) : -1;
    sourceNote = h('div', { class: 'wb-source small' },
      h('span', {}, idx >= 0 ? `▶ Step ${idx + 1} of the scenario "${sc.name}" (a copy kept in the scenario). Changes are saved to the step with Save to step (Ctrl/⌘ + S).` : 'This step is no longer in its scenario.'),
      h('span', { class: 'wb-source-actions' },
        idx >= 0 ? h('button', { type: 'button', class: 'btn-primary btn-sm wb-save-step', onclick: saveToStep }, 'Save to step') : null,
        sc ? h('button', { type: 'button', class: 'btn-ghost btn-sm', onclick: () => openScenario(sc.id) }, '← Scenario') : null,
        h('button', { type: 'button', class: 'btn-ghost btn-sm', onclick: dismiss }, 'Dismiss')));
  } else if (draft.source?.kind === 'saved' && draft.source.previous) {
    sourceNote = h('div', { class: 'wb-source small' }, h('span', {}, 'Opened a saved request. Your unsaved request was replaced.'),
      h('span', { class: 'wb-source-actions' },
        h('button', { type: 'button', class: 'btn-ghost btn-sm', onclick: () => { loadInto({ ...draft.source.previous, source: null }, 'Restored the request you had before.'); collections.setActive(null); } }, 'Undo'),
        h('button', { type: 'button', class: 'btn-ghost btn-sm', onclick: dismiss }, 'Dismiss')));
  } else if (draft.source?.kind === 'capture') {
    sourceNote = h('div', { class: 'wb-source small' }, h('span', {}, '⇄ Opened from a captured request.', draft.source.note ? ` ${draft.source.note}` : ''),
      h('button', { type: 'button', class: 'btn-ghost btn-sm', onclick: dismiss }, 'Dismiss'));
  } else if (draft.source?.kind === 'history') {
    const { previous, missing = [], at } = draft.source;
    const day = dayLabel(at);
    const when = `${day === 'Today' || day === 'Yesterday' ? day.toLowerCase() : `on ${day}`} at ${new Date(at).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })}`;
    sourceNote = h('div', { class: 'wb-source small' },
      h('div', {},
        h('div', {}, `🕘 Opened from history (sent ${when}). Edit anything, then Send.`),
        missing.length ? h('div', { class: 'wb-warn-text' }, `• Not kept in history: ${missing.join(', ')}. Enter ${missing.length === 1 ? 'it' : 'them'} again before sending.`) : null),
      h('span', { class: 'wb-source-actions' },
        previous?.url ? h('button', { type: 'button', class: 'btn-ghost btn-sm', onclick: () => loadInto({ ...previous, source: null }, 'Restored the request you had before.') }, 'Undo') : null,
        h('button', { type: 'button', class: 'btn-ghost btn-sm', onclick: dismiss }, 'Dismiss')));
  } else if (draft.source?.kind === 'curl' || draft.source?.kind === 'link') {
    const { previous, notes = [] } = draft.source;
    sourceNote = h('div', { class: 'wb-source small' },
      h('div', {}, h('div', {}, draft.source.kind === 'link' ? '↪ Opened a link from the last response.' : '⌘ Imported from cURL.'), notes.map(n => h('div', { class: 'muted' }, `• ${n}`))),
      h('span', { class: 'wb-source-actions' },
        previous ? h('button', { type: 'button', class: 'btn-ghost btn-sm', onclick: () => loadInto({ ...previous, source: null }, 'Restored the request you had before.') }, 'Undo') : null,
        h('button', { type: 'button', class: 'btn-ghost btn-sm', onclick: dismiss }, 'Dismiss')));
  }

  mount(document.getElementById('app'),
    h('header', { class: 'wb-header' },
      EMBED ? null : h('div', { class: 'logo' }, '⚡'),
      EMBED ? null : h('div', { class: 'header-title' }, 'HitAPI ', h('span', { class: 'muted' }, 'Workbench')),
      EMBED ? h('span', { class: 'muted small' }, 'Requests sent from here are not tied to the inspected page.') : null,
      h('span', { class: 'grow' }),
      envSelect = h('select', { class: 'wb-env', 'aria-label': 'Environment', onchange: async (e) => {
        const v = e.target.value;
        if (v === '__manage__') { e.target.value = envState.active; openEnvs(); return; }
        envState = { ...envState, active: v };
        await setActiveEnv(v);
        paintEnvSelect(); paintVarsLine(); tabs.refreshExtract();
      } }),
      historyBtn = h('button', { type: 'button', class: 'btn-ghost btn-sm wb-history-btn', title: 'Show or hide your saved requests and history', 'aria-pressed': String(historyOpen),
        onclick: () => toggleHistory() }, '☰ Collections & History'),
      h('button', { type: 'button', class: 'btn-ghost btn-sm wb-save-btn', title: 'Save this request in a collection (Ctrl/⌘ + S)', onclick: save }, 'Save'),
      h('button', { type: 'button', class: 'btn-ghost btn-sm', title: 'Paste a cURL command', onclick: () => openCurlDialog({ onImport: applyParsedCurl }) }, 'Import cURL'),
      h('button', { type: 'button', class: 'btn-ghost btn-sm', title: 'Copy this request as a cURL command', onclick: copyAsCurl }, 'Copy as cURL'),
      syncBtn = h('button', { type: 'button', class: 'btn-ghost btn-sm wb-sync-btn', onclick: openBackup }, '☁ Backup'),
      h('button', { type: 'button', class: 'btn-ghost btn-sm wb-code-btn', title: 'This request as code: cURL, JavaScript, Node.js, Python, Go, PHP', onclick: showCode }, '</> Code'),
      h('button', { type: 'button', class: 'btn-ghost btn-sm', title: 'Start a new empty request',
        onclick: () => {
          const f = linked();
          const ok = f ? (!isDirty(draft, f.node.draft) || confirm(`Discard your unsaved changes to "${f.node.name}"?`)) : (!draft.url || confirm('Clear the current request?'));
          if (ok) { loadInto(emptyDraft()); collections.setActive(null); }
        } }, '+ New request'),
      EMBED
        ? h('button', { type: 'button', class: 'btn-ghost btn-sm', title: 'Open the Workbench in its own tab',
          onclick: () => chrome.tabs.create({ url: chrome.runtime.getURL('workbench/workbench.html') }) }, 'Open in a tab ↗')
        : h('a', { class: 'btn-ghost btn-sm', href: DASHBOARD_URL, target: '_blank', rel: 'noopener' }, 'Open HitAPI ↗')),
    h('div', { class: `wb-shell${historyOpen ? ' with-history' : ''}` },
      sidebar,
      openScenarioId && scenarioEditor
        ? h('main', { class: 'wb-main wb-main-scenario' }, scenarioEditor.el,
          // the request editor stays built (hidden) so its state is kept
          h('div', { hidden: true }, h('section', { class: 'wb-request' }, linkBar = h('div', { class: 'wb-linkbar' }), bar.el, varsLine = h('div', { class: 'wb-varsline' }), tabs.el), response.el))
        : h('main', { class: 'wb-main' },
          h('section', { class: 'wb-request', 'aria-label': 'Request' }, welcomeNote, sourceNote, linkBar = h('div', { class: 'wb-linkbar' }), bar.el, varsLine = h('div', { class: 'wb-varsline' }), tabs.el),
          showRunner && runner ? runner.el : response.el)),
  );
  paintLinkBar();
  paintSyncBtn();
  paintEnvSelect();
  paintVarsLine();
  paintHistoryCount();
  if (!draft.url) bar.focusUrl();
}

document.addEventListener('keydown', (e) => {
  if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') { e.preventDefault(); doSend(); }
  else if ((e.ctrlKey || e.metaKey) && !e.altKey && e.key.toLowerCase() === 's') {
    e.preventDefault();
    if (document.querySelector('.wb-overlay')) return;   // a dialog is open
    if (openScenarioId) return;   // scenarios save as you edit
    if (!e.shiftKey && draft.source?.kind === 'step') { saveToStep(); return; }
    if (e.shiftKey) saveAs(); else save();
  }
  else if (e.key === 'Escape' && controller) { e.preventDefault(); cancel(); }
});

if (EMBED) document.body.classList.add('embed');
// the sticky sidebar starts below the header, whose height changes when its buttons wrap
new ResizeObserver(() => {
  const hd = document.querySelector('.wb-header');
  if (hd && !EMBED) document.body.style.setProperty('--wb-head-js', `${hd.offsetHeight}px`);
}).observe(document.getElementById('app'));
try { shortcut = (await chrome.commands.getAll()).find(c => c.name === 'open-workbench')?.shortcut || ''; } catch { /* unavailable */ }
welcome = await shouldWelcome();
history.setIndex(await listIndex());
sweepOrphans();
scenState = await loadScenarios();
scenarios.setState(scenState);
onScenariosChange((st) => {
  scheduleSync();
  scenState = st;
  scenarios.setState(st);
  paintSideTabs();
  if (scenarioEditor) {
    const s = st.items.find(x => x.id === scenarioEditor.id);
    if (!s) { scenarioEditor = null; if (openScenarioId) closeScenario(); return; }
    // changes from another Workbench (not our own typing) replace the editor's copy
    if (Date.now() - scenSelfWrite > 1500 && !scenRun) scenarioEditor.setScenario(structuredClone(s));
  }
});
envState = await loadEnvs();
onEnvChange((s) => { envState = s; paintEnvSelect(); paintVarsLine(); tabs?.refreshExtract(); scheduleSync(); });
tree = await loadTree();
collections.setTree(tree);
onTreeChange((t) => {
  tree = t;
  collections.setTree(t);
  if (draft.link?.id && !find(t, draft.link.id)) {
    draft.link = null; changed();
    toast('The saved request you had open was deleted. Your changes are still here, unsaved.', 'info');
  }
  paintLinkBar();
  paintVarsLine();
  paintSideTabs();
  tabs?.refresh();
  scenarioEditor?.refreshSteps();   // step names and "saved request was deleted"
  scheduleSync();
});
onHistoryChange((index) => { history.setIndex(index); paintHistoryCount(); });
const { draft: initial, incoming, autoSend } = await loadDraft();
const loadIncoming = (next, send) => {
  loadInto(next, send ? null : 'Loaded the captured request. Edit anything, then Send.');
  if (send) { toast('Resending the captured request…', 'info'); doSend(); }
};
if (incoming) loadIncoming(initial, autoSend); else loadInto(initial);
if (draft.link?.id) collections.setActive(draft.link.id);
onIncoming((next, { autoSend: send }) => loadIncoming(next, send));

// Backup & sync (roadmap feature 11): sync on open, after changes, and every 5 minutes while open
syncState = await loadSyncState();
paintSyncBtn();
onSyncStateChange((s) => { syncState = s; paintSyncBtn(); });
if (syncState.enabled) runSync();
setInterval(() => { if (syncState.enabled && document.visibilityState === 'visible') runSync(); }, 5 * 60 * 1000);
