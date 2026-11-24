/**
 * Web Workbench (W9) — Publish to GitHub: the HitAPI extension's workbench/github.js
 * with localStorage. Writes files to a repository with the GitHub REST API (contents
 * endpoint), straight from this browser to GitHub: one commit per file, updating the
 * file if it is already there. Settings, including the token, are kept in this browser
 * only ("hitapi:web:github"): never sent to HitAPI, not in backups or account sync.
 */

import { base64 } from '@hitapi/shared/auth.js';

const KEY = 'hitapi:web:github';
export const DEFAULTS = Object.freeze({ apiBase: 'https://api.github.com', token: '', repo: '', branch: 'main', dir: 'hitapi', workflow: true, published: {} });

export function loadGitHub() {
  try { const v = JSON.parse(localStorage.getItem(KEY) || '{}'); return { ...DEFAULTS, ...v, published: v.published || {} }; } catch { return { ...DEFAULTS }; }
}
export function saveGitHub(patch) {
  const next = { ...loadGitHub(), ...patch };
  try { localStorage.setItem(KEY, JSON.stringify(next)); } catch { /* storage blocked */ }
  return next;
}

/** "owner/repo", a github.com URL, or "owner/repo.git" → { owner, repo } or null. */
export function parseRepo(text) {
  const t = String(text || '').trim().replace(/^https?:\/\/[^/]+\//, '').replace(/\.git$/, '').replace(/\/+$/, '');
  const m = /^([\w.-]+)\/([\w.-]+)$/.exec(t);
  return m ? { owner: m[1], repo: m[2] } : null;
}

const cleanDir = (d) => String(d || '').trim().replace(/^\/+|\/+$/g, '').replace(/\/{2,}/g, '/');
export const joinPath = (dir, name) => (cleanDir(dir) ? `${cleanDir(dir)}/${name}` : name);
const encPath = (p) => p.split('/').map(encodeURIComponent).join('/');

function decode64(b64) {
  const bin = atob(String(b64 || '').replace(/\s+/g, ''));
  return new TextDecoder().decode(Uint8Array.from(bin, c => c.charCodeAt(0)));
}

async function gh(cfg, method, path, body) {
  const base = String(cfg.apiBase || DEFAULTS.apiBase).replace(/\/+$/, '');
  let res;
  try {
    res = await fetch(`${base}${path}`, {
      method,
      headers: { Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28', Authorization: `Bearer ${cfg.token}`, ...(body ? { 'Content-Type': 'application/json' } : {}) },
      body: body ? JSON.stringify(body) : undefined,
      credentials: 'omit', cache: 'no-store',
    });
  } catch { throw new Error(`Could not reach ${base}. Check your connection (or the API URL, for GitHub Enterprise).`); }
  let data = null;
  try { data = await res.json(); } catch { /* empty */ }
  return { status: res.status, data };
}

function explain(status, data, { owner, repo, branch }) {
  const msg = data?.message || '';
  if (status === 401) return 'GitHub did not accept the token (401). Check that it is correct and has not expired.';
  if (status === 403) return /rate limit/i.test(msg) ? 'GitHub rate limit reached. Try again later.' : `The token can't write to ${owner}/${repo} (403). It needs "Contents: Read and write" on this repository${msg ? ` — ${msg}` : ''}.`;
  if (status === 404) return /branch/i.test(msg) ? `There is no branch "${branch}" in ${owner}/${repo}.` : `${owner}/${repo} was not found, or the token has no access to it. Check the name and the token's repository access.`;
  if (status === 409) return `Someone changed the file at the same time (409). Publish again.`;
  if (status === 422) return /sha/i.test(msg) ? 'The file changed on GitHub while publishing. Publish again.' : `GitHub refused the file: ${msg || 'invalid request'} (422).`;
  return `GitHub error ${status}${msg ? `: ${msg}` : ''}`;
}

/** The repository, with its default branch. Throws with a readable message. */
export async function checkRepo(cfg) {
  const r = parseRepo(cfg.repo);
  if (!r) throw new Error('Enter the repository as owner/name, e.g. acme/shop-api.');
  if (!String(cfg.token || '').trim()) throw new Error('Paste a GitHub token first.');
  const { status, data } = await gh(cfg, 'GET', `/repos/${encodeURIComponent(r.owner)}/${encodeURIComponent(r.repo)}`);
  if (status !== 200) throw new Error(explain(status, data, { ...r, branch: cfg.branch }));
  return { ...r, defaultBranch: data.default_branch || 'main', canPush: data.permissions ? !!(data.permissions.push || data.permissions.admin) : true, htmlUrl: data.html_url };
}

/**
 * Write files. ifMissing: only create it, never replace it (the workflow file, which people edit).
 * @param {object} cfg  { apiBase, token, repo, branch }
 * @param {Array<{ path: string, text: string, ifMissing?: boolean }>} files
 * @param {string} message  commit message
 * @returns {Promise<Array<{ path, status: 'created'|'updated'|'unchanged'|'kept', url }>>}
 */
export async function publishFiles(cfg, files, message) {
  const r = parseRepo(cfg.repo);
  if (!r) throw new Error('Enter the repository as owner/name, e.g. acme/shop-api.');
  const branch = String(cfg.branch || '').trim() || 'main';
  const out = [];
  for (const f of files) {
    const at = `/repos/${encodeURIComponent(r.owner)}/${encodeURIComponent(r.repo)}/contents/${encPath(f.path)}`;
    const got = await gh(cfg, 'GET', `${at}?ref=${encodeURIComponent(branch)}`);
    let sha = null;
    if (got.status === 200 && got.data?.sha) {
      sha = got.data.sha;
      const web = got.data.html_url || '';
      if (f.ifMissing) { out.push({ path: f.path, status: 'kept', url: web }); continue; }
      let same = false;
      try { same = got.data.content != null && decode64(got.data.content) === f.text; } catch { /* binary */ }
      if (same) { out.push({ path: f.path, status: 'unchanged', url: web }); continue; }
    } else if (got.status !== 404) throw new Error(explain(got.status, got.data, { ...r, branch }));
    const put = await gh(cfg, 'PUT', at, { message, content: base64(f.text), branch, ...(sha ? { sha } : {}) });
    if (put.status !== 200 && put.status !== 201) throw new Error(`${f.path}: ${explain(put.status, put.data, { ...r, branch })}`);
    out.push({ path: f.path, status: sha ? 'updated' : 'created', url: put.data?.content?.html_url || '', commit: put.data?.commit?.html_url || '' });
  }
  return out;
}
