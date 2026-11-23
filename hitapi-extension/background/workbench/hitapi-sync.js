/**
 * background/workbench/hitapi-sync.js — Workbench collections ↔ HitAPI projects
 * (roadmap feature 6). Signed-in users only.
 *
 *   push: saved requests → endpoints of a HitAPI project (so the web app can
 *         generate tests and mocks for them). An endpoint with the same method
 *         and path that is already there is left alone.
 *   pull: a project's endpoints → the Workbench builds a collection from them.
 */

import { api } from '../api/client.js';

const keyOf = (e) => `${String(e.method).toUpperCase()} ${String(e.path).replace(/\/+$/, '') || '/'}`;

async function listEndpoints(projectId) {
  const data = await api(`/projects/${encodeURIComponent(projectId)}/endpoints`);
  return Array.isArray(data) ? data : (data?.endpoints || []);
}

/** @param {{ projectId: string, endpoints: Array }} m  → { created, skipped, failed: [{ key, error }] } */
export async function pushEndpoints({ projectId, endpoints }) {
  if (!projectId) throw new Error('Choose a HitAPI project');
  if (!Array.isArray(endpoints) || !endpoints.length) throw new Error('This has no saved requests to send');
  const existing = new Set((await listEndpoints(projectId)).map(keyOf));
  const out = { created: 0, skipped: 0, failed: [] };
  for (const ep of endpoints.slice(0, 500)) {
    const key = keyOf(ep);
    if (existing.has(key)) { out.skipped++; continue; }
    try {
      await api(`/projects/${encodeURIComponent(projectId)}/endpoints`, { method: 'POST', body: ep });
      existing.add(key);
      out.created++;
    } catch (e) {
      if (e.code) throw e;   // signed out / offline: stop
      out.failed.push({ key, error: e.message });
    }
  }
  return out;
}

/** @param {{ projectId: string }} m → { endpoints } */
export async function pullEndpoints({ projectId }) {
  if (!projectId) throw new Error('Choose a HitAPI project');
  return { endpoints: await listEndpoints(projectId) };
}

// ── scenarios ↔ flow suites (roadmap feature 9) ──────────────────────────────

/**
 * A scenario → a new flow suite. Steps are added one by one (the bulk create
 * drops steps that share a method), then their extract rules are set.
 * @param {{ projectId, name, description, steps: [{ step, extract }] }} m → { suiteId, steps }
 */
export async function pushFlowSuite({ projectId, name, description = '', steps }) {
  if (!projectId) throw new Error('Choose a HitAPI project');
  if (!Array.isArray(steps) || !steps.length) throw new Error('This scenario has no steps to send');
  if (steps.length > 100) throw new Error('A flow suite can have at most 100 steps');
  const pid = encodeURIComponent(projectId);
  const suite = await api(`/projects/${pid}/flows`, { method: 'POST', body: { name: String(name || 'Scenario').slice(0, 120), description, steps: [] } });
  const suiteId = suite?.suite?.id || suite?.id;
  if (!suiteId) throw new Error('HitAPI did not return the new flow suite');
  const sid = encodeURIComponent(suiteId);
  for (const { step, extract } of steps) {
    const created = await api(`/projects/${pid}/flows/${sid}/steps`, { method: 'POST', body: step });
    const stepId = created?.id || created?.step?.id;
    if (stepId && extract?.length) await api(`/projects/${pid}/flows/${sid}/steps/${encodeURIComponent(stepId)}`, { method: 'PATCH', body: { extract_vars: extract } });
  }
  return { suiteId, steps: steps.length };
}

/** @param {{ projectId, suiteId }} m → { suite, steps } */
export async function getFlowSuite({ projectId, suiteId }) {
  const data = await api(`/projects/${encodeURIComponent(projectId)}/flows/${encodeURIComponent(suiteId)}`);
  return { suite: data?.suite || data, steps: data?.steps || [] };
}

// ── Workbench data sync across devices (roadmap feature 11) ─────────────────

/** → { docs: { kind: { version, updated_at, device, data } } } */
export async function getSyncDocs() {
  return api('/extension/sync');
}

/** @param {{ kind, data, baseVersion, device }} m → { version, updated_at } | { conflict: true, current } */
export async function putSyncDoc({ kind, data, baseVersion = 0, device = '' }) {
  return api(`/extension/sync/${encodeURIComponent(kind)}`, { method: 'PUT', body: { data, base_version: baseVersion, device } });
}

export async function deleteSyncDocs() {
  return api('/extension/sync', { method: 'DELETE' });
}
