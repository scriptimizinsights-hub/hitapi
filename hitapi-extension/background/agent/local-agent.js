/**
 * background/agent/local-agent.js — runs HitAPI test steps against your
 * localhost API, because HitAPI's servers can't reach your machine.
 *
 * How it works: when a suite run reaches a localhost step, HitAPI queues a
 * job and waits up to 25 s. While the switch is on AND the agent is listening,
 * this module asks for jobs every 2 s, runs each one from your browser and
 * posts the result back.
 *
 * 2.1.2: it listens only when asked. The website (hitapi.dev) tells it when you
 * start a flow run, and while it watches the run (HITAPI_AGENT_WAKE, web-bridge.js);
 * turning the switch on listens for 2 minutes too. No asking every 2 s all day:
 * each ask was a database write on HitAPI's side (docs/platform/usage-limits.md).
 *
 * Old version: asked only every 30 s (Chrome's minimum alarm), so most steps
 * timed out before the job was picked up. The alarm is now only a back-up that
 * restarts the 2 s loop if Chrome stopped the service worker.
 *
 * Safety: only local / private-network URLs are ever fetched, and without
 * your browser cookies.
 */

import { AGENT } from '../../shared/config.js';
import { EVENT } from '../../shared/messages.js';
import { isLocalUrl } from '../../shared/url.js';
import { api } from '../api/client.js';
import { LOCAL, getLocal, setLocal } from '../storage.js';
import { publish } from '../live.js';

let loopTimer = null;
let polling = false;
let listenUntil = 0;                       // ask for jobs until then (kept in chrome.storage.session)
const LISTEN_KEY = 'agent:listenUntil';
const listening = () => Date.now() < listenUntil;
const inFlight = new Set();
const status = { lastPollAt: null, lastPollOk: null, lastError: null, jobsRun: 0 };

export async function isEnabled() {
  return !!(await getLocal(LOCAL.AGENT_ENABLED));
}

export async function getState() {
  return { enabled: await isEnabled(), listening: listening(), listenUntil: listening() ? listenUntil : null, ...status };
}

/** Listen for jobs for a while (a run was started on the website). Returns the state. */
export async function wake(ms = AGENT.LISTEN_MS) {
  const until = Date.now() + Math.max(10_000, Math.min(AGENT.MAX_LISTEN_MS, Number(ms) || AGENT.LISTEN_MS));
  if (until > listenUntil) { listenUntil = until; try { await chrome.storage.session?.set({ [LISTEN_KEY]: until }); } catch { /* ignore */ } }
  if (await isEnabled()) start();
  const state = await getState();
  publish(EVENT.AGENT, state);
  return state;
}

export async function setEnabled(enabled) {
  await setLocal({ [LOCAL.AGENT_ENABLED]: !!enabled });
  if (enabled) return wake(); else stop();
  const state = await getState();
  publish(EVENT.AGENT, state);
  return state;
}

/** Start (or keep) the fast loop while listening. Safe to call any number of times. */
export function start() {
  if (!listening()) { stop(); return; }
  chrome.alarms.create(AGENT.ALARM, { periodInMinutes: AGENT.ALARM_PERIOD_MIN });
  if (!loopTimer && !polling) tick();
}

export function stop() {
  chrome.alarms.clear(AGENT.ALARM);
  clearTimeout(loopTimer);
  loopTimer = null;
}

async function tick() {
  loopTimer = null;
  // This storage read is also what keeps Chrome from stopping the worker
  // while the agent is on (extension API calls reset its idle timer).
  if (!(await isEnabled())) return;
  if (!listening()) { stop(); getState().then(s => publish(EVENT.AGENT, s)); return; }   // done listening: no more asks
  const token = await getLocal(LOCAL.TOKEN);
  if (!token) return; // signed out: the alarm / next login restarts the loop

  polling = true;
  try { await pollOnce(); }
  finally { polling = false; }
  loopTimer = setTimeout(tick, AGENT.FAST_POLL_MS);
}

async function pollOnce() {
  let jobs = [];
  try {
    jobs = await api('/agent/jobs');
    setStatus({ lastPollOk: true, lastError: null });
  } catch (e) {
    setStatus({ lastPollOk: false, lastError: e.message });
    return;
  }
  for (const job of Array.isArray(jobs) ? jobs : []) {
    if (inFlight.has(job.id)) continue;
    inFlight.add(job.id);
    runJob(job).finally(() => inFlight.delete(job.id));
  }
}

function setStatus(patch) {
  const changed = patch.lastPollOk !== status.lastPollOk || patch.lastError !== status.lastError;
  Object.assign(status, patch, { lastPollAt: Date.now() });
  if (changed) getState().then(s => publish(EVENT.AGENT, s));
}

async function report(jobId, result) {
  try {
    await api(`/agent/jobs/${jobId}/result`, { method: 'POST', body: result });
  } catch (e) {
    console.warn('[HitAPI Agent] Could not send result for job', jobId, e.message);
  }
}

async function readBody(res) {
  const text = await res.text();
  const type = res.headers.get('content-type') || '';
  if (type.includes('json') || /^\s*[[{]/.test(text)) {
    try { return JSON.parse(text); } catch { /* fall through */ }
  }
  return { _text: text.slice(0, AGENT.MAX_RESPONSE_CHARS) };
}

export async function runJob(job) {
  if (!isLocalUrl(job.url)) {
    return report(job.id, { error: `Refused: the Local Agent only calls localhost / private-network URLs (got ${job.url})` });
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), AGENT.REQUEST_TIMEOUT_MS);
  try {
    const method = String(job.method || 'GET').toUpperCase();
    const res = await fetch(job.url, {
      method,
      headers: job.headers || {},
      body: ['GET', 'HEAD'].includes(method) ? undefined : (job.body ?? undefined),
      credentials: 'omit',
      redirect: 'follow',
      signal: controller.signal,
    });
    const headers = {};
    res.headers.forEach((v, k) => { headers[k] = v; });
    const body = await readBody(res);
    status.jobsRun++;
    await report(job.id, { status: res.status, headers, body });
  } catch (e) {
    const reason = e.name === 'AbortError'
      ? `No response from ${job.url} within ${AGENT.REQUEST_TIMEOUT_MS / 1000} s`
      : `Couldn't reach ${job.url}: ${e.message}. Is your local server running?`;
    await report(job.id, { error: reason });
  } finally {
    clearTimeout(timer);
  }
}

/** Wire alarms; resume the loop after a worker restart. */
export function registerLocalAgent() {
  chrome.alarms.onAlarm.addListener((alarm) => {
    if (alarm.name === AGENT.ALARM) start();
  });
  // after a worker restart: carry on listening if a run asked for it
  Promise.resolve(chrome.storage.session?.get(LISTEN_KEY)).then((v) => { listenUntil = Number(v?.[LISTEN_KEY]) || 0; })
    .catch(() => {}).finally(() => isEnabled().then(on => { if (on) start(); }));
}
