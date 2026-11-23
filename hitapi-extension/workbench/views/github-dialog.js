/**
 * workbench/views/github-dialog.js — Publish to GitHub (roadmap feature 12).
 *
 * Puts a collection or scenario file in a repository, plus (optionally) a
 * GitHub Actions workflow that runs it with the hitapi CLI on every push.
 */

import { h, mount, toast } from '../../ui/core/dom.js';
import { openDialog } from './collection-dialogs.js';
import { workflowYaml } from '../../shared/ci.js';
import { loadGitHub, saveGitHub, parseRepo, joinPath, checkRepo, publishFiles } from '../github.js';

export const WORKFLOW_PATH = '.github/workflows/hitapi.yml';
const TOKEN_HELP = 'https://github.com/settings/personal-access-tokens/new';
const envName = (v) => `HITAPI_VAR_${v.replace(/[^A-Za-z0-9_]/g, '_')}`;

/**
 * @param {object} o
 * @param {string} o.key        what is published (collection or scenario id): remembers where it went
 * @param {{ name, fileName, text, skipped, vars }} o.file   from ciFile()
 */
export async function openGitHubDialog({ key, file }) {
  const cfg = await loadGitHub();
  const last = cfg.published[key] || null;
  const field = (label, input, hint) => h('label', { class: 'cl-field' }, h('span', { class: 'ap-label' }, label), input, hint ? h('span', { class: 'muted small' }, hint) : null);
  const repo = h('input', { type: 'text', class: 'cl-input gh-repo', value: last?.repo || cfg.repo, placeholder: 'owner/repository', 'aria-label': 'Repository', autocomplete: 'off', spellcheck: 'false' });
  const branch = h('input', { type: 'text', class: 'cl-input gh-branch', value: last?.branch || cfg.branch, 'aria-label': 'Branch', spellcheck: 'false' });
  const dir = h('input', { type: 'text', class: 'cl-input gh-dir', value: last?.dir ?? cfg.dir, placeholder: '(repository root)', 'aria-label': 'Folder', spellcheck: 'false' });
  const token = h('input', { type: 'password', class: 'cl-input gh-token', value: cfg.token, placeholder: 'github_pat_…', 'aria-label': 'GitHub token', autocomplete: 'off', spellcheck: 'false' });
  const apiBase = h('input', { type: 'url', class: 'cl-input gh-api', value: cfg.apiBase, 'aria-label': 'GitHub API URL', spellcheck: 'false' });
  const workflow = h('input', { type: 'checkbox', class: 'gh-workflow', checked: cfg.workflow });
  const message = h('input', { type: 'text', class: 'cl-input gh-message', value: `Update HitAPI tests: ${file.name}`, 'aria-label': 'Commit message', maxlength: '200' });
  const preview = h('div', { class: 'gh-preview small' });
  const result = h('div', { class: 'gh-result', 'aria-live': 'polite' });

  const paintPreview = () => {
    const path = joinPath(dir.value, file.fileName);
    mount(preview,
      h('div', {}, 'Writes ', h('code', {}, path), workflow.checked ? [' and ', h('code', {}, WORKFLOW_PATH), h('span', { class: 'muted' }, ' (only if it is not there yet)')] : null),
      file.skipped.length ? h('div', { class: 'sch-fail' }, `Left out (their saved request was deleted): ${file.skipped.join(', ')}`) : null,
      file.vars.length
        ? h('div', { class: 'gh-vars' }, 'Secrets are not written to the file. In GitHub, add these repository secrets so the workflow can fill in the variables: ',
          file.vars.map((v, i) => [i ? ', ' : '', h('code', {}, envName(v))]))
        : h('div', { class: 'muted' }, 'No secrets are written to the file.'));
  };
  [dir, workflow].forEach(x => x.addEventListener('input', paintPreview));
  workflow.addEventListener('change', paintPreview);

  let busy = false;
  const go = h('button', { type: 'submit', class: 'btn-primary gh-publish' }, 'Publish');
  const d = openDialog({
    title: `Publish "${file.name}" to GitHub`, wide: true, label: 'Publish to GitHub',
    body: h('div', { class: 'cl-form gh' },
      h('div', { class: 'sch-grid' },
        field('Repository', repo),
        field('Branch', branch),
        field('Folder', dir)),
      field('GitHub token', token, h('span', {}, 'A fine-grained token with "Contents: Read and write" (and "Workflows: Read and write" for the workflow file) on this repository. ',
        h('a', { href: TOKEN_HELP, target: '_blank', rel: 'noopener' }, 'Create one'), '. Kept in this browser only: not synced, not in backups.')),
      h('label', { class: 'cl-check' }, workflow, ' Also add a GitHub Actions workflow that runs these tests on every push (with the hitapi CLI)'),
      field('Commit message', message),
      h('details', { class: 'gh-adv' }, h('summary', { class: 'small' }, 'GitHub Enterprise'), field('API URL', apiBase, 'https://github.example.com/api/v3 for GitHub Enterprise Server.')),
      preview, result),
    foot: (close) => [h('span', { class: 'grow' }), h('button', { type: 'button', class: 'btn-ghost', onclick: close }, 'Close'), go],
    onSubmit: async () => {
      if (busy) return;
      d.error('');
      const r = parseRepo(repo.value);
      if (!r) { d.error('Enter the repository as owner/name, e.g. acme/shop-api.'); return; }
      busy = true; go.disabled = true; go.textContent = 'Publishing…';
      try {
        const settings = { apiBase: apiBase.value.trim() || 'https://api.github.com', token: token.value.trim(), repo: `${r.owner}/${r.repo}`, branch: branch.value.trim() || 'main', dir: dir.value.trim(), workflow: workflow.checked };
        await saveGitHub(settings);
        const info = await checkRepo(settings);
        if (!info.canPush) throw new Error(`Your GitHub account can't push to ${settings.repo}.`);
        const files = [{ path: joinPath(settings.dir, file.fileName), text: file.text }];
        if (settings.workflow) files.push({ path: WORKFLOW_PATH, text: workflowYaml({ dir: settings.dir, vars: file.vars }), ifMissing: true });
        const done = await publishFiles(settings, files, message.value.trim() || `Update HitAPI tests: ${file.name}`);
        const cur = await loadGitHub();
        await saveGitHub({ published: { ...cur.published, [key]: { repo: settings.repo, branch: settings.branch, dir: settings.dir, at: Date.now() } } });
        const label = { created: 'Created', updated: 'Updated', unchanged: 'No change', kept: 'Already there, left as is' };
        mount(result, h('div', { class: 'cl-note ok' },
          h('strong', {}, `Published to ${settings.repo} (${settings.branch})`),
          done.map(x => h('div', { class: 'small' }, `${label[x.status]}: `, x.url ? h('a', { href: x.url, target: '_blank', rel: 'noopener' }, x.path) : h('code', {}, x.path)))));
        toast(`Published to ${settings.repo}`, 'ok');
      } catch (e) { d.error(e.message); }
      finally { busy = false; go.disabled = false; go.textContent = 'Publish'; }
    },
  });
  paintPreview();
  if (last) mount(result, h('div', { class: 'muted small' }, `Last published to ${last.repo} (${last.branch}) on ${new Date(last.at).toLocaleString()}.`));
  return d;
}
