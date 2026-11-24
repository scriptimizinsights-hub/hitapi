/**
 * Web Workbench (W7) — imported content → what will be added (no React here).
 * The format is detected and converted by the HitAPI extension's own code
 * (@hitapi/shared/convert), so a file imports the same on the website and in
 * the extension. This file is the website's copy of the extension's
 * import-dialog convert(), plus HitAPI scenario files.
 */

import { detectFormat as detectExt, FORMAT_LABELS as LABELS } from '@hitapi/shared/convert/detect.js';
import { importPostman, importPostmanEnvironment } from '@hitapi/shared/convert/postman.js';
import { importOpenApi } from '@hitapi/shared/convert/openapi.js';
import { harSummary, importHar } from '@hitapi/shared/convert/har.js';
import { importInsomnia } from '@hitapi/shared/convert/insomnia.js';
import { importCollection, countRequests, newRequest, requestName } from '@hitapi/shared/collections.js';
import { newScenario, newStep } from '@hitapi/shared/scenarios.js';
import { SCENARIO_FORMAT } from '@hitapi/shared/ci.js';
import { parseCurl } from '@hitapi/shared/curl.js';
import { draftFrom } from '@hitapi/shared/convert/draft.js';

export const FORMAT_LABELS = { ...LABELS, scenario: 'HitAPI scenario (CLI file)' };
export { harSummary };

/** Text → { format, data }; also knows HitAPI scenario files. Throws a readable error. */
export function detectFormat(text) {
  const t = String(text || '').replace(/^﻿/, '').trim();
  if (/^\{/.test(t)) {
    let data = null; try { data = JSON.parse(t); } catch { /* the extension's detector explains */ }
    if (data?.format === SCENARIO_FORMAT && data.scenario) return { format: 'scenario', data };
  }
  return detectExt(t);
}

const n = (x, one, many) => `${x} ${x === 1 ? one : many}`;

/**
 * @returns {{ collections: Array, envs: Array<{ name, vars }>, globals: Array, scenarios: Array, request?: object, notes: string[], summary: string }}
 */
export function convert({ format, data }, { sourceUrl = '', fileName = '', har = {} } = {}) {
  const out = { collections: [], envs: [], globals: [], scenarios: [], notes: [], summary: '' };
  switch (format) {
    case 'hitapi': {
      const c = importCollection(data);
      out.collections.push(c);
      out.summary = `"${c.name}": ${n(countRequests(c), 'request', 'requests')}.`;
      if (!data.secrets) out.notes.push('The file was exported without secrets: fill in tokens and passwords again.');
      break;
    }
    case 'scenario': {
      const src = data.scenario;
      const sc = newScenario(String(src.name || 'Imported scenario'));
      sc.data = { text: String(src.data?.text || ''), format: src.data?.format === 'json' ? 'json' : 'csv' };
      for (const st of src.steps || []) {
        if (!st?.draft) continue;
        // a step's collection variables travel with it in the file: fill in the ones with a value
        // (secret ones were left out of the file and stay {{variables}})
        const vars = (st.variables || []).filter(v => v?.key && v.enabled !== false && v.value !== '');
        let text = JSON.stringify(st.draft);
        for (const v of vars) text = text.replace(new RegExp(`\\{\\{\\s*${v.key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*\\}\\}`, 'g'), () => JSON.stringify(String(v.value)).slice(1, -1));
        const draft = JSON.parse(text);
        sc.steps.push(newStep('inline', { name: st.name || requestName(draft), draft, enabled: st.enabled !== false, delayMs: st.delayMs || 0, repeat: st.repeat || 1, onFail: st.onFail === 'continue' ? 'continue' : 'stop' }));
      }
      out.scenarios.push(sc);
      out.summary = `Scenario "${sc.name}": ${n(sc.steps.length, 'step', 'steps')} (copies of the requests)${sc.data.text.trim() ? ', with data rows' : ''}.`;
      out.notes.push('Secrets are not in scenario files: fill in tokens and passwords in an environment.');
      break;
    }
    case 'postman': {
      const r = importPostman(data);
      out.collections.push(r.collection); out.notes.push(...r.notes);
      out.summary = `"${r.collection.name}": ${n(r.stats.requests, 'request', 'requests')} in ${n(r.stats.folders, 'folder', 'folders')}, ${n(r.collection.settings.variables.length, 'variable', 'variables')}.`;
      break;
    }
    case 'postman-env': {
      const e = importPostmanEnvironment(data);
      if (e.scope === 'globals') { out.globals = e.vars; out.summary = `${n(e.vars.length, 'global variable', 'global variables')} (added to Globals; existing names are updated).`; }
      else { out.envs.push({ name: e.name, vars: e.vars }); out.summary = `Environment "${e.name}" with ${n(e.vars.length, 'variable', 'variables')}.`; }
      break;
    }
    case 'openapi': {
      const r = importOpenApi(data, { sourceUrl });
      out.collections.push(r.collection); out.notes.push(...r.notes);
      out.summary = `"${r.collection.name}": ${n(r.stats.requests, 'request', 'requests')} in ${n(r.stats.folders, 'folder', 'folders')} (one per tag). Base URL: ${r.collection.settings.baseUrl || '(none)'}.`;
      break;
    }
    case 'har': {
      const r = importHar(data, { name: har.name || (fileName ? fileName.replace(/\.har$/i, '') : 'HAR import'), onlyApi: har.onlyApi !== false, host: har.host || '', unique: har.unique !== false });
      out.collections.push(r.collection); out.notes.push(...r.notes);
      out.summary = `"${r.collection.name}": ${n(r.stats.requests, 'request', 'requests')}${r.stats.folders ? ` in ${n(r.stats.folders, 'folder', 'folders')} (one per host)` : ''}.`;
      break;
    }
    case 'insomnia': {
      const r = importInsomnia(data);
      out.collections.push(...r.collections); out.envs.push(...r.envs); out.notes.push(...r.notes);
      out.summary = `${n(r.collections.length, 'collection', 'collections')} with ${n(r.stats.requests, 'request', 'requests')}${r.envs.length ? `, ${n(r.envs.length, 'environment', 'environments')}` : ''}.`;
      break;
    }
    case 'curl': {
      const p = parseCurl(data);
      const d = draftFrom({ method: p.method, url: p.url, headers: p.headers.map(x => [x.key, x.value]), body: p.body || '' });
      if (p.auth?.type === 'basic') { d.auth.type = 'basic'; d.auth.basic = { username: p.auth.username, password: p.auth.password }; }
      out.request = newRequest(requestName(d), d);
      out.notes.push(...(p.warnings || []));
      out.summary = `One request: ${d.method} ${d.url}`;
      break;
    }
    default: throw new Error('Unsupported format');
  }
  return out;
}
