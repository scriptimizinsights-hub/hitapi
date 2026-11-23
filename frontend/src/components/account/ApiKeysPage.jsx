import { useEffect, useState } from 'react';
import { KeyRound, Plus, Trash2, Copy, Check, Terminal } from 'lucide-react';
import { useStore, api } from '../../store/index.js';

// Personal API keys (roadmap feature 12): let CI and scripts call HitAPI.
// The key is shown once, right after it is created; only a hash is stored.

const EXPIRY = [
  { value: '', label: 'Never' },
  { value: '30', label: '30 days' },
  { value: '90', label: '90 days' },
  { value: '365', label: '1 year' },
];

const when = (s) => (s ? new Date(s * 1000).toLocaleString() : '—');
const API_ORIGIN = (import.meta.env.VITE_API_URL ?? 'https://services.hitapi.dev/api').replace(/\/api\/?$/, '');

export function ApiKeysPage() {
  const { addToast, currentProject } = useStore();
  const [keys, setKeys] = useState(null);
  const [max, setMax] = useState(20);
  const [name, setName] = useState('');
  const [expires, setExpires] = useState('90');
  const [creating, setCreating] = useState(false);
  const [created, setCreated] = useState(null);   // { key, name } — shown once
  const [copied, setCopied] = useState(false);
  const [confirmId, setConfirmId] = useState(null);

  async function load() {
    try {
      const data = await api.keys.list();
      setKeys(data.keys || []);
      setMax(data.max || 20);
    } catch (e) { addToast(e.message, 'error'); setKeys([]); }
  }
  useEffect(() => { load(); }, []);

  async function create(e) {
    e.preventDefault();
    if (!name.trim()) { addToast('Give the key a name, e.g. "GitHub Actions"', 'error'); return; }
    setCreating(true);
    try {
      const k = await api.keys.create({ name: name.trim(), expires_in_days: expires || null });
      setCreated(k); setCopied(false); setName('');
      await load();
    } catch (err) { addToast(err.message, 'error'); }
    finally { setCreating(false); }
  }

  async function remove(id) {
    try {
      await api.keys.remove(id);
      setConfirmId(null);
      if (created?.id === id) setCreated(null);
      addToast('Key deleted. Anything using it stops working now.', 'success');
      await load();
    } catch (err) { addToast(err.message, 'error'); }
  }

  async function copy() {
    try { await navigator.clipboard.writeText(created.key); setCopied(true); } catch { addToast('Select the key and copy it by hand', 'error'); }
  }

  const projectId = currentProject?.id || '<project-id>';

  return (
    <div className="page" data-testid="api-keys-page">
      <div className="page-header">
        <h1 className="page-title"><KeyRound size={20} style={{ verticalAlign: '-3px', marginRight: 8 }} />API keys</h1>
        <p className="page-subtitle">Use HitAPI from CI pipelines and scripts — the hitapi CLI, GitHub Actions, curl — without your password.</p>
      </div>

      {created && (
        <div className="card" data-testid="new-key" style={{ padding: 16, borderColor: 'rgba(35, 209, 139, 0.45)', marginBottom: 16 }}>
          <div style={{ fontWeight: 600, marginBottom: 6 }}>Copy your new key "{created.name}" now</div>
          <div style={{ fontSize: 'var(--fs-sm)', color: 'var(--text-tertiary)', marginBottom: 10 }}>
            It is shown only once. Store it as a secret in your CI (for example a GitHub repository secret named HITAPI_API_KEY).
          </div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <code data-testid="new-key-value" style={{ flex: 1, padding: '8px 10px', borderRadius: 6, background: 'var(--bg-surface)', border: '1px solid var(--border)', overflowWrap: 'anywhere', fontSize: 'var(--fs-sm)' }}>{created.key}</code>
            <button className="btn btn-ghost" onClick={copy}>{copied ? <Check size={14} /> : <Copy size={14} />} {copied ? 'Copied' : 'Copy'}</button>
            <button className="btn btn-ghost" onClick={() => setCreated(null)}>Done</button>
          </div>
        </div>
      )}

      <div className="card" style={{ padding: 16, marginBottom: 16 }}>
        <form onSubmit={create} style={{ display: 'flex', gap: 10, alignItems: 'flex-end', flexWrap: 'wrap' }}>
          <label style={{ flex: '2 1 240px', display: 'flex', flexDirection: 'column', gap: 4 }}>
            <span style={{ fontSize: 'var(--fs-sm)', color: 'var(--text-secondary)' }}>Name</span>
            <input className="input" aria-label="Key name" placeholder='e.g. "GitHub Actions — shop-api"' value={name} maxLength={80} onChange={(e) => setName(e.target.value)} />
          </label>
          <label style={{ flex: '1 1 140px', display: 'flex', flexDirection: 'column', gap: 4 }}>
            <span style={{ fontSize: 'var(--fs-sm)', color: 'var(--text-secondary)' }}>Expires</span>
            <select className="input" aria-label="Expires" value={expires} onChange={(e) => setExpires(e.target.value)}>
              {EXPIRY.map(x => <option key={x.value} value={x.value}>{x.label}</option>)}
            </select>
          </label>
          <button className="btn btn-primary" type="submit" disabled={creating || (keys && keys.length >= max)}>
            <Plus size={14} /> {creating ? 'Creating…' : 'Create key'}
          </button>
        </form>
        <div style={{ fontSize: 'var(--fs-xs)', color: 'var(--text-tertiary)', marginTop: 8 }}>
          A key can do what you can do with your projects, except manage keys and admin pages. Delete a key as soon as you no longer need it.
        </div>
      </div>

      <div className="card" style={{ padding: 16, marginBottom: 16 }}>
        {keys === null ? <div className="spinner" /> : keys.length === 0 ? (
          <div className="empty-state"><h3>No API keys yet</h3><p>Create one above to run HitAPI from CI.</p></div>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 'var(--fs-sm)' }} data-testid="keys-table">
            <thead>
              <tr style={{ textAlign: 'left', color: 'var(--text-tertiary)' }}>
                <th style={{ padding: '6px 8px' }}>Name</th><th style={{ padding: '6px 8px' }}>Key</th><th style={{ padding: '6px 8px' }}>Created</th>
                <th style={{ padding: '6px 8px' }}>Last used</th><th style={{ padding: '6px 8px' }}>Expires</th><th />
              </tr>
            </thead>
            <tbody>
              {keys.map(k => {
                const expired = k.expires_at && k.expires_at * 1000 < Date.now();
                return (
                  <tr key={k.id} style={{ borderTop: '1px solid var(--border)' }}>
                    <td style={{ padding: '8px' }}>{k.name}</td>
                    <td style={{ padding: '8px' }}><code>{k.prefix}…</code></td>
                    <td style={{ padding: '8px' }}>{when(k.created_at)}</td>
                    <td style={{ padding: '8px' }}>{k.last_used_at ? when(k.last_used_at) : 'Never'}</td>
                    <td style={{ padding: '8px', color: expired ? 'var(--red)' : undefined }}>{k.expires_at ? (expired ? 'Expired' : when(k.expires_at)) : 'Never'}</td>
                    <td style={{ padding: '8px', textAlign: 'right', whiteSpace: 'nowrap' }}>
                      {confirmId === k.id ? (
                        <>
                          <button className="btn btn-danger" onClick={() => remove(k.id)}>Delete key</button>{' '}
                          <button className="btn btn-ghost" onClick={() => setConfirmId(null)}>Cancel</button>
                        </>
                      ) : (
                        <button className="btn btn-ghost" aria-label={`Delete ${k.name}`} onClick={() => setConfirmId(k.id)}><Trash2 size={14} /></button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      <div className="card" style={{ padding: 16 }}>
        <div style={{ fontWeight: 600, marginBottom: 8 }}><Terminal size={15} style={{ verticalAlign: '-2px', marginRight: 6 }} />Using a key</div>
        <pre style={{ margin: 0, padding: 10, borderRadius: 6, background: 'var(--bg-surface)', border: '1px solid var(--border)', fontSize: 'var(--fs-xs)', overflowX: 'auto', whiteSpace: 'pre' }}>{`# Run a HitAPI flow suite from CI and wait for the result
HITAPI_API_KEY=hk_… npx hitapi-cli cloud run --project ${projectId} --suite <suite-id>

# Or call the API directly
curl -H "Authorization: Bearer $HITAPI_API_KEY" ${API_ORIGIN}/api/projects`}</pre>
      </div>
    </div>
  );
}
