/**
 * background/agent/local-agent.js — runs HitAPI test steps against your
 * localhost API, because HitAPI's servers can't reach your machine.
 *
 * How it works: when a suite run reaches a localhost step, HitAPI queues a
 * job and waits up to 25 s. While the switch is on, this module asks for jobs
 * every 2 s, runs each one from your browser and posts the result back.
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
const inFlight = new Set();
const status = { lastPollAt: null, lastPollOk: null, lastError: null, jobsRun: 0 };

export async function isEnabled() {
  return !!(await getLocal(LOCAL.AGENT_ENABLED));
}

export async function getState() {
  return { enabled: await isEnabled(), ...status };
}

export async function setEnabled(enabled) {
  await setLocal({ [LOCAL.AGENT_ENABLED]: !!enabled });
  if (enabled) start(); else stop();
  const state = await getState();
  publish(EVENT.AGENT, state);
  return state;
}

/** Start (or keep) the fast loop. Safe to call any number of times. */
export function start() {
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
  isEnabled().then(on => { if (on) start(); });
}
