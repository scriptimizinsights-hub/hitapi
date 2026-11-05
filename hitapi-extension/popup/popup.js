/**
 * HitAPI Extension Popup v1.5
 */

const app = document.getElementById('app');

const state = {
  user: null,
  tab: 'capture',
  projects: [],
  selectedProjectId: null,
  suites: [],
  origin: null,
  monitoring: false,
  requests: [],
  token: null,
  expanded: null,
  creatingNewSuite: null,
  addedIds: new Set(),
  creatingProject: false,
  loading: false,
  agentEnabled: false,
  error: '',
  importingSwagger: false,
  swaggerUrl: '',
  showNewProjectForm: false,
};

let pollTimer = null;

// ── Bootstrap ─────────────────────────────────────────────────────────────────
async function init() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  try { const u = new URL(tab?.url || ''); state.origin = `${u.protocol}//${u.host}`; }
  catch { state.origin = null; }

  try {
    const res = await send('GET_AUTH_STATE');
    state.user = res?.data?.user ?? null;
  } catch (e) {
    state.error = 'Startup error: ' + e.message;
  }

  if (state.user) {
    await refreshAll();
    startPoll();

    const agentRes = await send('GET_AGENT_STATE');
    state.agentEnabled = agentRes.data?.enabled || false;
  }
  render();
}

async function handleToggleAgent() {
  const next = !state.agentEnabled;
  await send('SET_AGENT_STATE', { enabled: next });
  state.agentEnabled = next;
  toast(next ? '✓ Local Agent enabled' : 'Local Agent disabled');
  render();
}

async function handleImportSwagger() {
  if (!state.swaggerUrl.trim()) { toast('⚠ Enter your Swagger/OpenAPI URL'); return; }
  if (!state.selectedProjectId) { toast('⚠ Select a project first'); return; }

  state.importingSwagger = true; render();
  try {
    const res = await send('IMPORT_LOCAL_SWAGGER', {
      swaggerUrl: state.swaggerUrl.trim(),
      projectId: state.selectedProjectId,
    });
    if (!res.success) throw new Error(res.error || 'Import failed');
    toast(`✓ Imported ${res.data.imported} endpoints`);
    state.swaggerUrl = '';
  } catch (e) {
    toast(`⚠ ${e.message}`);
  } finally {
    state.importingSwagger = false;
    render();
  }
}

async function refreshAll() {
  await Promise.all([loadProjects(), loadMonitorState()]);
}

async function loadMonitorState() {
  if (!state.origin) return;
  const { data } = await send('GET_MONITOR_STATE', { origin: state.origin });
  state.monitoring = data?.active || false;
  state.token = data?.token || null;
  if (state.monitoring) {
    const r = await send('GET_CAPTURED_REQUESTS', { origin: state.origin });
    state.requests = r.data || [];
  }
}

async function loadProjects() {
  try {
    const { data } = await send('LIST_PROJECTS');
    state.projects = Array.isArray(data) ? data : [];
    if (state.projects.length && !state.selectedProjectId) {
      state.selectedProjectId = state.projects[0].id;
      await loadSuites();
    }
  } catch (e) { state.error = e.message; }
}

async function loadSuites() {
  if (!state.selectedProjectId) return;
  try {
    const { data } = await send('LIST_FLOW_SUITES', { projectId: state.selectedProjectId });
    state.suites = Array.isArray(data?.suites) ? data.suites : Array.isArray(data) ? data : [];
  } catch { state.suites = []; }
}

// ── Polling ───────────────────────────────────────────────────────────────────
function startPoll() {
  clearInterval(pollTimer);
  pollTimer = setInterval(async () => {
    if (!state.monitoring || !state.origin) return;
    const active = document.activeElement;
    if (active?.tagName === 'INPUT' || active?.tagName === 'TEXTAREA') return;
    const { data } = await send('GET_CAPTURED_REQUESTS', { origin: state.origin });
    state.requests = data || [];
    if (state.tab === 'capture') render();
  }, 1500);
}

function pausePoll() { clearInterval(pollTimer); }
function resumePoll() { startPoll(); }

window.addEventListener('unload', () => clearInterval(pollTimer));

// ── Message helper ────────────────────────────────────────────────────────────
// Always returns { success, data } — never throws, never returns undefined
async function send(type, extra = {}) {
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const res = await chrome.runtime.sendMessage({ type, ...extra });
      if (res !== undefined && res !== null) return res;
    } catch (e) {
      if (attempt < 2) await new Promise(r => setTimeout(r, 300 * (attempt + 1)));
    }
  }
  return { success: false, data: null, error: 'Extension not ready — try again' };
}

// ── Actions ───────────────────────────────────────────────────────────────────
async function doLogin(email, password) {
  state.loading = true; state.error = ''; render();
  try {
    const res = await send('LOGIN', { email, password });
    if (!res?.success) throw new Error(res?.error || 'Login failed');
    state.user = res.data?.user || res.data;
    await refreshAll(); startPoll();

    const agentRes = await send('GET_AGENT_STATE');
    state.agentEnabled = agentRes.data?.enabled || false;
  } catch (e) { state.error = e.message; }
  state.loading = false; render();
}

async function doLogout() {
  await send('LOGOUT');
  clearInterval(pollTimer);
  Object.assign(state, { user: null, projects: [], suites: [], monitoring: false, requests: [], agentEnabled: false });
  render();
}

async function doStartMonitoring() {
  state.loading = true; render();
  await send('START_MONITORING', { origin: state.origin });
  state.monitoring = true;
  state.requests = [];
  state.addedIds = new Set();
  state.loading = false;
  startPoll(); render();
}

async function doStopMonitoring() {
  await send('STOP_MONITORING', { origin: state.origin });
  state.monitoring = false; render();
}

async function doClear() {
  await send('CLEAR_CAPTURED', { origin: state.origin });
  state.requests = []; state.addedIds = new Set(); render();
}

async function doCreateProject(name, baseUrl) {
  if (!name || !baseUrl) { toast('⚠ Enter name and base URL'); return; }
  try {
    const res = await send('CREATE_PROJECT', { name, baseUrl });
    state.creatingProject = false;
    state.showNewProjectForm = false;
    await loadProjects();
    // Auto-select the newly created project instead of leaving the old one selected
    const newId = res?.data?.id || res?.data?.project?.id;
    if (newId) {
      state.selectedProjectId = newId;
      await loadSuites();
    }
    toast(`✓ Project "${name}" created`);
    resumePoll(); render();
  } catch (e) { state.error = e.message; render(); }
}

async function doAddToSuite(reqId, suiteId) {
  const req = state.requests.find(r => r.id === reqId);
  if (!req) return;
  try {
    await send('QUICK_CREATE_FROM_CAPTURE', { projectId: state.selectedProjectId, request: req, suiteId });
    state.addedIds.add(reqId);
    state.expanded = null;
    toast('✓ Added to suite');
    render();
  } catch (e) { state.error = e.message; render(); }
}

async function doCreateSuite(reqId, name) {
  if (!name) { toast('⚠ Enter a suite name'); return; }
  const req = state.requests.find(r => r.id === reqId);
  if (!req) return;
  pausePoll();
  try {
    await send('QUICK_CREATE_FROM_CAPTURE', { projectId: state.selectedProjectId, request: req, newSuiteName: name });
    state.addedIds.add(reqId);
    state.creatingNewSuite = null;
    state.expanded = null;
    await loadSuites();
    toast(`✓ Suite "${name}" created`);
    render();
  } catch (e) { state.error = e.message; render(); }
  finally { resumePoll(); }
}

async function doRunSuite(suiteId) {
  const suite = state.suites.find(s => s.id === suiteId);
  if (!suite) return;
  suite._running = true; render();
  try {
    const { data } = await send('RUN_FLOW_SUITE', { projectId: state.selectedProjectId, flowId: suiteId });
    const runId = data?.run_id || data?.id;
    suite._runId = runId;
    pollRun(suiteId, runId);
  } catch (e) { suite._running = false; state.error = e.message; render(); }
}

async function pollRun(suiteId, runId) {
  if (!runId) return;
  await new Promise(r => setTimeout(r, 2000));
  const suite = state.suites.find(s => s.id === suiteId);
  if (!suite) return;
  try {
    const { data } = await send('GET_FLOW_RUN_STATUS', { projectId: state.selectedProjectId, flowId: suiteId, runId });
    const run = data?.run || data;
    if (run?.status === 'running' || run?.status === 'queued') {
      render(); pollRun(suiteId, runId);
    } else {
      suite._running = false;
      suite._passed = run?.passed || 0;
      suite._failed = run?.failed || 0;
      send('UPDATE_BADGE', { passed: suite._passed, failed: suite._failed });
      render();
    }
  } catch { suite._running = false; render(); }
}

function toast(msg) {
  const t = Object.assign(document.createElement('div'), { textContent: msg });
  t.style.cssText = 'position:fixed;bottom:10px;left:50%;transform:translateX(-50%);background:#23d18b;color:#0a0a0f;padding:5px 14px;border-radius:8px;font-size:12px;font-weight:600;z-index:9999;white-space:nowrap;';
  document.body.appendChild(t); setTimeout(() => t.remove(), 2000);
}

function esc(s) { const d = document.createElement('div'); d.textContent = s ?? ''; return d.innerHTML; }

// ── Render ────────────────────────────────────────────────────────────────────
function render() {
  app.innerHTML = state.user ? renderApp() : renderLogin();
  bind();
}

function renderLogin() {
  return `
  <div class="login-wrap">
    <div class="login-logo">⚡</div>
    <div class="login-title">HitAPI</div>
    <div class="login-sub">Sign in to monitor requests and run test suites</div>
    ${state.error ? `<div class="error">${esc(state.error)}</div>` : ''}
    <input id="em" type="email" placeholder="Email" style="width:100%;" />
    <input id="pw" type="password" placeholder="Password" style="width:100%;" />
    <button id="login-btn" class="btn-primary" style="width:100%;" ${state.loading ? 'disabled' : ''}>
      ${state.loading ? '<span class="spinner"></span> Signing in…' : 'Sign in'}
    </button>
    <div style="font-size:11px;color:var(--text-tertiary);text-align:center;">
      No account? <a href="https://hitapi.dev" target="_blank" style="color:var(--accent);">Sign up on hitapi.dev</a>
    </div>
  </div>`;
}

function renderApp() {
  const isWebPage = state.origin && !state.origin.startsWith('chrome') && !state.origin.startsWith('about');
  const proj = state.projects.find(p => p.id === state.selectedProjectId);

  return `
  <div class="shell">

    <div class="header">
      <div class="logo">⚡</div>
      <div class="header-title">HitAPI</div>
      <div class="header-user">
        ${esc(state.user.name)}
        <button id="logout-btn" class="btn-ghost btn-sm" title="Sign out">⏻</button>
      </div>
    </div>
    ${renderAgentToggle()}
    <div class="monitor-bar ${state.monitoring ? 'active' : ''}">
      <div style="flex:1;min-width:0;">
        <div class="monitor-label" style="color:${state.monitoring ? 'var(--green)' : 'var(--text-secondary)'};">
          ${state.monitoring ? '● Monitoring active' : '○ Not monitoring'}
        </div>
        ${isWebPage ? `<div class="monitor-origin">${esc(state.origin)}</div>` : ''}
      </div>
      ${!isWebPage
      ? `<span style="font-size:11px;color:var(--text-tertiary);">Open a website first</span>`
      : state.monitoring
        ? `<button id="stop-btn" class="btn-danger">■ Stop</button>`
        : `<button id="start-btn" class="btn-primary btn-sm" ${state.loading ? 'disabled' : ''}>
               ${state.loading ? '<span class="spinner"></span>' : '▶ Start'}
             </button>`
    }
    </div>

    <div class="tabs">
      <div class="tab ${state.tab === 'capture' ? 'active' : ''}" data-tab="capture">
        Capture${state.requests.length > 0 ? `<span class="badge">${state.requests.length}</span>` : ''}
      </div>
      <div class="tab ${state.tab === 'suites' ? 'active' : ''}" data-tab="suites">▶ Run Suites</div>
    </div>

    <div class="content">
      ${state.error ? `<div class="error">${esc(state.error)}</div>` : ''}
      ${renderContent()}
    </div>

    <div class="footer">
      <span style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:200px;">${proj ? esc(proj.name) : 'No project'}</span>
      <a href="https://hitapi.dev" target="_blank">Dashboard ↗</a>
    </div>

  </div>`;
}

function renderContent() {
  if (state.projects.length === 0) return renderNoProject();
  let out = '';

  if (state.showNewProjectForm) {
    out += `
    <div class="card" style="border-color:rgba(130,100,255,0.3); margin-bottom:10px;">
      <div style="font-size:11px;font-weight:600;color:var(--accent);margin-bottom:10px;">✨ New project</div>
      <div style="display:flex;flex-direction:column;gap:8px;">
        <input id="np-name" type="text" placeholder="Project name (e.g. Local Dev)" />
        <input id="np-url"  type="url"  placeholder="Base URL — e.g. ${esc(state.origin || 'http://localhost:8787')}" />
        <div style="display:flex;gap:6px;">
          <button id="np-cancel" class="btn-ghost btn-sm" style="flex:1;">Cancel</button>
          <button id="np-ok"     class="btn-primary btn-sm" style="flex:2;">Create</button>
        </div>
      </div>
    </div>`;
  } else if (state.projects.length > 1 || true) {
    out += `<div style="display:flex; gap:6px; margin-bottom:10px;">
      <select id="proj-sel" style="flex:1;">
        ${state.projects.map(p => `<option value="${p.id}" ${p.id === state.selectedProjectId ? 'selected' : ''}>${esc(p.name)}</option>`).join('')}
      </select>
      <button id="new-proj-btn" class="btn-ghost btn-sm" title="Create a new project">+ New</button>
    </div>`;
  }

  out += renderSwaggerImport();
  out += state.tab === 'capture' ? renderCapture() : renderSuites();
  return out;
}

function renderNoProject() {
  if (state.creatingProject) {
    return `
    <div class="card" style="border-color:rgba(130,100,255,0.3);">
      <div style="font-size:11px;font-weight:600;color:var(--accent);margin-bottom:10px;">✨ Create your first project</div>
      <div style="display:flex;flex-direction:column;gap:8px;">
        <input id="np-name" type="text" placeholder="Project name" />
        <input id="np-url"  type="url"  placeholder="Base URL e.g. https://api.example.com" />
        <div style="display:flex;gap:6px;">
          <button id="np-cancel" class="btn-ghost btn-sm" style="flex:1;">Cancel</button>
          <button id="np-ok"     class="btn-primary btn-sm" style="flex:2;">Create</button>
        </div>
      </div>
    </div>`;
  }
  return `
  <div style="display:flex;align-items:center;justify-content:space-between;padding:10px 12px;background:var(--bg-card);border:1px solid var(--border);border-radius:9px;margin-bottom:8px;">
    <span style="font-size:12px;color:var(--text-secondary);">No projects yet</span>
    <button id="np-start" class="btn-primary btn-sm">+ New project</button>
  </div>`;
}

function renderCapture() {
  if (!state.monitoring) {
    return `
    <div class="empty">
      <div class="icon">📡</div>
      <p>Click <strong>▶ Start</strong> above to begin<br>monitoring API requests on this site.</p>
      <p style="margin-top:8px;font-size:11px;">Monitoring continues even when you switch tabs.</p>
    </div>`;
  }

  let out = '';

  if (state.token) {
    out += `<div class="card" style="border-color:rgba(130,100,255,0.3);display:flex;align-items:center;gap:8px;margin-bottom:8px;">
      <span style="font-size:12px;">🔑 Bearer token detected</span>
      <button id="copy-token" class="btn-ghost btn-sm" style="margin-left:auto;">Copy</button>
    </div>`;
  }

  if (state.requests.length === 0) {
    out += `<div class="empty"><div class="icon">⏳</div><p>Monitoring… interact with<br>the page to see requests.</p></div>`;
    return out;
  }

  out += `<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:8px;">
    <div class="label">${state.requests.length} request${state.requests.length !== 1 ? 's' : ''} captured</div>
    <button id="clear-btn" class="btn-ghost btn-sm">Clear</button>
  </div>`;

  out += state.requests.map(req => renderReqItem(req)).join('');
  return out;
}

function renderReqItem(req) {
  const expanded = state.expanded === req.id;
  const added = state.addedIds.has(req.id);
  const mClass = `m m-${req.method}`;
  let path = req.url;
  try { path = new URL(req.url).pathname; } catch { }
  const statusClass = req.status < 300 ? 'status-ok' : 'status-err';
  const hasSuites = state.suites.length > 0;
  const creatingNew = state.creatingNewSuite === req.id;

  const suiteOpts = state.suites.map(s => `<option value="${s.id}">${esc(s.name)}</option>`).join('');

  return `
  <div class="req-item" style="${added ? 'border-color:rgba(35,209,139,0.3);' : ''}">
    <div class="req-row" data-toggle="${req.id}">
      <span class="${mClass}">${req.method}</span>
      <span class="url">${esc(path)}</span>
      ${req.status ? `<span class="${statusClass}">${req.status}</span>` : ''}
      ${added ? `<span class="added-tag">✓</span>` : ''}
    </div>
    ${expanded ? `
    <div class="req-actions">
      ${added ? `
        <div style="font-size:11px;color:var(--green);">✓ Already added
          <button data-readd="${req.id}" class="btn-ghost btn-sm" style="margin-left:8px;font-size:10px;">Add again</button>
        </div>
      ` : creatingNew ? `
        <div style="display:flex;gap:6px;">
          <input id="ns-${req.id}" type="text" placeholder="New suite name…" style="flex:1;" />
          <button data-ns-ok="${req.id}" class="btn-primary btn-sm">Create</button>
        </div>
        ${hasSuites ? `<button data-ns-cancel="${req.id}" class="btn-ghost btn-sm">← Back</button>` : ''}
      ` : `
        ${hasSuites ? `
          <div style="display:flex;gap:6px;">
            <select id="ss-${req.id}" style="flex:1;">${suiteOpts}</select>
            <button data-add="${req.id}" class="btn-ghost btn-sm">+ Add</button>
          </div>
        ` : `<div style="font-size:11px;color:var(--text-tertiary);">No suites yet</div>`}
        <button data-ns-open="${req.id}" class="btn-ghost btn-sm">✨ Create new suite${hasSuites ? ' instead' : ''}</button>
      `}
      <button data-bug="${req.id}" class="btn-ghost btn-sm">🐛 Report as bug</button>
    </div>
    ` : ''}
  </div>`;
}

function renderSuites() {
  if (state.suites.length === 0) {
    return `<div class="empty"><div class="icon">▶</div><p>No flow suites yet.<br>Add a captured request to create one,<br>or build one on the dashboard.</p></div>`;
  }
  return state.suites.map(s => `
  <div class="suite-card">
    <div style="flex:1;min-width:0;">
      <div style="font-size:13px;font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${esc(s.name)}</div>
      <div style="font-size:11px;color:var(--text-tertiary);">${s.step_count || 0} steps</div>
    </div>
    ${s._running
      ? `<span style="font-size:11px;color:var(--amber);">⏳ ${s._status || 'running'}</span>`
      : s._passed !== undefined
        ? `<span style="font-size:11px;color:${s._failed > 0 ? 'var(--red)' : 'var(--green)'};">${s._passed}✓${s._failed > 0 ? ` ${s._failed}✗` : ''}</span>`
        : ''}
    <button data-run="${s.id}" class="btn-primary btn-sm" ${s._running ? 'disabled' : ''} style="white-space:nowrap;">
      ${s._running ? '…' : '▶ Run'}
    </button>
  </div>`).join('');
}

function renderAgentToggle() {
  const on = state.agentEnabled;
  return `
    <div style="display:flex; align-items:center; justify-content:space-between; padding:8px 14px; background:${on ? 'rgba(35,209,139,0.06)' : 'transparent'}; border-bottom:1px solid var(--border);">
      <div>
        <div style="font-size:11px; font-weight:600; color:var(--text-primary);">🖥️ Local Agent ${on ? '<span style="color:var(--green);">●</span>' : ''}</div>
        <div style="font-size:10px; color:var(--text-tertiary);">Lets HitAPI run tests against your localhost API</div>
      </div>
      <label style="position:relative; width:36px; height:20px; cursor:pointer; flex-shrink:0;">
        <input type="checkbox" id="agent-toggle" ${on ? 'checked' : ''} style="opacity:0; width:100%; height:100%; position:absolute; margin:0; cursor:pointer;" />
        <span style="position:absolute; inset:0; background:${on ? 'var(--accent)' : 'rgba(255,255,255,0.15)'}; border-radius:10px; transition:background .2s; pointer-events:none;"></span>
        <span style="position:absolute; top:2px; left:${on ? '18px' : '2px'}; width:16px; height:16px; background:#fff; border-radius:50%; transition:left .2s; pointer-events:none;"></span>
      </label>
    </div>
  `;
}

function renderSwaggerImport() {
  return `
    <div class="card" style="margin-bottom:10px;">
      <div style="font-size:11px; font-weight:600; color:var(--accent); margin-bottom:6px;">
        📥 Import Swagger from this tab
      </div>
      <div style="font-size:10px; color:var(--text-tertiary); margin-bottom:8px; line-height:1.5;">
        Open your local API's Swagger/OpenAPI URL in this tab (e.g.
        <code style="font-family:monospace;">http://localhost:3000/openapi.json</code>), then import it here.
      </div>
      <div style="display:flex; gap:6px;">
        <input id="swagger-url" type="text" placeholder="http://localhost:3000/openapi.json"
               value="${esc(state.swaggerUrl)}" style="flex:1;" />
        <button id="import-swagger-btn" class="btn-primary btn-sm" ${state.importingSwagger ? 'disabled' : ''}>
          ${state.importingSwagger ? '<span class="spinner"></span>' : 'Import'}
        </button>
      </div>
    </div>
  `;
}

// ── Event binding ─────────────────────────────────────────────────────────────
function bind() {
  // Login
  on('login-btn', 'click', () => doLogin(val('em'), val('pw')));
  on('pw', 'keydown', e => e.key === 'Enter' && doLogin(val('em'), val('pw')));

  // Auth
  on('logout-btn', 'click', doLogout);

  // Local Agent toggle
  on('agent-toggle', 'change', handleToggleAgent);

  // Swagger import — FIX: input/button existed in renderSwaggerImport() output
  // but were never bound here, and renderSwaggerImport() was never called
  // from renderContent() either — both gaps closed now.
  on('swagger-url', 'input', e => { state.swaggerUrl = e.target.value; });
  on('swagger-url', 'keydown', e => e.key === 'Enter' && handleImportSwagger());
  on('swagger-url', 'click', e => e.stopPropagation());
  on('import-swagger-btn', 'click', handleImportSwagger);

  // Monitor
  on('start-btn', 'click', doStartMonitoring);
  on('stop-btn', 'click', doStopMonitoring);
  on('clear-btn', 'click', doClear);
  on('copy-token', 'click', () => { navigator.clipboard.writeText(state.token); toast('✓ Copied'); });

  // Tabs
  qsa('[data-tab]', el => el.addEventListener('click', () => { state.tab = el.dataset.tab; render(); }));

  // Project select
  on('proj-sel', 'change', async e => { state.selectedProjectId = e.target.value; await loadSuites(); render(); });

  // New project (when projects already exist)
  on('new-proj-btn', 'click', () => {
    pausePoll(); state.showNewProjectForm = true; render();
    setTimeout(() => id('np-name')?.focus(), 0);
  });

  // New project
  on('np-start', 'click', () => { pausePoll(); state.creatingProject = true; render(); setTimeout(() => id('np-name')?.focus(), 0); });
  on('np-cancel', 'click', () => { state.creatingProject = false; state.showNewProjectForm = false; resumePoll(); render(); });
  on('np-ok', 'click', () => doCreateProject(val('np-name'), val('np-url')));
  ['np-name', 'np-url'].forEach(i => on(i, 'keydown', e => e.key === 'Enter' && doCreateProject(val('np-name'), val('np-url'))));
  ['np-name', 'np-url'].forEach(i => on(i, 'click', e => e.stopPropagation()));

  // Request toggles
  qsa('[data-toggle]', el => el.addEventListener('click', () => {
    state.expanded = state.expanded === el.dataset.toggle ? null : el.dataset.toggle;
    render();
  }));

  // Add to suite
  qsa('[data-add]', el => el.addEventListener('click', e => {
    e.stopPropagation();
    const reqId = el.dataset.add;
    doAddToSuite(reqId, id(`ss-${reqId}`)?.value);
  }));

  // New suite open/cancel/ok
  qsa('[data-ns-open]', el => el.addEventListener('click', e => {
    e.stopPropagation();
    pausePoll(); state.creatingNewSuite = el.dataset.nsOpen; render();
    setTimeout(() => id(`ns-${el.dataset.nsOpen}`)?.focus(), 0);
  }));
  qsa('[data-ns-cancel]', el => el.addEventListener('click', e => {
    e.stopPropagation();
    state.creatingNewSuite = null; resumePoll(); render();
  }));
  qsa('[data-ns-ok]', el => el.addEventListener('click', e => {
    e.stopPropagation();
    doCreateSuite(el.dataset.nsOk, val(`ns-${el.dataset.nsOk}`));
  }));
  qsa('[id^="ns-"]', el => {
    el.addEventListener('click', e => e.stopPropagation());
    el.addEventListener('keydown', e => {
      if (e.key === 'Enter') { e.stopPropagation(); doCreateSuite(el.id.slice(3), el.value); }
    });
  });

  // Re-add
  qsa('[data-readd]', el => el.addEventListener('click', e => {
    e.stopPropagation();
    state.addedIds.delete(el.dataset.readd); render();
  }));

  // Bug report
  qsa('[data-bug]', el => el.addEventListener('click', e => {
    e.stopPropagation();
    const req = state.requests.find(r => r.id === el.dataset.bug);
    if (req) send('REPORT_BUG', { projectId: state.selectedProjectId, request: req }).then(() => toast('✓ Bug reported'));
  }));

  // Run suite
  qsa('[data-run]', el => el.addEventListener('click', () => doRunSuite(el.dataset.run)));
}

// ── DOM helpers ───────────────────────────────────────────────────────────────
const id = s => document.getElementById(s);
const val = s => id(s)?.value?.trim() || '';
const on = (s, e, fn) => id(s)?.addEventListener(e, fn);
const qsa = (s, fn) => document.querySelectorAll(s).forEach(fn);

init();