/**
 * Web Workbench (W9) — connect a collection or scenario to CI:
 *   CiDialog      "Use in CI": download the file for hitapi-cli, the commands, API keys
 *   GitHubDialog  Publish to GitHub: the file and a GitHub Actions workflow, written from
 *                 this browser straight to GitHub (the token stays in this browser)
 * Same files as the HitAPI extension (shared/ci.js ciFile, workflowYaml).
 */

import { useState } from 'react';
import { Download, Copy, ExternalLink } from 'lucide-react';
import { workflowYaml } from '@hitapi/shared/ci.js';
import { Dialog } from './Dialogs.jsx';
import { downloadText } from './CollectionDialogs.jsx';
import { loadGitHub, saveGitHub, parseRepo, joinPath, checkRepo, publishFiles } from './github.js';

export const WORKFLOW_PATH = '.github/workflows/hitapi.yml';
const TOKEN_HELP = 'https://github.com/settings/personal-access-tokens/new';
const envName = (v) => `HITAPI_VAR_${v.replace(/[^A-Za-z0-9_]/g, '_')}`;

function Cmd({ text, onNotify }) {
  return (
    <div className="wbw-ci-cmd">
      <pre className="wbw-pre font-mono">{text}</pre>
      <button type="button" className="btn btn-ghost btn-icon" aria-label="Copy the command" onClick={() => navigator.clipboard?.writeText(text).then(() => onNotify?.('Copied'))}><Copy size={12} /></button>
    </div>
  );
}

/** @param {{ file: { name, fileName, text, skipped, vars }, signedIn, onPublish, onNotify, onClose }} p */
export function CiDialog({ file, signedIn, onPublish, onNotify, onClose }) {
  const varFlags = file.vars.map(v => ` --var ${v}=…`).join('');
  return (
    <Dialog wide title={`Use "${file.name}" in CI`} onClose={onClose} footer={<>
      <span className="wbw-grow" />
      <button type="button" className="btn btn-ghost btn-sm" onClick={onClose}>Close</button>
      <button type="button" className="btn btn-ghost btn-sm wbw-ci-github" onClick={onPublish}>Publish to GitHub…</button>
      <button type="button" className="btn btn-primary btn-sm wbw-ci-download" onClick={() => { downloadText(file.fileName, file.text); onNotify?.(`Saved ${file.fileName}`); }}><Download size={12} /> Download for the CLI</button>
    </>}>
      <div className="wbw-form">
        <p className="text-sm">Run it anywhere Node.js runs — your CI, a cron job, your terminal — with <strong>hitapi-cli</strong>. Its Tests decide pass or fail; the command exits with 1 when something fails.</p>
        <div className="wbw-field"><span>1. Download the file and put it in your repository</span>
          <p className="text-xs text-tertiary"><code>{file.fileName}</code>. Secrets are not in the file{file.skipped.length ? `; left out (their saved request was deleted): ${file.skipped.join(', ')}` : ''}.</p>
        </div>
        <div className="wbw-field"><span>2. Run it</span>
          <Cmd onNotify={onNotify} text={`npx hitapi-cli run ${file.fileName}${varFlags}`} />
          {file.vars.length > 0 && <p className="text-xs text-tertiary">Give {file.vars.map(v => `{{${v}}}`).join(', ')} with <code>--var</code>, <code>--env-file</code> (a Postman environment or HitAPI backup), or environment variables like <code>{envName(file.vars[0])}</code> (CI secrets).</p>}
          <Cmd onNotify={onNotify} text={`npx hitapi-cli run ${file.fileName} --junit results.xml`} />
          <p className="text-xs text-tertiary">JUnit XML for test reports in GitHub Actions, GitLab and Jenkins; <code>--reporter json</code> for scripts.</p>
        </div>
        <div className="wbw-field"><span>3. Or run your HitAPI flow suites in the cloud from CI</span>
          <Cmd onNotify={onNotify} text={'HITAPI_API_KEY=hk_… npx hitapi-cli cloud run <projectId> <suiteId>'} />
          <p className="text-xs text-tertiary">{signedIn ? <>Create a key on the <a href="/account/api-keys">API keys</a> page. Keys act as you; keep them in your CI's secrets.</> : <>Needs a free HitAPI account and an API key.</>}</p>
        </div>
      </div>
    </Dialog>
  );
}

/** @param {{ itemKey: string, file: { name, fileName, text, skipped, vars }, onNotify, onClose }} p */
export function GitHubDialog({ itemKey, file, onNotify, onClose }) {
  const [cfg] = useState(loadGitHub);
  const last = cfg.published[itemKey] || null;
  const [repo, setRepo] = useState(last?.repo || cfg.repo);
  const [branch, setBranch] = useState(last?.branch || cfg.branch);
  const [dir, setDir] = useState(last?.dir ?? cfg.dir);
  const [token, setToken] = useState(cfg.token);
  const [apiBase, setApiBase] = useState(cfg.apiBase);
  const [workflow, setWorkflow] = useState(cfg.workflow);
  const [message, setMessage] = useState(`Update HitAPI tests: ${file.name}`);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState(null);

  const go = async () => {
    setError('');
    const r = parseRepo(repo);
    if (!r) { setError('Enter the repository as owner/name, e.g. acme/shop-api.'); return; }
    setBusy(true);
    try {
      const settings = { apiBase: apiBase.trim() || 'https://api.github.com', token: token.trim(), repo: `${r.owner}/${r.repo}`, branch: branch.trim() || 'main', dir: dir.trim(), workflow };
      saveGitHub(settings);
      const info = await checkRepo(settings);
      if (!info.canPush) throw new Error(`Your GitHub account can't push to ${settings.repo}.`);
      const files = [{ path: joinPath(settings.dir, file.fileName), text: file.text }];
      if (settings.workflow) files.push({ path: WORKFLOW_PATH, text: workflowYaml({ dir: settings.dir, vars: file.vars }), ifMissing: true });
      const out = await publishFiles(settings, files, message.trim() || `Update HitAPI tests: ${file.name}`);
      saveGitHub({ published: { ...loadGitHub().published, [itemKey]: { repo: settings.repo, branch: settings.branch, dir: settings.dir, at: Date.now() } } });
      setDone({ repo: settings.repo, branch: settings.branch, files: out });
      onNotify?.(`Published to ${settings.repo}`);
    } catch (e) { setError(e.message); }
    setBusy(false);
  };
  const label = { created: 'Created', updated: 'Updated', unchanged: 'No change', kept: 'Already there, left as is' };
  const path = joinPath(dir, file.fileName);
  return (
    <Dialog wide title={`Publish "${file.name}" to GitHub`} onClose={onClose} footer={<>
      <span className="wbw-grow" />
      <button type="button" className="btn btn-ghost btn-sm" onClick={onClose}>Close</button>
      <button type="button" className="btn btn-primary btn-sm wbw-gh-publish" disabled={busy} onClick={go}>{busy ? 'Publishing…' : 'Publish'}</button>
    </>}>
      <div className="wbw-form">
        <div className="wbw-grid">
          <label className="wbw-field"><span>Repository</span><input className="input font-mono" aria-label="Repository" placeholder="owner/repository" autoComplete="off" spellCheck={false} value={repo} onChange={(e) => setRepo(e.target.value)} /></label>
          <label className="wbw-field"><span>Branch</span><input className="input font-mono" aria-label="Branch" spellCheck={false} value={branch} onChange={(e) => setBranch(e.target.value)} /></label>
          <label className="wbw-field"><span>Folder</span><input className="input font-mono" aria-label="Folder" placeholder="(repository root)" spellCheck={false} value={dir} onChange={(e) => setDir(e.target.value)} /></label>
        </div>
        <label className="wbw-field"><span>GitHub token</span>
          <input className="input font-mono" type="password" aria-label="GitHub token" placeholder="github_pat_…" autoComplete="off" spellCheck={false} value={token} onChange={(e) => setToken(e.target.value)} />
          <span className="text-xs text-tertiary">A fine-grained token with "Contents: Read and write" (and "Workflows: Read and write" for the workflow file) on this repository. <a href={TOKEN_HELP} target="_blank" rel="noopener noreferrer">Create one <ExternalLink size={10} /></a>. Kept in this browser only: sent straight to GitHub, never to HitAPI, not in backups or account sync.</span>
        </label>
        <label className="wbw-check"><input type="checkbox" aria-label="Add a GitHub Actions workflow" checked={workflow} onChange={(e) => setWorkflow(e.target.checked)} /> Also add a GitHub Actions workflow that runs these tests on every push (with hitapi-cli)</label>
        <label className="wbw-field"><span>Commit message</span><input className="input" aria-label="Commit message" maxLength={200} value={message} onChange={(e) => setMessage(e.target.value)} /></label>
        <details><summary className="text-xs">GitHub Enterprise</summary>
          <label className="wbw-field"><span>API URL</span><input className="input font-mono" aria-label="GitHub API URL" value={apiBase} onChange={(e) => setApiBase(e.target.value)} /><span className="text-xs text-tertiary">https://github.example.com/api/v3 for GitHub Enterprise Server.</span></label>
        </details>
        <div className="text-xs wbw-gh-preview">
          <div>Writes <code>{path}</code>{workflow && <> and <code>{WORKFLOW_PATH}</code> <span className="text-tertiary">(only if it isn't there yet)</span></>}</div>
          {file.vars.length ? <div>Secrets are not written to the file. In GitHub, add these repository secrets so the workflow can fill in the variables: {file.vars.map((v, i) => <span key={v}>{i ? ', ' : ''}<code>{envName(v)}</code></span>)}</div> : <div className="text-tertiary">No secrets are written to the file.</div>}
        </div>
        {last && !done && <p className="text-xs text-tertiary">Last published to {last.repo} ({last.branch}) on {new Date(last.at).toLocaleString()}.</p>}
        {done && (
          <div className="wbw-okbox" role="status">
            <strong>Published to {done.repo} ({done.branch})</strong>
            {done.files.map(x => <div key={x.path} className="text-xs">{label[x.status]}: {x.url ? <a href={x.url} target="_blank" rel="noopener noreferrer">{x.path}</a> : <code>{x.path}</code>}</div>)}
          </div>
        )}
        {error && <div className="wbw-err" role="alert">{error}</div>}
      </div>
    </Dialog>
  );
}
