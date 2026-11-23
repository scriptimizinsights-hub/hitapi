/**
 * shared/ci.js — files for running HitAPI tests outside the browser
 * (roadmap feature 12): the hitapi CLI, CI pipelines, GitHub.
 *
 *   exportScenario(s, tree)  a scenario as one self-contained file: saved
 *                            requests copied in, with their collection's
 *                            base URL, headers, auth and variables applied
 *   workflowYaml(...)        a GitHub Actions workflow that runs the files
 *
 * Secrets are never written: a header or auth value is kept only when it is a
 * {{variable}} reference; the CLI fills those from --env-file / --var /
 * HITAPI_VAR_* (CI secrets).
 */

import { find, effectiveDraft, exportCollection } from './collections.js';
import { maskDraft } from './history.js';
import { maskRows, normalizeRows } from './vars.js';
import { fileSafe } from './convert/draft.js';
import { parseData } from './scenarios.js';

export const SCENARIO_FORMAT = 'hitapi-scenario';
export const SCENARIO_VERSION = 1;

/** Variables a request sees from its collection and folders (inner folders win). */
function ancestorVars(ancestors) {
  const map = new Map();
  for (const a of ancestors) for (const r of normalizeRows(a.settings?.variables)) if (r.enabled !== false && r.key) map.set(r.key, r);
  return [...map.values()];
}

/**
 * @returns {{ file: object, skipped: string[] }}  skipped: steps whose saved request was deleted
 */
export function exportScenario(scenario, tree) {
  const skipped = [];
  const steps = [];
  for (const st of scenario.steps) {
    let draft; let name; let variables = [];
    if (st.kind === 'saved') {
      const f = find(tree, st.requestId);
      if (!f || f.node.type !== 'request') { skipped.push(st.name || 'Deleted request'); continue; }
      draft = effectiveDraft(structuredClone(f.node.draft), f.ancestors);
      name = f.node.name;
      variables = maskRows(ancestorVars(f.ancestors));
    } else { draft = structuredClone(st.draft); name = st.name || 'Request'; }
    steps.push({
      name, enabled: st.enabled !== false, delayMs: st.delayMs || 0, repeat: st.repeat || 1, onFail: st.onFail || 'stop',
      draft: maskDraft(draft, { keepVars: true }).draft, variables,
    });
  }
  return {
    file: {
      format: SCENARIO_FORMAT, version: SCENARIO_VERSION, exportedAt: new Date().toISOString(),
      scenario: { name: scenario.name, data: scenario.data || { text: '', format: 'csv' }, steps },
    },
    skipped,
  };
}

/** What gets written for a collection or scenario: { name, fileName, text, skipped, vars }. */
export function ciFile(kind, id, { tree, scenarios }) {
  if (kind === 'scenario') {
    const s = scenarios.items.find(x => x.id === id);
    if (!s) return null;
    const { file, skipped } = exportScenario(s, tree);
    const text = `${JSON.stringify(file, null, 2)}\n`;
    let cols = new Set();
    try { cols = new Set(parseData(s.data).flatMap(r => Object.keys(r))); } catch { /* bad data: the run reports it */ }
    return { name: s.name, fileName: `${fileSafe(s.name)}.scenario.json`, text, skipped, vars: neededVars(text).filter(n => !cols.has(n)) };
  }
  const f = find(tree, id);
  if (!f || f.node.type !== 'collection') return null;
  const text = `${JSON.stringify(exportCollection(f.node), null, 2)}\n`;
  return { name: f.node.name, fileName: `${fileSafe(f.node.name)}.hitapi.json`, text, skipped: [], vars: neededVars(text) };
}

/**
 * {{names}} a file uses that CI has to provide: not given a value in the file
 * (collection / folder variables) and not set by an earlier request's "Set vars".
 */
export function neededVars(text) {
  const used = new Set();
  for (const m of String(text).matchAll(/\{\{\s*([A-Za-z_][\w.-]*)\s*\}\}/g)) used.add(m[1]);
  const provided = new Set();
  const walk = (v) => {
    if (Array.isArray(v)) { v.forEach(walk); return; }
    if (!v || typeof v !== 'object') return;
    if (Array.isArray(v.extract)) for (const r of v.extract) if (r?.name) provided.add(r.name);
    if (Array.isArray(v.variables)) for (const r of v.variables) if (r?.key && r.value !== '' && r.enabled !== false) provided.add(r.key);
    Object.values(v).forEach(walk);
  };
  try { walk(JSON.parse(text)); } catch { /* not JSON */ }
  return [...used].filter(n => !provided.has(n)).sort();
}

const envName = (v) => `HITAPI_VAR_${v.replace(/[^A-Za-z0-9_]/g, '_')}`;

/**
 * A GitHub Actions workflow running every HitAPI file in `dir`.
 * @param {{ dir: string, vars?: string[], cli?: string }} o  vars: variables to read from repository secrets
 */
export function workflowYaml({ dir = 'hitapi', vars = [], cli = 'hitapi-cli' } = {}) {
  const d = String(dir || '.').replace(/^\/+|\/+$/g, '') || '.';
  const env = vars.length
    ? `        env:\n          # Values for {{variables}}: add them under Settings → Secrets and variables → Actions\n${vars.map(v => `          ${envName(v)}: \${{ secrets.${envName(v)} }}`).join('\n')}\n`
    : '';
  return `# Runs the HitAPI tests in ${d}/ on every push and pull request.
# Made by the HitAPI extension (Publish to GitHub). Docs: https://hitapi.dev
name: HitAPI tests
on:
  push:
  pull_request:
  workflow_dispatch:
jobs:
  api-tests:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 20
      - name: Run HitAPI tests
${env}        run: npx --yes ${cli} run ${d}/*.json --junit hitapi-results.xml
      - name: Upload results
        if: always()
        uses: actions/upload-artifact@v4
        with:
          name: hitapi-results
          path: hitapi-results.xml
`;
}
