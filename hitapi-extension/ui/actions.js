/**
 * ui/actions.js — everything the UI can do. Views call these; these call the
 * background through the bridge and update the store. Errors always surface
 * (toast or inline), and an expired login always returns to the sign-in screen.
 */

import { MSG, ERR } from '../shared/messages.js';
import { RUN } from '../shared/config.js';
import { call } from './core/bridge.js';
import { toast } from './core/dom.js';

const LAST_PROJECT_KEY = 'hitapi:lastProjectId';
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

function remember(key, value) { try { localStorage.setItem(key, value); } catch { /* storage blocked */ } }
function recall(key) { try { return localStorage.getItem(key); } catch { return null; } }

export function createActions(store) {
  const s = store.state;

  /** Shared error handling. Returns true if it was a sign-in problem. */
  function fail(err, { silent = false } = {}) {
    if (err?.code === ERR.AUTH_EXPIRED || err?.code === ERR.NOT_LOGGED_IN) {
      sessionExpired(err.code === ERR.AUTH_EXPIRED ? 'Your session has expired. Please sign in again.' : '');
      return true;
    }
    if (!silent) toast(`⚠ ${err?.message || 'Something went wrong'}`, 'error');
    return false;
  }

  function sessionExpired(message) {
    store.set({
      screen: 'login', user: null, authMessage: message,
      projects: [], projectId: null, suites: [], runs: {},
    });
  }

  // ── start-up ──────────────────────────────────────────────────────────────
  async function init(tabId) {
    store.set({ tabId });
    try {
      const [auth, tabInfo] = await Promise.all([
        call(MSG.GET_AUTH_STATE),
        call(MSG.GET_TAB_INFO, { tabId }).catch(() => null),
      ]);
      store.set({ tabInfo });
      if (!auth.signedIn) { store.set({ screen: 'login' }); return; }
      store.set({ user: auth.user, screen: 'main' });
      await afterSignIn();
    } catch (e) {
      if (!fail(e, { silent: true })) store.set({ screen: 'login', authMessage: e.message });
    }
  }

  async function afterSignIn() {
    await Promise.all([loadMonitor(), loadAgent(), loadProjects()]);
  }

  // ── auth ──────────────────────────────────────────────────────────────────
  async function login(email, password) {
    try {
      const { user } = await call(MSG.LOGIN, { email, password });
      store.set({ user, authMessage: '', screen: 'main' });
      await afterSignIn();
      return null;
    } catch (e) {
      return e.message; // shown by the login form without clearing what was typed
    }
  }

  async function logout() {
    await call(MSG.LOGOUT).catch(() => {});
    sessionExpired('');
  }

  // ── capture ───────────────────────────────────────────────────────────────
  async function loadMonitor() {
    try {
      const snap = await call(MSG.GET_MONITOR_STATE, { tabId: s.tabId });
      store.set({ monitor: { active: snap.active, origin: snap.origin, token: snap.token }, requests: snap.requests });
    } catch (e) { fail(e, { silent: true }); }
  }

  async function startMonitoring() {
    try {
      const snap = await call(MSG.START_MONITORING, { tabId: s.tabId });
      store.set({ monitor: { active: snap.active, origin: snap.origin, token: snap.token }, requests: snap.requests, tab: 'capture' });
    } catch (e) { fail(e); }
  }

  async function stopMonitoring() {
    try {
      const snap = await call(MSG.STOP_MONITORING, { tabId: s.tabId });
      store.set({ monitor: { active: snap.active, origin: snap.origin, token: snap.token } });
    } catch (e) { fail(e); }
  }

  async function clearCaptured() {
    try {
      await call(MSG.CLEAR_CAPTURED, { tabId: s.tabId });
      store.set({ requests: [], addedIds: new Set() });
    } catch (e) { fail(e); }
  }

  // ── projects & suites ─────────────────────────────────────────────────────
  async function loadProjects(preferId = null) {
    store.set({ projectsLoading: true });
    try {
      const projects = await call(MSG.LIST_PROJECTS);
      const wanted = preferId || s.projectId || recall(LAST_PROJECT_KEY);
      const projectId = projects.some(p => p.id === wanted) ? wanted : (projects[0]?.id || null);
      store.set({ projects, projectsError: '' });
      await selectProject(projectId);
    } catch (e) {
      if (!fail(e, { silent: true })) store.set({ projectsError: e.message });
    } finally {
      store.set({ projectsLoading: false });
    }
  }

  async function selectProject(projectId) {
    store.set({ projectId, suites: [], runs: {} });
    if (projectId) remember(LAST_PROJECT_KEY, projectId);
    await loadSuites();
  }

  async function loadSuites() {
    if (!s.projectId) { store.set({ suites: [] }); return; }
    store.set({ suitesLoading: true });
    try {
      store.set({ suites: await call(MSG.LIST_FLOW_SUITES, { projectId: s.projectId }) });
    } catch (e) {
      fail(e);
    } finally {
      store.set({ suitesLoading: false });
    }
  }

  async function createProject(name, baseUrl) {
    try {
      const project = await call(MSG.CREATE_PROJECT, { name, baseUrl });
      store.set({ showNewProject: false });
      await loadProjects(project.id);
      toast(`✓ Project "${project.name || name}" created`);
      return true;
    } catch (e) { fail(e); return false; }
  }

  // ── captured request → suite / bug ────────────────────────────────────────
  async function addToSuite(requestId, { suiteId, newSuiteName, useToken }) {
    if (!s.projectId) { toast('⚠ Select a project first', 'error'); return false; }
    try {
      const res = await call(MSG.QUICK_CREATE_FROM_CAPTURE, {
        tabId: s.tabId, requestId, projectId: s.projectId, suiteId, newSuiteName, useToken,
      });
      s.addedIds.add(requestId);
      store.touch('addedIds');
      const parts = [res.suite_created ? `✓ Suite "${newSuiteName}" created` : '✓ Added to suite'];
      if (res.auth_set) parts.push('login token saved on the suite');
      if (res.bodySkipped) parts.push('body too large, not saved');
      toast(parts.join(' · '));
      await loadSuites();
      return true;
    } catch (e) { fail(e); return false; }
  }

  async function reportBug(requestId, { severity, note }) {
    if (!s.projectId) { toast('⚠ Select a project first', 'error'); return false; }
    try {
      await call(MSG.REPORT_BUG, { tabId: s.tabId, requestId, projectId: s.projectId, severity, note });
      toast('✓ Bug reported');
      return true;
    } catch (e) { fail(e); return false; }
  }

  // ── runs ──────────────────────────────────────────────────────────────────
  function setRun(suiteId, run) {
    store.set({ runs: { ...s.runs, [suiteId]: run } });
  }

  async function runSuite(suiteId) {
    const projectId = s.projectId;
    if (s.runs[suiteId]?.state === 'running') return;
    setRun(suiteId, { state: 'running', label: 'starting' });
    try {
      const { runId } = await call(MSG.RUN_FLOW_SUITE, { projectId, flowId: suiteId });
      const started = Date.now();
      while (Date.now() - started < RUN.MAX_WAIT_MS) {
        await sleep(RUN.POLL_MS);
        if (s.projectId !== projectId) return; // project switched; stop watching
        const run = await call(MSG.GET_FLOW_RUN_STATUS, { projectId, flowId: suiteId, runId });
        if (run.status === 'queued' || run.status === 'running') {
          setRun(suiteId, { state: 'running', label: run.status });
          continue;
        }
        setRun(suiteId, { state: 'done', passed: run.passed, failed: run.failed, status: run.status });
        call(MSG.SHOW_RUN_RESULT, { passed: run.passed, failed: run.failed }).catch(() => {});
        return;
      }
      setRun(suiteId, { state: 'error', error: 'Still running after 10 minutes. Check the dashboard.' });
    } catch (e) {
      if (!fail(e)) setRun(suiteId, { state: 'error', error: e.message });
    }
  }

  // ── OpenAPI import ────────────────────────────────────────────────────────
  async function importOpenApi(url) {
    if (!s.projectId) { toast('⚠ Select a project first', 'error'); return false; }
    try {
      const res = await call(MSG.IMPORT_OPENAPI, { projectId: s.projectId, url, tabId: s.tabId });
      const updated = res.updated ? `, updated ${res.updated} existing` : '';
      toast(`✓ Imported ${res.imported} new endpoint${res.imported === 1 ? '' : 's'}${updated}`);
      return true;
    } catch (e) { fail(e); return false; }
  }

  // ── Local Agent ───────────────────────────────────────────────────────────
  async function loadAgent() {
    try { store.set({ agent: await call(MSG.GET_AGENT_STATE) }); }
    catch (e) { fail(e, { silent: true }); }
  }

  async function setAgent(enabled) {
    try {
      store.set({ agent: await call(MSG.SET_AGENT_STATE, { enabled }) });
      toast(enabled ? '✓ Local Agent on' : 'Local Agent off', 'info');
    } catch (e) { fail(e); store.touch('agent'); }
  }

  // ── live events from the background ───────────────────────────────────────
  function onLiveEvent(msg) {
    switch (msg.event) {
      case 'requests':
        store.set({ requests: msg.requests });
        break;
      case 'monitor':
        store.set({ monitor: { active: msg.active, origin: msg.origin, token: msg.token } });
        break;
      case 'agent':
        store.set({ agent: { ...s.agent, ...msg, event: undefined } });
        break;
      case 'auth-expired':
        sessionExpired('Your session has expired. Please sign in again.');
        break;
      case 'reconnected':
        if (s.screen === 'main') { loadMonitor(); loadAgent(); }
        break;
      default:
        break;
    }
  }

  return {
    init, login, logout,
    startMonitoring, stopMonitoring, clearCaptured,
    loadProjects, selectProject, createProject,
    addToSuite, reportBug, runSuite, importOpenApi,
    setAgent, onLiveEvent,
    showNewProject: (show) => store.set({ showNewProject: show }),
    showImport: (show) => store.set({ showImport: show }),
    setTab: (tab) => store.set({ tab }),
  };
}
