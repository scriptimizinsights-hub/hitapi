/**
 * Web Workbench (W8) — "Backup and sync": what this browser keeps, one backup file
 * with everything (export / import with a preview, merge or replace), and — signed in —
 * keeping the Workbench in the HitAPI account (shared with the extension).
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import { Download, Upload, Cloud, CloudOff, RefreshCw, Trash2 } from 'lucide-react';
import { makeBackup, parseBackup, previewImport, applyImport } from '@hitapi/shared/backup.js';
import { ago } from '@hitapi/shared/sync.js';
import { formatBytes } from '@hitapi/shared/http.js';
import { Dialog } from './Dialogs.jsx';
import { downloadText } from './CollectionDialogs.jsx';
import { loadTree, saveTree, KEY as TREE_KEY } from './collections-store.js';
import { loadEnvs, updateEnvs, setActiveEnv, KEY as ENV_KEY } from './env-store.js';
import { loadScenarios, updateScenarios, KEY as SCEN_KEY } from './scenarios-store.js';
import { listIndex, exportAll, importAll, getSettings, setSettings } from './history-db.js';

const size = (key) => { try { return (localStorage.getItem(key) || '').length; } catch { return 0; } };
const plural = (n, one, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

function Preview({ p }) {
  const line = (label, d) => `${label}: ${[d.added && `${d.added} new`, d.updated && `${d.updated} updated`, d.kept && `${d.kept} kept`, d.removed && `${d.removed} removed`].filter(Boolean).join(', ') || 'no change'}`;
  return (
    <ul className="wbw-bk-preview text-sm">
      <li>{line('Collections', p.collections)}</li>
      <li>{line('Environments', p.environments)}{p.globals ? ` · ${plural(p.globals, 'global variable')}` : ''}</li>
      <li>{line('Scenarios', p.scenarios)}</li>
      {p.history > 0 && <li>History: {plural(p.history, 'request')} (added; ones already here are kept)</li>}
      <li className={p.secrets ? 'text-amber' : 'text-tertiary'}>{p.secrets ? 'This backup includes secrets (tokens, passwords).' : 'This backup has no secrets: fill in tokens and passwords again.'}</li>
    </ul>
  );
}

/**
 * @param {object} p
 * @param {boolean} p.signedIn
 * @param {object} p.sync               the sync state (sync.js)
 * @param {(on: boolean) => void} p.onSyncToggle
 * @param {() => void} p.onSyncNow
 * @param {() => Promise<void>} p.onDeleteCloud
 * @param {() => void} p.onImported      the stores changed: reload them
 */
export function BackupDialog({ signedIn, sync, onSyncToggle, onSyncNow, onDeleteCloud, onImported, onNotify, onClose }) {
  const [histBytes, setHistBytes] = useState(0);
  const [histCount, setHistCount] = useState(0);
  const [withHistory, setWithHistory] = useState(false);
  const [withSecrets, setWithSecrets] = useState(false);
  const [backup, setBackup] = useState(null);       // { data, fileName }
  const [mode, setMode] = useState('merge');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const fileRef = useRef(null);
  useEffect(() => { listIndex().then((l) => { setHistCount(l.length); setHistBytes(l.reduce((n, m) => n + (m.bytes || 0), 0)); }).catch(() => {}); }, []);

  const current = () => ({ tree: loadTree(), envs: loadEnvs(), scenarios: loadScenarios() });
  const used = { Collections: size(TREE_KEY), Environments: size(ENV_KEY), Scenarios: size(SCEN_KEY) };
  const local = used.Collections + used.Environments + used.Scenarios;
  const preview = useMemo(() => (backup ? previewImport(current(), backup.data, mode) : null), [backup, mode]);   // eslint-disable-line react-hooks/exhaustive-deps

  const exportAllNow = async () => {
    setBusy(true);
    try {
      const c = current();
      const data = makeBackup({ tree: c.tree, envs: c.envs, scenarios: c.scenarios, historySettings: getSettings(), history: withHistory ? await exportAll() : null }, { secrets: withSecrets });
      const name = `hitapi-backup-${new Date().toISOString().slice(0, 10)}.json`;
      downloadText(name, JSON.stringify(data, null, 2));
      onNotify?.(`Saved ${name}`);
    } catch (e) { setError(e.message); }
    setBusy(false);
  };
  const pickFile = async (f) => {
    if (!f) return;
    setError(''); setBackup(null);
    try { setBackup({ data: parseBackup(await f.text()), fileName: f.name }); } catch (e) { setError(e.message); }
  };
  const importNow = async () => {
    if (mode === 'replace' && !confirm('Replace everything in this browser with the backup? Collections, environments and scenarios not in the backup are deleted.')) return;
    setBusy(true); setError('');
    try {
      const next = applyImport(current(), backup.data, mode);
      saveTree(next.tree);
      updateEnvs((s) => { s.globals = next.envs.globals; s.envs = next.envs.envs; });
      setActiveEnv(next.envs.active);
      updateScenarios((s) => { s.items = next.scenarios.items; return true; });
      if (next.historySettings) await setSettings(next.historySettings).catch(() => {});
      const h = backup.data.history ? await importAll(backup.data.history) : 0;
      onImported?.();
      onNotify?.(`Backup imported (${mode === 'replace' ? 'replaced' : 'merged'})${h ? `, ${plural(h, 'history entry', 'history entries')}` : ''}`);
      onClose();
    } catch (e) { setError(e.message); setBusy(false); }
  };

  return (
    <Dialog wide title="Backup and sync" onClose={onClose} footer={<>
      <span className="text-xs text-tertiary">A backup file also imports into the HitAPI Chrome extension, and the reverse.</span>
      <span className="wbw-grow" />
      <button type="button" className="btn btn-ghost btn-sm" onClick={onClose}>Close</button>
    </>}>
      <div className="wbw-form">
        <section className="wbw-bk-sec" aria-label="Your account">
          <h3 className="wbw-bk-h">{signedIn ? <Cloud size={14} /> : <CloudOff size={14} />} Your HitAPI account</h3>
          {!signedIn ? (
            <p className="text-sm text-tertiary">Your Workbench is kept in this browser only. <a href="/login">Sign in</a> (a free account works) to keep collections, environments and scenarios in your account — on every computer and in the HitAPI extension.</p>
          ) : <>
            <label className="wbw-check"><input type="checkbox" aria-label="Keep my Workbench in my HitAPI account" checked={!!sync.enabled} onChange={(e) => onSyncToggle(e.target.checked)} />
              <span><strong>Keep my Workbench in my HitAPI account</strong><span className="text-xs text-tertiary"> — collections, environments and scenarios, the same here, on other computers and in the HitAPI extension (with sync on).</span></span></label>
            <p className="text-xs text-tertiary">Tokens, passwords, API keys and secret variables never leave this browser: they are removed before saving and filled back in from here. On a new computer, fill them in once.</p>
            {sync.enabled && (
              <div className="wbw-bk-status text-sm" role="status">
                <span>{sync.syncing ? 'Saving…' : sync.offline ? 'Offline: changes are kept here and saved when you are back online.' : sync.lastError ? <span className="text-red">{sync.lastError}</span> : sync.lastSyncAt ? `Saved ${ago(sync.lastSyncAt)}` : 'Not saved yet.'}</span>
                {sync.lastResult?.conflicts?.length > 0 && <span className="text-amber"> · Changed here and on another device: both kept ({sync.lastResult.conflicts.map(c => `"${c} (conflict copy)"`).join(', ')}).</span>}
                <span className="text-xs text-tertiary"> · This browser: {sync.device}</span>
              </div>
            )}
            <div className="wbw-row">
              <button type="button" className="btn btn-ghost btn-sm wbw-bk-syncnow" disabled={!sync.enabled || sync.syncing} onClick={onSyncNow}><RefreshCw size={12} /> Save now</button>
              <button type="button" className="btn btn-ghost btn-sm text-red wbw-bk-delcloud" onClick={async () => {
                if (!confirm('Delete the copy in your HitAPI account? Every device stops sharing it (each keeps its own copy). This browser keeps its copy and stops saving to the account.')) return;
                setBusy(true); try { await onDeleteCloud(); } catch (e) { setError(e.message); } setBusy(false);
              }}><Trash2 size={12} /> Delete the account copy</button>
            </div>
          </>}
        </section>

        <section className="wbw-bk-sec" aria-label="This browser">
          <h3 className="wbw-bk-h">In this browser</h3>
          <div className="wbw-bk-usage text-sm">
            {Object.entries(used).map(([k, v]) => <span key={k}>{k}: {formatBytes(v)}</span>)}
            <span>History: {plural(histCount, 'request')}, {formatBytes(histBytes)}</span>
          </div>
          <p className="text-xs text-tertiary">Collections, environments and scenarios share about 5 MB ({formatBytes(local)} used); History has its own 25 MB.</p>
        </section>

        <section className="wbw-bk-sec" aria-label="Export all">
          <h3 className="wbw-bk-h">Export everything to one file</h3>
          <label className="wbw-check"><input type="checkbox" aria-label="Include history" checked={withHistory} onChange={(e) => setWithHistory(e.target.checked)} /> Include history ({plural(histCount, 'request')})</label>
          <label className="wbw-check"><input type="checkbox" aria-label="Include secrets" checked={withSecrets} onChange={(e) => setWithSecrets(e.target.checked)} /> Include tokens, passwords, API keys and secret variables</label>
          {withSecrets && <p className="text-xs text-amber">Anyone with the file can use these secrets. Keep it private.</p>}
          <div><button type="button" className="btn btn-primary btn-sm wbw-bk-export" disabled={busy} onClick={exportAllNow}><Download size={12} /> Export all</button></div>
        </section>

        <section className="wbw-bk-sec" aria-label="Import a backup">
          <h3 className="wbw-bk-h">Import a backup</h3>
          <div className="wbw-row">
            <button type="button" className="btn btn-ghost btn-sm wbw-bk-pick" onClick={() => fileRef.current?.click()}><Upload size={12} /> Choose a backup file…</button>
            {backup && <span className="text-xs text-tertiary">{backup.fileName} · made {new Date(backup.data.exportedAt).toLocaleString()}</span>}
          </div>
          <input ref={fileRef} type="file" hidden accept=".json,application/json" aria-label="Backup file" onChange={(e) => { pickFile(e.target.files?.[0]); e.target.value = ''; }} />
          {backup && <>
            <div className="wbw-seg" role="radiogroup" aria-label="How to import">
              <button type="button" role="radio" aria-checked={mode === 'merge'} className={`wbw-seg-btn${mode === 'merge' ? ' on' : ''}`} onClick={() => setMode('merge')}>Merge (add and update)</button>
              <button type="button" role="radio" aria-checked={mode === 'replace'} className={`wbw-seg-btn${mode === 'replace' ? ' on' : ''}`} onClick={() => setMode('replace')}>Replace everything</button>
            </div>
            {preview && <Preview p={preview} />}
            <div><button type="button" className="btn btn-primary btn-sm wbw-bk-import" disabled={busy} onClick={importNow}>Import</button></div>
          </>}
        </section>
        {error && <div className="wbw-err" role="alert">{error}</div>}
      </div>
    </Dialog>
  );
}
