/**
 * workbench/views/backup-dialog.js — "Backup & sync" (roadmap feature 11):
 * storage used, export / import a backup of everything, and sync with a HitAPI account.
 */

import { h, mount, toast } from '../../ui/core/dom.js';
import { openDialog, download } from './collection-dialogs.js';
import { parseBackup, previewImport, storageGroup } from '../../shared/backup.js';
import { formatBytes } from '../../shared/http.js';
import { ago } from '../../shared/sync.js';

/**
 * @param {object} o
 * @param {() => Promise<object>} o.current                    { tree, envs, scenarios, historyCount }
 * @param {(opts: { history, secrets }) => Promise<object>} o.makeBackup
 * @param {(backup, mode) => Promise<string>} o.importBackup     returns a message
 * @param {() => Promise<void>} o.clearHistory
 * @param {() => Promise<object>} o.syncState
 * @param {() => Promise<{ signedIn, user }>} o.authState
 * @param {(on: boolean, device: string) => Promise<void>} o.setSync
 * @param {() => Promise<object>} o.syncNow                    → result
 * @param {() => Promise<void>} o.deleteCloud
 */
export function openBackupDialog(o) {
  const storageEl = h('div', { class: 'bk-section' });
  const backupEl = h('div', { class: 'bk-section' });
  const syncEl = h('div', { class: 'bk-section' });

  async function paintStorage() {
    let used = 0; const groups = {};
    try {
      const all = await chrome.storage.local.get(null);
      for (const [k, v] of Object.entries(all)) { const n = k.length + JSON.stringify(v).length; used += n; groups[storageGroup(k)] = (groups[storageGroup(k)] || 0) + n; }
      used = await chrome.storage.local.getBytesInUse(null).catch(() => used);
    } catch { /* storage unavailable */ }
    const quota = chrome.storage.local.QUOTA_BYTES || 10485760;
    const pct = Math.min(100, (used / quota) * 100);
    mount(storageEl,
      h('h3', {}, 'Storage in this browser'),
      h('div', { class: 'bk-meter', role: 'meter', 'aria-valuemin': '0', 'aria-valuemax': String(quota), 'aria-valuenow': String(used), 'aria-label': 'Storage used' },
        h('span', { class: `bk-meter-fill${pct > 85 ? ' high' : ''}`, style: { width: `${Math.max(1, pct)}%` } })),
      h('div', { class: 'small' }, h('strong', {}, formatBytes(used)), ` of ${formatBytes(quota)} used (${pct.toFixed(1)}%)`),
      h('div', { class: 'bk-groups small muted' }, ['Collections', 'Environments', 'Scenarios', 'History', 'Other'].filter(g => groups[g]).map(g => h('span', {}, `${g}: ${formatBytes(groups[g])}`))),
      h('div', {}, h('button', { type: 'button', class: 'btn-ghost btn-sm bk-clear-history', disabled: !groups.History, onclick: async () => {
        if (!confirm('Delete every request from history?')) return;
        await o.clearHistory(); toast('History cleared', 'info'); paintStorage();
      } }, 'Clear history')));
  }

  function paintBackup() {
    const withHistory = h('input', { type: 'checkbox' });
    const withSecrets = h('input', { type: 'checkbox' });
    const warn = h('div', { class: 'wb-warn-text small', hidden: true }, 'The file will contain your tokens, passwords and API keys in plain text. Keep it private.');
    withSecrets.addEventListener('change', () => { warn.hidden = !withSecrets.checked; });
    const preview = h('div', { class: 'bk-preview' });
    const file = h('input', { type: 'file', accept: '.json,application/json', hidden: true });
    let parsed = null;
    file.addEventListener('change', async () => {
      const f = file.files?.[0]; file.value = '';
      if (!f) return;
      try { parsed = parseBackup(await f.text()); } catch (e) { mount(preview, h('div', { class: 'error small' }, e.message)); return; }
      paintPreview(f.name);
    });
    async function paintPreview(name) {
      const cur = await o.current();
      const mode = h('select', { 'aria-label': 'How to import' }, h('option', { value: 'merge' }, 'Merge: add new items, update items that are in both'), h('option', { value: 'replace' }, 'Replace: make this browser exactly like the backup'));
      const list = h('ul', { class: 'small bk-changes' });
      const paint = () => {
        const p = previewImport(cur, parsed, mode.value);
        const line = (label, d) => h('li', {}, `${label}: `, h('strong', {}, `${d.added} new`), `, ${d.updated} updated`, mode.value === 'replace' ? [', ', h('strong', { class: d.removed ? 'text-red' : '' }, `${d.removed} removed`)] : `, ${d.kept} kept`);
        mount(list, line('Collections', p.collections), line('Environments', p.environments), line('Scenarios', p.scenarios),
          h('li', {}, `Globals: ${p.globals} variable${p.globals === 1 ? '' : 's'}${mode.value === 'merge' ? ' (same names are updated)' : ''}`),
          h('li', {}, p.history ? `History: ${p.history} requests (added)` : 'History: not in this backup'),
          p.secrets ? null : h('li', { class: 'muted' }, 'Made without secrets: you will need to enter tokens and passwords again.'));
      };
      mode.addEventListener('change', paint);
      paint();
      mount(preview, h('div', { class: 'cl-note' },
        h('strong', {}, `${name} · ${new Date(parsed.exportedAt).toLocaleString()}`),
        h('label', { class: 'cl-field' }, h('span', { class: 'ap-label' }, 'Import as'), mode), list,
        h('div', {}, h('button', { type: 'button', class: 'btn-primary btn-sm bk-do-import', onclick: async () => {
          if (mode.value === 'replace' && !confirm('Replace all collections, environments and scenarios in this browser with the backup?')) return;
          const msg = await o.importBackup(parsed, mode.value);
          mount(preview, h('div', { class: 'cl-note ok' }, `✓ ${msg}`));
          paintStorage();
        } }, 'Import'), ' ', h('button', { type: 'button', class: 'btn-ghost btn-sm', onclick: () => { parsed = null; mount(preview); } }, 'Cancel'))));
    }
    mount(backupEl,
      h('h3', {}, 'Backup'),
      h('div', { class: 'muted small' }, 'Everything in one file: collections, environments, scenarios and settings. Keep it safe, move it to another browser, or restore it after reinstalling.'),
      h('label', { class: 'check small' }, withHistory, ' Include history (the requests you sent, with responses)'),
      h('label', { class: 'check small' }, withSecrets, ' Include secrets'),
      warn,
      h('div', { class: 'bk-actions' },
        h('button', { type: 'button', class: 'btn-primary btn-sm bk-export', onclick: async () => {
          const data = await o.makeBackup({ history: withHistory.checked, secrets: withSecrets.checked });
          const name = `hitapi-backup-${new Date().toISOString().slice(0, 10)}.json`;
          download(name, JSON.stringify(data, null, 2));
          toast(`Saved ${name}`, 'ok');
        } }, 'Export all'),
        h('button', { type: 'button', class: 'btn-ghost btn-sm bk-import', onclick: () => file.click() }, 'Import a backup…'), file),
      preview);
  }

  async function paintSync() {
    const [auth, st] = await Promise.all([o.authState().catch(() => ({ signedIn: false })), o.syncState()]);
    if (!auth.signedIn) {
      mount(syncEl, h('h3', {}, 'Sync across devices'),
        h('div', { class: 'cl-note' }, h('strong', {}, 'Sign in to sync.'),
          h('div', { class: 'muted small' }, 'Sign in from the HitAPI popup (a free account works). Your collections, environments and scenarios then stay the same on every computer where you use HitAPI. Without an account everything still works, in this browser.')));
      return;
    }
    const toggle = h('input', { type: 'checkbox', checked: st.enabled, 'aria-label': 'Sync with my HitAPI account' });
    const device = h('input', { type: 'text', class: 'cl-input', value: st.device, maxlength: '80', 'aria-label': 'Name of this device' });
    const status = h('div', { class: 'small bk-status' });
    const paintStatus = (s) => {
      if (!s.enabled) { mount(status, h('span', { class: 'muted' }, 'Off.')); return; }
      if (s.lastError) { mount(status, h('span', { class: 'text-red' }, `✗ ${s.lastError}`)); return; }
      const r = s.lastResult;
      mount(status, s.lastSyncAt ? h('span', { class: 'text-green' }, `✓ Synced ${ago(s.lastSyncAt)}`) : h('span', { class: 'muted' }, 'Not synced yet.'),
        r && (r.uploaded.length || r.downloaded.length) ? h('span', { class: 'muted' }, ` · ${r.uploaded.length ? `sent ${r.uploaded.join(', ')}` : ''}${r.uploaded.length && r.downloaded.length ? '; ' : ''}${r.downloaded.length ? `got ${r.downloaded.join(', ')}` : ''}`) : null,
        r?.conflicts?.length ? h('div', { class: 'wb-warn-text' }, `Changed on two devices: ${r.conflicts.join(', ')}. The other device's version was kept and yours saved as "(conflict copy)".`) : null);
    };
    paintStatus(st);
    const syncBtn = h('button', { type: 'button', class: 'btn-primary btn-sm bk-sync-now', disabled: !st.enabled, onclick: async () => {
      syncBtn.disabled = true; syncBtn.textContent = 'Syncing…';
      const r = await o.syncNow();
      syncBtn.disabled = false; syncBtn.textContent = 'Sync now';
      paintStatus(await o.syncState());
      if (!r.ok && r.error) toast(r.error, 'error');
      paintStorage();
    } }, 'Sync now');
    toggle.addEventListener('change', async () => {
      await o.setSync(toggle.checked, device.value.trim() || st.device);
      syncBtn.disabled = !toggle.checked;
      if (toggle.checked) syncBtn.click(); else paintStatus(await o.syncState());
    });
    device.addEventListener('change', () => o.setSync(toggle.checked, device.value.trim() || st.device));
    mount(syncEl,
      h('h3', {}, 'Sync across devices'),
      h('label', { class: 'check' }, toggle, h('span', {}, h('strong', {}, `Sync with my HitAPI account`), auth.user?.email ? h('span', { class: 'muted small' }, ` (${auth.user.email})`) : null,
        h('div', { class: 'muted small' }, 'Collections, environments and scenarios. Secrets (tokens, passwords, API keys, secret variables) stay in this browser and are never uploaded; history isn\'t synced either.'))),
      h('label', { class: 'cl-field' }, h('span', { class: 'ap-label' }, 'This device'), device),
      status,
      h('div', { class: 'bk-actions' }, syncBtn,
        h('button', { type: 'button', class: 'btn-ghost btn-sm bk-delete-cloud', onclick: async () => {
          if (!confirm('Stop syncing and delete the synced copy from your HitAPI account? Your data in this browser is not changed; other devices keep theirs but stop receiving changes.')) return;
          await o.deleteCloud(); toast('Cloud copy deleted. Sync is off.', 'info'); paintSync();
        } }, 'Delete the cloud copy')));
  }

  const d = openDialog({
    title: 'Backup & sync', wide: true,
    body: h('div', { class: 'bk' }, storageEl, backupEl, syncEl),
    foot: (close) => [h('a', { class: 'link-btn small bk-websites', href: chrome.runtime.getURL('workbench/connect.html'), target: '_blank', title: 'Websites allowed to send requests through this extension (hitapi.dev)' }, 'Connected websites…'), h('span', { class: 'grow' }), h('button', { type: 'button', class: 'btn-primary', onclick: close }, 'Done')],
  });
  paintStorage(); paintBackup(); paintSync();
  return d;
}
