/**
 * background/flows/flows.js — flow suites: list, run, and add captured requests.
 */

import { api } from '../api/client.js';
import { headersForStep, bearerFrom } from '../../shared/headers.js';
import { pathOf } from '../../shared/url.js';
import { findRequest } from '../capture/service.js';
import * as badge from '../ui/badge.js';

const need = (v, what) => { if (!v) throw new Error(`Missing ${what}`); return v; };

export async function listSuites(projectId) {
  const data = await api(`/projects/${need(projectId, 'project')}/flows`);
  return Array.isArray(data) ? data : (Array.isArray(data?.suites) ? data.suites : []);
}

export async function runSuite(projectId, flowId) {
  const data = await api(`/projects/${need(projectId, 'project')}/flows/${need(flowId, 'suite')}/run`, { method: 'POST' });
  const runId = data?.run_id || data?.id || data?.run?.id;
  if (!runId) throw new Error('HitAPI did not start the run');
  return { runId, status: data?.status || 'queued', totalSteps: data?.total_steps ?? null };
}

export async function getRunStatus(projectId, flowId, runId) {
  const data = await api(`/projects/${need(projectId, 'project')}/flows/${need(flowId, 'suite')}/runs/${need(runId, 'run')}`);
  const run = data?.run || data || {};
  return {
    status: run.status,
    passed: run.passed ?? 0,
    failed: run.failed ?? 0,
    total: run.total_steps ?? null,
    error: run.error || null,
  };
}

export function showRunResult({ passed, failed }) {
  badge.showRunResult(passed, failed);
  return { ok: true };
}

/**
 * Save a captured request as a new step.
 *  - Browser headers and credentials are stripped from the step.
 *  - When creating a NEW suite with useToken, the request's Bearer token is
 *    stored once as that suite's login token (existing suites are untouched).
 */
export async function quickCreate({ tabId, requestId, projectId, suiteId, newSuiteName, stepName, useToken = true }) {
  const req = await findRequest(tabId, requestId);
  need(projectId, 'project');
  if (!suiteId && !String(newSuiteName || '').trim()) throw new Error('Choose a suite or enter a new suite name');

  const token = useToken && !suiteId ? bearerFrom(req.headers) : null;
  const data = await api(`/projects/${projectId}/flows/quick-create`, {
    method: 'POST',
    body: {
      method: req.method,
      url: req.url,
      headers: headersForStep(req.headers || {}),
      requestBody: req.bodyTruncated ? null : (req.body || null),
      suiteId: suiteId || undefined,
      newSuiteName: suiteId ? undefined : String(newSuiteName).trim(),
      stepName: stepName || `${req.method} ${pathOf(req.url).split('?')[0]}`,
      authToken: token || undefined,
    },
  });
  return { ...data, bodySkipped: !!req.bodyTruncated };
}
