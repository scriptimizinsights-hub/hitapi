import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { Bug, BarChart3, ExternalLink, X } from 'lucide-react';
import { useStore } from '../../store/index.js';

// ─── Bugs Page ───────────────────────────────────────────────────────────────

const SEV = {
  critical: { color: 'var(--red)', bg: 'var(--red-bg)', border: 'var(--red-border)', label: 'Critical' },
  high: { color: 'var(--red)', bg: 'var(--red-bg)', border: 'var(--red-border)', label: 'High' },
  medium: { color: 'var(--amber)', bg: 'var(--amber-bg)', border: 'var(--amber-border)', label: 'Medium' },
  low: { color: 'var(--green)', bg: 'var(--green-bg)', border: 'var(--green-border)', label: 'Low' },
};

export function BugsPage() {
  const { projectId } = useParams();
  const { bugs, loadBugs, dismissBug } = useStore();
  const [severityFilter, setSeverityFilter] = useState('all');

  useEffect(() => { loadBugs(projectId); }, [projectId]);

  const filtered = severityFilter === 'all' ? bugs : bugs.filter(b => b.severity === severityFilter);

  return (
    <div className="page">
      <div className="page-header">
        <h1 className="page-title">AI Bug Detection</h1>
        <p className="page-subtitle">Issues automatically detected by Cloudflare Workers AI</p>
      </div>

      {/* Severity filters */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 20 }}>
        {['all', 'critical', 'high', 'medium', 'low'].map(s => {
          const meta = SEV[s] || { color: 'var(--text-secondary)', bg: 'var(--bg-card)', border: 'var(--border)', label: 'All' };
          const count = s === 'all' ? bugs.length : bugs.filter(b => b.severity === s).length;
          const active = severityFilter === s;
          return (
            <button key={s} onClick={() => setSeverityFilter(s)}
              style={{
                padding: '6px 14px', borderRadius: 7, fontSize: 12, cursor: 'pointer',
                background: active ? meta.bg : 'var(--bg-card)',
                color: active ? meta.color : 'var(--text-secondary)',
                border: active ? `1px solid ${meta.border}` : '1px solid var(--border)',
                fontWeight: active ? 600 : 400, transition: 'all 0.12s',
                display: 'flex', alignItems: 'center', gap: 6
              }}
            >
              {s === 'all' ? 'All severities' : meta.label}
              <span style={{ fontSize: 11, padding: '1px 6px', borderRadius: 10, background: 'rgba(255,255,255,0.08)', color: active ? meta.color : 'var(--text-tertiary)' }}>
                {count}
              </span>
            </button>
          );
        })}
      </div>

      {bugs.length === 0 ? (
        <div className="card">
          <div className="empty-state">
            <Bug size={40} />
            <h3 style={{ color: 'var(--green)' }}>No open bugs</h3>
            <p>Run your test suite to detect API issues automatically</p>
          </div>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {filtered.map(bug => {
            const meta = SEV[bug.severity] || SEV.medium;
            return (
              <div key={bug.id} className="card" style={{ padding: 0, overflow: 'hidden' }}>
                <div style={{
                  display: 'flex', alignItems: 'stretch',
                  borderLeft: `3px solid ${meta.color}`
                }}>
                  <div style={{ flex: 1, padding: '16px 20px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
                      <span style={{
                        fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 4,
                        background: meta.bg, color: meta.color, letterSpacing: '0.04em'
                      }}>
                        {meta.label.toUpperCase()}
                      </span>
                      <span style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 11, color: 'var(--text-tertiary)', padding: '1px 6px', background: 'rgba(255,255,255,0.04)', borderRadius: 4 }}>
                        {bug.method} {bug.path}
                      </span>
                    </div>
                    <h3 style={{ fontSize: 14, fontWeight: 600, marginBottom: 6 }}>{bug.title}</h3>
                    <p style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.6, marginBottom: 10 }}>{bug.description}</p>
                    {bug.root_cause && (
                      <div style={{ fontSize: 12, color: 'var(--text-secondary)', padding: '8px 12px', background: 'rgba(0,0,0,0.2)', borderRadius: 6, marginBottom: 8, fontFamily: 'JetBrains Mono, monospace' }}>
                        <span style={{ color: 'var(--text-tertiary)' }}>Root cause: </span>{bug.root_cause}
                      </div>
                    )}
                    {bug.suggested_fix && (
                      <div style={{ fontSize: 12, color: 'var(--green)', padding: '8px 12px', background: 'var(--green-bg)', borderRadius: 6, border: '1px solid var(--green-border)' }}>
                        💡 {bug.suggested_fix}
                      </div>
                    )}
                  </div>
                  <div style={{ padding: '16px 14px', borderLeft: '1px solid var(--border)', display: 'flex', alignItems: 'flex-start' }}>
                    <button
                      className="btn btn-ghost btn-sm"
                      onClick={() => dismissBug(projectId, bug.id)}
                      style={{ display: 'flex', alignItems: 'center', gap: 4 }}
                    >
                      <X size={12} /> Dismiss
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ─── Reports Page ────────────────────────────────────────────────────────────

export function ReportsPage() {
  const { projectId } = useParams();
  const [reports, setReports] = useState([]);
  const { addToast } = useStore();

  useEffect(() => {
    import('../../store/index.js').then(({ api }) => {
      api.reports.list(projectId).then(setReports).catch(() => { });
    });
  }, [projectId]);

  return (
    <div className="page">
      <div className="page-header">
        <h1 className="page-title">Reports</h1>
        <p className="page-subtitle">Download execution reports from Cloudflare R2 storage</p>
      </div>
      {reports.length === 0 ? (
        <div className="card">
          <div className="empty-state">
            <BarChart3 size={40} />
            <h3>No reports yet</h3>
            <p>Run a test suite to generate an HTML report stored in R2</p>
          </div>
        </div>
      ) : (
        <div className="card" style={{ overflow: 'hidden' }}>
          <table className="table">
            <thead>
              <tr><th>Format</th><th>Size</th><th>Generated</th><th /></tr>
            </thead>
            <tbody>
              {reports.map(r => (
                <tr key={r.id}>
                  <td><span className="badge badge-accent">{r.format.toUpperCase()}</span></td>
                  <td style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
                    {r.size_bytes ? `${Math.round(r.size_bytes / 1024)}KB` : '—'}
                  </td>
                  <td style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
                    {new Date(r.created_at * 1000).toLocaleString()}
                  </td>
                  <td>
                    <a href={`/api/reports/${r.id}/download`} target="_blank" rel="noopener noreferrer"
                      className="btn btn-ghost btn-sm" style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                      <ExternalLink size={12} /> Open
                    </a>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ─── New Project Modal ───────────────────────────────────────────────────────

export function NewProjectModal({ onClose, onCreated }) {
  const { createProject } = useStore();
  const [form, setForm] = useState({
    name: '', description: '', swagger_url: '', base_url: '',
    environment: 'development', auth_type: 'none'
  });
  const [loading, setLoading] = useState(false);

  function set(field, value) {
    setForm(f => ({ ...f, [field]: value }));
  }

  async function handleCreate() {
    if (!form.name.trim() || !form.base_url.trim()) return;
    setLoading(true);
    try {
      const project = await createProject(form);
      onCreated?.(project);
      onClose();
    } catch (err) {
      alert(err.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" style={{ width: 520 }} onClick={e => e.stopPropagation()}>
        <div className="modal-title">New project</div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div>
            <label style={{ fontSize: 12, color: 'var(--text-secondary)', display: 'block', marginBottom: 5 }}>Project name *</label>
            <input className="input" placeholder="Payment Service" value={form.name} onChange={e => set('name', e.target.value)} autoFocus />
          </div>
          <div>
            <label style={{ fontSize: 12, color: 'var(--text-secondary)', display: 'block', marginBottom: 5 }}>Base URL *</label>
            <input className="input" placeholder="https://api.company.com" value={form.base_url} onChange={e => set('base_url', e.target.value)} />
          </div>
          <div>
            <label style={{ fontSize: 12, color: 'var(--text-secondary)', display: 'block', marginBottom: 5 }}>Swagger URL</label>
            <input className="input" placeholder="https://api.company.com/swagger.json" value={form.swagger_url} onChange={e => set('swagger_url', e.target.value)} />
          </div>
          <div className="grid-2">
            <div>
              <label style={{ fontSize: 12, color: 'var(--text-secondary)', display: 'block', marginBottom: 5 }}>Environment</label>
              <select className="input" value={form.environment} onChange={e => set('environment', e.target.value)}>
                <option value="development">Development</option>
                <option value="staging">Staging</option>
                <option value="qa">QA</option>
                <option value="production">Production</option>
              </select>
            </div>
            <div>
              <label style={{ fontSize: 12, color: 'var(--text-secondary)', display: 'block', marginBottom: 5 }}>Authentication</label>
              <select className="input" value={form.auth_type} onChange={e => set('auth_type', e.target.value)}>
                <option value="none">None</option>
                <option value="bearer">Bearer token (static)</option>
                <option value="basic">Basic auth</option>
                <option value="apikey">API key</option>
                <option value="login_flow">Login flow (auto token)</option>
              </select>
            </div>
          </div>

          {/* Login flow config */}
          {form.auth_type === 'login_flow' && (
            <div style={{ background: 'rgba(130,100,255,0.06)', border: '1px solid rgba(130,100,255,0.2)', borderRadius: 8, padding: '14px 16px' }}>
              <div style={{ fontSize: 12, color: 'var(--accent)', fontWeight: 500, marginBottom: 12 }}>
                🔐 Login flow — APIForge will POST to your login endpoint first, extract the token, then inject it as Bearer into all test requests.
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                <div>
                  <label style={{ fontSize: 12, color: 'var(--text-secondary)', display: 'block', marginBottom: 5 }}>Login URL</label>
                  <input className="input" placeholder="https://api.example.com/auth/login"
                    value={form.auth_config?.login_url || ''}
                    onChange={e => set('auth_config', { ...form.auth_config, login_url: e.target.value })} />
                </div>
                <div>
                  <label style={{ fontSize: 12, color: 'var(--text-secondary)', display: 'block', marginBottom: 5 }}>Login body (JSON)</label>
                  <textarea className="input" style={{ height: 64, resize: 'none', fontFamily: 'JetBrains Mono, monospace', fontSize: 12 }}
                    placeholder={'{"email":"test@example.com","password":"secret"}'}
                    value={typeof form.auth_config?.login_body === 'string' ? form.auth_config.login_body : JSON.stringify(form.auth_config?.login_body || {})}
                    onChange={e => {
                      try { set('auth_config', { ...form.auth_config, login_body: JSON.parse(e.target.value) }); }
                      catch { set('auth_config', { ...form.auth_config, login_body: e.target.value }); }
                    }} />
                </div>
                <div>
                  <label style={{ fontSize: 12, color: 'var(--text-secondary)', display: 'block', marginBottom: 5 }}>
                    Token path in response
                    <span style={{ color: 'var(--text-tertiary)', marginLeft: 6 }}>e.g. "token" or "data.access_token"</span>
                  </label>
                  <input className="input" placeholder="token"
                    value={form.auth_config?.token_path || ''}
                    onChange={e => set('auth_config', { ...form.auth_config, token_path: e.target.value })} />
                </div>
              </div>
            </div>
          )}
          <div>
            <label style={{ fontSize: 12, color: 'var(--text-secondary)', display: 'block', marginBottom: 5 }}>Description</label>
            <textarea
              className="input"
              style={{ height: 70, resize: 'none' }}
              placeholder="Optional project description"
              value={form.description}
              onChange={e => set('description', e.target.value)}
            />
          </div>
        </div>

        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 22 }}>
          <button className="btn btn-ghost" onClick={onClose}>Cancel</button>
          <button className="btn btn-primary" onClick={handleCreate} disabled={loading || !form.name || !form.base_url}>
            {loading ? <><div className="spinner" style={{ width: 14, height: 14 }} /> Creating…</> : 'Create project'}
          </button>
        </div>
      </div >
    </div >
  );
}

// ─── Toast Container ─────────────────────────────────────────────────────────

export function ToastContainer() {
  const { toasts, removeToast } = useStore();
  if (!toasts.length) return null;
  return (
    <div className="toast-container">
      {toasts.map(t => (
        <div key={t.id} className={`toast toast-${t.type}`} onClick={() => removeToast(t.id)}>
          {t.type === 'success' && '✓'}
          {t.type === 'error' && '✗'}
          {t.type === 'info' && 'ℹ'}
          <span>{t.message}</span>
        </div>
      ))}
    </div>
  );
}