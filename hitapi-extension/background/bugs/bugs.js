/**
 * background/bugs/bugs.js — report a captured request as a bug, with the
 * details a developer needs to reproduce it (credentials are masked).
 */

import { api } from '../api/client.js';
import { maskSecrets } from '../../shared/headers.js';
import { pathOf } from '../../shared/url.js';
import { findRequest } from '../capture/service.js';

const SEVERITIES = ['low', 'medium', 'high', 'critical'];
const MAX_BODY = 4000;

function block(obj) {
  const entries = Object.entries(obj || {});
  if (!entries.length) return '_none_';
  return '```\n' + entries.map(([k, v]) => `${k}: ${v}`).join('\n') + '\n```';
}

function bodyBlock(body, truncated) {
  if (!body) return '_none_';
  let text = body;
  try { text = JSON.stringify(JSON.parse(body), null, 2); } catch { /* not JSON */ }
  const cut = text.length > MAX_BODY;
  return '```\n' + text.slice(0, MAX_BODY) + '\n```' + (cut || truncated ? '\n_(truncated)_' : '');
}

export function buildBugReport(req, note = '') {
  const status = req.status === 0 ? `failed (${req.error || 'network error'})` : req.status;
  const summary = [
    `- **Request:** \`${req.method} ${req.url}\``,
    `- **Response status:** ${status}`,
    req.duration != null ? `- **Time:** ${req.duration} ms` : null,
    `- **Captured:** ${new Date(req.timestamp || Date.now()).toISOString()}`,
  ].filter(Boolean).join('\n');

  return [
    note.trim() || null,
    '**Reported from the HitAPI browser extension**',
    summary,
    `**Request headers**\n${block(maskSecrets(req.headers))}`,
    `**Request body**\n${bodyBlock(req.body, req.bodyTruncated)}`,
    `**Response headers**\n${block(maskSecrets(req.responseHeaders))}`,
  ].filter(Boolean).join('\n\n');
}

export async function reportBug({ tabId, requestId, projectId, severity = 'medium', note = '' }) {
  if (!projectId) throw new Error('Select a project first');
  const req = await findRequest(tabId, requestId);
  const sev = SEVERITIES.includes(severity) ? severity : 'medium';
  const statusText = req.status === 0 ? 'request failed' : `HTTP ${req.status}`;
  return api(`/projects/${projectId}/bugs/manual`, {
    method: 'POST',
    body: {
      title: `${req.method} ${pathOf(req.url).split('?')[0]} — ${statusText}`,
      description: buildBugReport(req, note),
      severity: sev,
    },
  });
}
