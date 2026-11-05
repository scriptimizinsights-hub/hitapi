/**
 * background/openapi/import.js — download an OpenAPI / Swagger spec (JSON or
 * YAML) and send it to HitAPI.
 *
 * Download order:
 *   1. from the extension itself — it has host permission, so CORS can't block it
 *   2. from inside the current tab — uses the page's own login cookies
 * The spec is parsed here and only a real spec object is sent to the backend.
 */

import yaml from '../../lib/js-yaml.mjs';
import { api } from '../api/client.js';

async function fetchFromExtension(url) {
  const res = await fetch(url, { credentials: 'include', headers: { Accept: 'application/json, application/yaml, text/yaml, */*' } });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.text();
}

async function fetchFromPage(url, tabId) {
  const [injection] = await chrome.scripting.executeScript({
    target: { tabId },
    func: async (specUrl) => {
      try {
        const res = await fetch(specUrl, { credentials: 'include' });
        if (!res.ok) return { error: `HTTP ${res.status}` };
        return { text: await res.text() };
      } catch (e) {
        return { error: e.message };
      }
    },
    args: [url],
  });
  const out = injection?.result;
  if (typeof out?.text === 'string') return out.text;
  throw new Error(out?.error || 'no response');
}

export async function downloadSpec(url, tabId) {
  const problems = [];
  try { return await fetchFromExtension(url); }
  catch (e) { problems.push(e.message); }

  if (Number.isInteger(tabId)) {
    try { return await fetchFromPage(url, tabId); }
    catch (e) { problems.push(`from the page: ${e.message}`); }
  }
  throw new Error(`Couldn't download the spec from ${url} (${problems.join('; ')})`);
}

/** Text → spec object, with an error message a person can act on. */
export function parseSpec(text) {
  const t = String(text || '').replace(/^﻿/, '').trim();
  if (!t) throw new Error('The spec URL returned an empty response');
  if (t.startsWith('<')) {
    throw new Error('That URL returned a web page, not a spec. Use the spec file itself, e.g. /openapi.json, /swagger.json, /v3/api-docs or /openapi.yaml.');
  }

  let spec;
  if (t.startsWith('{') || t.startsWith('[')) {
    try { spec = JSON.parse(t); }
    catch (e) { throw new Error(`The spec isn't valid JSON: ${e.message}`); }
  } else {
    try { spec = yaml.load(t); }
    catch (e) { throw new Error(`The spec isn't valid YAML: ${e.reason || e.message}`); }
  }

  if (!spec || typeof spec !== 'object' || Array.isArray(spec)) {
    throw new Error("That file isn't an OpenAPI or Swagger spec");
  }
  if (!spec.openapi && !spec.swagger) {
    throw new Error('That file has no "openapi" or "swagger" version field, so it isn\'t an OpenAPI/Swagger spec');
  }
  if (!spec.paths || !Object.keys(spec.paths).length) {
    throw new Error('The spec has no paths (endpoints) to import');
  }
  return spec;
}

export async function importOpenApi({ projectId, url, tabId }) {
  if (!projectId) throw new Error('Select a project first');
  url = String(url || '').trim();
  if (!/^https?:\/\//i.test(url)) throw new Error('Enter the spec URL, starting with http:// or https://');

  const spec = parseSpec(await downloadSpec(url, tabId));
  const data = await api(`/projects/${projectId}/import`, { method: 'POST', body: { spec } });
  return {
    imported: data?.imported ?? 0,
    updated: data?.updated ?? 0,
    title: spec.info?.title || null,
  };
}
