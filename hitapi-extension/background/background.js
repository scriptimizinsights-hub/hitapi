/**
 * HitAPI Extension — Background Service Worker v1.5
 *
 * How capture works:
 * 1. User opens popup on a site → clicks "Start Monitoring"
 * 2. We mark that origin as active in the monitors Map
 * 3. webRequest listeners (always running, declared in manifest) check each
 *    request — if its origin is in an active monitor, we record it
 * 4. Popup polls GET_CAPTURED_REQUESTS every 1.5s to show the list
 * 5. User clicks "Stop" → origin marked inactive
 */

const API_BASE = 'https://services.hitapi.dev/api';
const MAX_REQUESTS = 100;

// origin → { active, requests[], _pending Map }
const monitors = new Map();

function getMonitor(origin) {
  if (!monitors.has(origin)) {
    monitors.set(origin, { active: false, requests: [], _pending: new Map() });
  }
  return monitors.get(origin);
}

function getOrigin(url) {
  try { const u = new URL(url); return `${u.protocol}//${u.host}`; }
  catch { return null; }
}

// Skip list — noise URLs we never want
const SKIP = [
  'services.hitapi.dev', 'hitapi.dev',
  'google-analytics.com', 'googletagmanager.com',
  'doubleclick.net', 'facebook.com/tr',
  'segment.io', 'sentry.io', 'hotjar.com',
  'intercom.io', 'crisp.chat',
  'fonts.googleapis.com', 'fonts.gstatic.com',
  'cdn.', 'static.', 'assets.',
];

function shouldCapture(url) {
  try {
    const u = new URL(url);
    // Skip non-http(s)
    if (!u.protocol.startsWith('http')) return false;
    // Skip known noise
    if (SKIP.some(s => url.includes(s))) return false;
    // Skip static assets by extension
    if (/\.(js|css|png|jpg|jpeg|gif|svg|ico|woff|woff2|ttf|eot|map)(\?|$)/.test(u.pathname)) return false;
    return true;
  } catch { return false; }
}

// ── webRequest: capture request body before it's sent ────────────────────────
chrome.webRequest.onBeforeRequest.addListener(
  (details) => {
    const origin = getOrigin(details.url);
    if (!origin) return;
    const monitor = monitors.get(origin);
    if (!monitor?.active) return;
    if (!shouldCapture(details.url)) return;

    let body = null;
    if (details.requestBody?.raw) {
      try { body = details.requestBody.raw.map(c => new TextDecoder().decode(c.bytes)).join(''); }
      catch { /* ignore decode errors */ }
    } else if (details.requestBody?.formData) {
      body = JSON.stringify(details.requestBody.formData);
    }

    monitor._pending.set(details.requestId, {
      id: details.requestId,
      url: details.url,
      method: details.method,
      body,
      tabId: details.tabId,
      timestamp: Date.now(),
      status: null,
    });
  },
  { urls: ['<all_urls>'], types: ['xmlhttprequest'] },
  ['requestBody']
);

// ── webRequest: capture request headers ──────────────────────────────────────
chrome.webRequest.onSendHeaders.addListener(
  (details) => {
    const origin = getOrigin(details.url);
    if (!origin) return;
    const monitor = monitors.get(origin);
    if (!monitor?.active) return;

    const entry = monitor._pending.get(details.requestId);
    if (!entry) return;

    const headers = {};
    for (const h of (details.requestHeaders || [])) headers[h.name] = h.value;
    entry.headers = headers;

    // Detect auth token
    const auth = headers['Authorization'] || headers['authorization'];
    if (auth?.startsWith('Bearer ')) {
      chrome.storage.local.get('detectedTokens').then(({ detectedTokens = {} }) => {
        detectedTokens[origin] = { token: auth.slice(7), detectedAt: Date.now() };
        chrome.storage.local.set({ detectedTokens });
      });
    }
  },
  { urls: ['<all_urls>'], types: ['xmlhttprequest'] },
  ['requestHeaders', 'extraHeaders']
);

// ── webRequest: capture response status ──────────────────────────────────────
chrome.webRequest.onCompleted.addListener(
  (details) => {
    const origin = getOrigin(details.url);
    if (!origin) return;
    const monitor = monitors.get(origin);
    if (!monitor?.active) return;

    const entry = monitor._pending.get(details.requestId);
    if (!entry) return;
    monitor._pending.delete(details.requestId);

    entry.status = details.statusCode;

    // Add to requests list (newest first)
    monitor.requests.unshift(entry);
    if (monitor.requests.length > MAX_REQUESTS) monitor.requests.pop();

    // Update badge
    chrome.action.setBadgeText({ text: String(monitor.requests.length) });
    chrome.action.setBadgeBackgroundColor({ color: '#8264ff' });

    console.log(`[HitAPI] Captured: ${entry.method} ${entry.url} → ${entry.status}`);
  },
  { urls: ['<all_urls>'], types: ['xmlhttprequest'] }
);

// ── webRequest: clean up on error ────────────────────────────────────────────
chrome.webRequest.onErrorOccurred.addListener(
  (details) => {
    const origin = getOrigin(details.url);
    if (origin) monitors.get(origin)?._pending.delete(details.requestId);
  },
  { urls: ['<all_urls>'], types: ['xmlhttprequest'] }
);

// ── Clean up on tab close ─────────────────────────────────────────────────────
chrome.tabs.onRemoved.addListener((tabId) => {
  // Clean pending entries for that tab
  for (const monitor of monitors.values()) {
    for (const [reqId, entry] of monitor._pending) {
      if (entry.tabId === tabId) monitor._pending.delete(reqId);
    }
  }
});

// ── Message handling ──────────────────────────────────────────────────────────
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (!msg?.type) { sendResponse({ success: false, error: 'No message type' }); return true; }
  handle(msg).then(res => {
    sendResponse(res ?? { success: false, error: 'No response' });
  }).catch(err => {
    console.error('[HitAPI] Message error:', msg.type, err.message);
    sendResponse({ success: false, error: err.message });
  });
  return true; // async
});

async function handle(msg) {
  switch (msg.type) {

    case 'START_MONITORING': {
      const monitor = getMonitor(msg.origin);
      monitor.active = true;
      monitor.requests = [];
      monitor._pending = new Map();
      chrome.action.setBadgeText({ text: '0' });
      chrome.action.setBadgeBackgroundColor({ color: '#8264ff' });
      console.log('[HitAPI] Monitoring started:', msg.origin);
      return { success: true };
    }

    case 'STOP_MONITORING': {
      const monitor = monitors.get(msg.origin);
      if (monitor) monitor.active = false;
      chrome.action.setBadgeText({ text: '' });
      console.log('[HitAPI] Monitoring stopped:', msg.origin);
      return { success: true };
    }

    case 'GET_MONITOR_STATE': {
      const monitor = monitors.get(msg.origin);
      const { detectedTokens = {} } = await chrome.storage.local.get('detectedTokens');
      return {
        success: true,
        data: {
          active: monitor?.active || false,
          count: monitor?.requests?.length || 0,
          token: detectedTokens[msg.origin]?.token || null,
        }
      };
    }

    case 'GET_CAPTURED_REQUESTS': {
      const monitor = monitors.get(msg.origin);
      return { success: true, data: monitor?.requests || [] };
    }

    case 'CLEAR_CAPTURED': {
      const monitor = monitors.get(msg.origin);
      if (monitor) { monitor.requests = []; monitor._pending = new Map(); }
      chrome.action.setBadgeText({ text: '' });
      return { success: true };
    }

    // ── Auth ──
    case 'LOGIN': {
      const res = await apiPost('/auth/login', { email: msg.email, password: msg.password });
      if (res.token) await chrome.storage.local.set({ hitapi_token: res.token, hitapi_user: res.user });
      return { success: true, data: res };
    }
    case 'LOGOUT':
      await chrome.storage.local.remove(['hitapi_token', 'hitapi_user']);
      chrome.action.setBadgeText({ text: '' });
      return { success: true };
    case 'GET_AUTH_STATE': {
      const { hitapi_token: token, hitapi_user: user } = await chrome.storage.local.get(['hitapi_token', 'hitapi_user']);
      return { success: true, data: { token: token || null, user: user || null } };
    }

    case 'GET_AGENT_STATE': {
      return { success: true, data: { enabled: await isAgentEnabled() } };
    }
    case 'SET_AGENT_STATE': {
      await setAgentEnabled(msg.enabled);
      return { success: true };
    }

    // ── HitAPI backend ──
    case 'LIST_PROJECTS':
      return { success: true, data: await apiGet('/projects') };
    case 'CREATE_PROJECT':
      return { success: true, data: await apiPost('/projects', { name: msg.name, base_url: msg.baseUrl, environment: 'development' }) };
    case 'LIST_FLOW_SUITES':
      return { success: true, data: await apiGet(`/projects/${msg.projectId}/flows`) };
    case 'RUN_FLOW_SUITE':
      return { success: true, data: await apiPost(`/projects/${msg.projectId}/flows/${msg.flowId}/run`) };
    case 'GET_FLOW_RUN_STATUS':
      return { success: true, data: await apiGet(`/projects/${msg.projectId}/flows/${msg.flowId}/runs/${msg.runId}`) };

    case 'QUICK_CREATE_FROM_CAPTURE': {
      const { projectId, request: req, suiteId, newSuiteName, stepName } = msg;
      const data = await apiPost(`/projects/${projectId}/flows/quick-create`, {
        method: req.method,
        url: req.url,
        headers: sanitizeHeaders(req.headers || {}),
        requestBody: req.body || null,
        suiteId: suiteId || undefined,
        newSuiteName: newSuiteName || undefined,
        stepName: stepName || `${req.method} ${new URL(req.url).pathname}`,
      });
      return { success: true, data };
    }

    case 'REPORT_BUG': {
      const { projectId, request: req } = msg;
      const data = await apiPost(`/projects/${projectId}/bugs/manual`, {
        title: `Manual: ${req.method} ${new URL(req.url).pathname}`,
        description: 'Reported via HitAPI browser extension.',
        severity: 'medium',
      });
      return { success: true, data };
    }

    case 'UPDATE_BADGE':
      if (msg.failed > 0) {
        chrome.action.setBadgeText({ text: `${msg.failed}✗` });
        chrome.action.setBadgeBackgroundColor({ color: '#ff5c5c' });
      } else {
        chrome.action.setBadgeText({ text: `${msg.passed}✓` });
        chrome.action.setBadgeBackgroundColor({ color: '#23d18b' });
      }
      return { success: true };
    case 'IMPORT_LOCAL_SWAGGER': {
      const { hitapi_token } = await chrome.storage.local.get('hitapi_token');
      if (!hitapi_token) return { success: false, error: 'Not logged in' };

      const spec = await fetchSwaggerFromActiveTab(msg.swaggerUrl);

      const res = await fetch(`${API_BASE}/projects/${msg.projectId}/import`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${hitapi_token}` },
        body: JSON.stringify({ spec }),
      });
      const json = await res.json();
      if (!res.ok) return { success: false, error: json.error || `HTTP ${res.status}` };
      return { success: true, data: json.data };
    }

    default:
      throw new Error(`Unknown: ${msg.type}`);
  }
}

// ── API helpers ───────────────────────────────────────────────────────────────
async function getToken() {
  const { hitapi_token } = await chrome.storage.local.get('hitapi_token');
  return hitapi_token || null;
}

async function apiGet(path) {
  const token = await getToken();
  const res = await fetch(`${API_BASE}${path}`, {
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) }
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json.error || `HTTP ${res.status}`);
  return json.data !== undefined ? json.data : json;
}

async function apiPost(path, body = null) {
  const token = await getToken();
  const res = await fetch(`${API_BASE}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json.error || `HTTP ${res.status}`);
  return json.data !== undefined ? json.data : json;
}

function sanitizeHeaders(headers) {
  const skip = new Set(['cookie', 'host', 'content-length', 'connection', 'origin', 'referer']);
  return Object.fromEntries(Object.entries(headers).filter(([k]) => !skip.has(k.toLowerCase())));
}

// ── Context menu ──────────────────────────────────────────────────────────────
chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({ id: 'hitapi', title: 'Open HitAPI', contexts: ['page'] });
});
chrome.contextMenus.onClicked.addListener(() => chrome.action.openPopup());


// ── Local Agent — executes requests against localhost on behalf of hitapi.dev ──
const AGENT_POLL_ALARM = 'hitapi-local-agent-poll';

async function isAgentEnabled() {
  const { localAgentEnabled } = await chrome.storage.local.get('localAgentEnabled');
  return !!localAgentEnabled;
}

async function setAgentEnabled(enabled) {
  await chrome.storage.local.set({ localAgentEnabled: enabled });
  if (enabled) startAgentPolling(); else stopAgentPolling();
}

function startAgentPolling() {
  chrome.alarms.create(AGENT_POLL_ALARM, { periodInMinutes: 0.5 });
  pollAndExecuteJobs(); // fire immediately, don't wait for the first interval
  console.log('[HitAPI Agent] Started');
}

function stopAgentPolling() {
  chrome.alarms.clear(AGENT_POLL_ALARM);
  console.log('[HitAPI Agent] Stopped');
}

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === AGENT_POLL_ALARM) pollAndExecuteJobs();
});

async function pollAndExecuteJobs() {
  const { hitapi_token } = await chrome.storage.local.get('hitapi_token');
  if (!hitapi_token) return; // not logged in — nothing to poll

  let jobs;
  try {
    const res = await fetch(`${API_BASE}/agent/jobs`, {
      headers: { Authorization: `Bearer ${hitapi_token}` },
    });
    const json = await res.json();
    jobs = json.data || [];
  } catch (err) {
    console.warn('[HitAPI Agent] Poll failed:', err.message);
    return;
  }

  for (const job of jobs) {
    executeAndReport(job, hitapi_token); // fire and forget — don't block the poll loop
  }
}

async function fetchSwaggerFromActiveTab(swaggerUrl) {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id) throw new Error('No active tab found');

  const [{ result, error: pageError }] = await chrome.scripting.executeScript({
    target: { tabId: tab.id },
    func: async (url) => {
      try {
        const res = await fetch(url);
        if (!res.ok) return { error: `HTTP ${res.status}` };
        const json = await res.json();
        return { result: json };
      } catch (e) {
        return { error: e.message };
      }
    },
    args: [swaggerUrl],
  });

  if (pageError) throw new Error(pageError);
  if (!result) throw new Error('Empty response from that URL');
  return result;
}

async function executeAndReport(job, token) {
  try {
    const res = await fetch(job.url, {
      method: job.method,
      headers: job.headers || {},
      body: job.body ?? undefined,
    });

    const headers = {};
    for (const [k, v] of res.headers.entries()) headers[k] = v;

    const ct = res.headers.get('content-type') || '';
    const body = ct.includes('application/json')
      ? await res.json().catch(() => null)
      : { _text: (await res.text()).slice(0, 2000) };

    await fetch(`${API_BASE}/agent/jobs/${job.id}/result`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ status: res.status, body, headers }),
    });
  } catch (err) {
    await fetch(`${API_BASE}/agent/jobs/${job.id}/result`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ error: err.message }),
    }).catch(() => { });
  }
}
isAgentEnabled().then(enabled => { if (enabled) startAgentPolling(); });
