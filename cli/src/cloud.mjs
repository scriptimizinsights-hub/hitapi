/**
 * src/cloud.mjs — `hitapi cloud run`: run a HitAPI flow suite in the cloud and
 * wait for the result. Needs a personal API key (HitAPI → API keys) in
 * HITAPI_API_KEY or --api-key.
 */

import { UsageError } from './load.mjs';

const sleep = (ms) => new Promise(r => setTimeout(r, ms));
export const DEFAULT_API = 'https://services.hitapi.dev/api';

async function call(base, key, method, path, body) {
  let res;
  try {
    res = await fetch(`${base}${path}`, { method, headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json', 'User-Agent': 'hitapi-cli' }, body: body ? JSON.stringify(body) : undefined });
  } catch (e) { throw new Error(`Can't reach ${base} (${e.cause?.code || e.message})`); }
  const data = await res.json().catch(() => null);
  if (res.status === 401) throw new UsageError('HitAPI did not accept the API key. Create one under HitAPI → API keys and pass it in HITAPI_API_KEY.');
  if (!res.ok || data?.success === false) throw new Error(`${method} ${path}: ${data?.error || `HTTP ${res.status}`}`);
  return data?.data ?? data;
}

/**
 * @returns {Promise<{ run, stepResults }>}
 */
export async function cloudRun({ api = DEFAULT_API, key, project, suite, timeoutSec = 600, pollMs = 2000, wait = true, log = () => {} }) {
  if (!key) throw new UsageError('Set HITAPI_API_KEY (or pass --api-key). Create a key under HitAPI → API keys.');
  if (!project || !suite) throw new UsageError('cloud run needs --project <id> and --suite <id>');
  const base = String(api).replace(/\/+$/, '');
  const started = await call(base, key, 'POST', `/projects/${encodeURIComponent(project)}/flows/${encodeURIComponent(suite)}/run`, {});
  const runId = started.run_id || started.id;
  log(`started run ${runId} (${started.total_steps ?? '?'} steps)`);
  if (!wait) return { run: { id: runId, status: started.status || 'queued' }, stepResults: [] };
  const until = Date.now() + timeoutSec * 1000;
  let last = '';
  for (;;) {
    const r = await call(base, key, 'GET', `/projects/${encodeURIComponent(project)}/flows/${encodeURIComponent(suite)}/runs/${encodeURIComponent(runId)}`);
    const status = r.run?.status;
    if (status !== last) { log(`status: ${status}`); last = status; }
    if (status && !['queued', 'running', 'pending'].includes(status)) return r;
    if (Date.now() > until) throw new Error(`The run did not finish within ${timeoutSec} s (still ${status}).`);
    await sleep(pollMs);
  }
}
