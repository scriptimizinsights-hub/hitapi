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
  const [sourceFilter, setSourceFilter] = useState('all');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    loadBugs(projectId).finally(() => setLoading(false));
  }, [projectId]);

  const filtered = bugs
    .filter(b => severityFilter === 'all' || b.severity === severityFilter)
    .filter(b => sourceFilter === 'all' || b.source === sourceFilter);

  const flowBugCount = bugs.filter(b => b.source === 'flow').length;
  const testBugCount = bugs.filter(b => b.source !== 'flow').length;

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h1 className="page-title">AI Bug Detection</h1>
          <p className="page-subtitle">Issues automatically detected by Cloudflare Workers AI</p>
        </div>
        <button onClick={() => loadBugs(projectId)} className="btn btn-ghost btn-sm">↻ Refresh</button>
      </div>

      {/* Source filter */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
        {[
          { key: 'all', label: `All bugs`, count: bugs.length },
          { key: 'flow', label: 'Flow Suite', count: flowBugCount, color: 'var(--accent)' },
          { key: 'test', label: 'Test Cases', count: testBugCount, color: 'var(--blue)' },
        ].map(({ key, label, count, color }) => (
          <button key={key} onClick={() => setSourceFilter(key)} style={{
            padding: '5px 12px', borderRadius: 6, fontSize: 11, cursor: 'pointer',
            background: sourceFilter === key ? 'rgba(130,100,255,0.1)' : 'var(--bg-card)',
            color: sourceFilter === key ? (color || 'var(--accent)') : 'var(--text-secondary)',
            border: `1px solid ${sourceFilter === key ? 'rgba(130,100,255,0.3)' : 'var(--border)'}`,
            fontWeight: sourceFilter === key ? 600 : 400,
            display: 'flex', alignItems: 'center', gap: 6,
          }}>
            {label}
            <span style={{ fontSize: 10, padding: '1px 6px', borderRadius: 10, background: 'rgba(255,255,255,0.06)' }}>{count}</span>
          </button>
        ))}
      </div>

      {/* Severity filters */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 20 }}>
        {['all', 'critical', 'high', 'medium', 'low'].map(s => {
          const meta = SEV[s] || { color: 'var(--text-secondary)', bg: 'var(--bg-card)', border: 'var(--border)', label: 'All' };
          const count = s === 'all' ? filtered.length : filtered.filter(b => b.severity === s).length;
          const active = severityFilter === s;
          return (
            <button key={s} onClick={() => setSeverityFilter(s)} style={{
              padding: '5px 12px', borderRadius: 6, fontSize: 11, cursor: 'pointer',
              background: active ? meta.bg : 'var(--bg-card)',
              color: active ? meta.color : 'var(--text-secondary)',
              border: active ? `1px solid ${meta.border}` : '1px solid var(--border)',
              fontWeight: active ? 600 : 400,
              display: 'flex', alignItems: 'center', gap: 6,
            }}>
              {s === 'all' ? 'All severities' : meta.label}
              <span style={{ fontSize: 10, padding: '1px 6px', borderRadius: 10, background: 'rgba(255,255,255,0.06)', color: active ? meta.color : 'var(--text-tertiary)' }}>{count}</span>
            </button>
          );
        })}
      </div>

      {loading ? (
        <div className="card"><div className="empty-state"><div className="spinner" /><p>Loading bugs...</p></div></div>
      ) : bugs.length === 0 ? (
        <div className="card">
          <div className="empty-state">
            <Bug size={40} />
            <h3 style={{ color: 'var(--green)' }}>No open bugs</h3>
            <p>Run a flow suite or test cases to detect API issues automatically</p>
          </div>
        </div>
      ) : filtered.length === 0 ? (
        <div className="card">
          <div className="empty-state">
            <Bug size={32} />
            <p style={{ color: 'var(--text-tertiary)' }}>No bugs match this filter</p>
          </div>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {filtered.map(bug => {
            const meta = SEV[bug.severity] || SEV.medium;
            const isFlow = bug.source === 'flow';
            return (
              <div key={bug.id} className="card" style={{ padding: 0, overflow: 'hidden' }}>
                <div style={{ display: 'flex', alignItems: 'stretch', borderLeft: `3px solid ${meta.color}` }}>
                  <div style={{ flex: 1, padding: '14px 18px' }}>

                    {/* Top row — severity + source + endpoint */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8, flexWrap: 'wrap' }}>
                      <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 7px', borderRadius: 4, background: meta.bg, color: meta.color, letterSpacing: '.04em' }}>
                        {meta.label.toUpperCase()}
                      </span>
                      <span style={{
                        fontSize: 10, padding: '2px 7px', borderRadius: 4, fontWeight: 600,
                        background: isFlow ? 'rgba(130,100,255,0.1)' : 'rgba(59,130,246,0.1)',
                        color: isFlow ? 'var(--accent)' : 'var(--blue)',
                        border: `1px solid ${isFlow ? 'rgba(130,100,255,0.2)' : 'rgba(59,130,246,0.2)'}`,
                      }}>
                        {isFlow ? '⟳ Flow Suite' : '▶ Test Case'}
                      </span>
                      {(bug.method || bug.path) && (
                        <span style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 11, color: 'var(--text-tertiary)', padding: '1px 6px', background: 'rgba(255,255,255,0.04)', borderRadius: 4 }}>
                          {bug.method} {bug.path}
                        </span>
                      )}
                      {isFlow && bug.flow_step_id && (
                        <span style={{ fontSize: 10, color: 'var(--text-tertiary)' }}>
                          step {bug.step_order || ''}
                        </span>
                      )}
                    </div>

                    {/* Title */}
                    <h3 style={{ fontSize: 14, fontWeight: 600, marginBottom: 6, lineHeight: 1.4 }}>{bug.title}</h3>

                    {/* Description */}
                    <p style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.6, marginBottom: 10 }}>{bug.description}</p>

                    {/* Root cause */}
                    {bug.root_cause && (
                      <div style={{ fontSize: 12, color: 'var(--text-secondary)', padding: '7px 10px', background: 'rgba(0,0,0,0.2)', borderRadius: 6, marginBottom: 8, lineHeight: 1.5 }}>
                        <span style={{ color: 'var(--text-tertiary)', fontWeight: 600 }}>Root cause: </span>{bug.root_cause}
                      </div>
                    )}

                    {/* Suggested fix */}
                    {bug.suggested_fix && (
                      <div style={{ fontSize: 12, color: 'var(--green)', padding: '7px 10px', background: 'var(--green-bg)', borderRadius: 6, border: '1px solid var(--green-border)', lineHeight: 1.5 }}>
                        💡 <strong>Fix:</strong> {bug.suggested_fix}
                      </div>
                    )}

                    {/* Flow run link */}
                    {isFlow && bug.flow_run_id && (
                      <div style={{ marginTop: 8 }}>
                        <a href={`/projects/${projectId}/flows`} style={{ fontSize: 11, color: 'var(--accent)', textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                          <ExternalLink size={11} /> View flow run
                        </a>
                      </div>
                    )}
                  </div>

                  {/* Dismiss button */}
                  <div style={{ padding: '14px 12px', borderLeft: '1px solid var(--border)', display: 'flex', alignItems: 'flex-start' }}>
                    <button className="btn btn-ghost btn-sm" onClick={() => dismissBug(projectId, bug.id)}
                      style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 11 }}>
                      <X size={11} /> Dismiss
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
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState(null);

  function load() {
    setLoading(true);
    import('../../store/index.js').then(({ api }) => {
      api.reports.list(projectId).then(data => {
        setReports(Array.isArray(data) ? data : []);
      }).catch(() => setReports([])).finally(() => setLoading(false));
    });
  }

  useEffect(() => { load(); }, [projectId]);

  const passRate = (r) => {
    const total = r.run_total || 0;
    if (!total) return null;
    return Math.round(((r.run_passed || 0) / total) * 100);
  };

  const duration = (r) => {
    if (!r.run_started || !r.run_finished) return null;
    const secs = r.run_finished - r.run_started;
    return secs < 60 ? `${secs}s` : `${Math.floor(secs / 60)}m ${secs % 60}s`;
  };

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h1 className="page-title">Reports</h1>
          <p className="page-subtitle">Flow suite run history and results</p>
        </div>
        <button onClick={load} className="btn btn-ghost btn-sm">↻ Refresh</button>
      </div>

      {loading ? (
        <div className="card"><div className="empty-state"><div className="spinner" /><p>Loading reports...</p></div></div>
      ) : reports.length === 0 ? (
        <div className="card">
          <div className="empty-state">
            <BarChart3 size={40} />
            <h3>No reports yet</h3>
            <p>Run a flow suite to generate reports automatically</p>
          </div>
        </div>
      ) : (
        <div style={{ display: 'flex', gap: 16 }}>

          {/* Report list */}
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 8 }}>
            {reports.map(r => {
              const rate = passRate(r);
              const dur = duration(r);
              const isSelected = selected?.id === r.id;
              const statusColor = r.run_status === 'done' ? 'var(--green)'
                : r.run_status === 'failed' ? 'var(--red)'
                  : 'var(--amber)';

              return (
                <div key={r.id} onClick={() => setSelected(isSelected ? null : r)}
                  className="card" style={{
                    padding: '14px 18px', cursor: 'pointer', transition: 'border .12s',
                    border: isSelected ? '1px solid rgba(130,100,255,0.4)' : '1px solid var(--border)',
                    background: isSelected ? 'rgba(130,100,255,0.04)' : 'var(--bg-card)',
                  }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>

                    {/* Pass rate ring */}
                    <div style={{ flexShrink: 0, position: 'relative', width: 40, height: 40 }}>
                      <svg width="40" height="40" viewBox="0 0 40 40">
                        <circle cx="20" cy="20" r="16" fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth="4" />
                        <circle cx="20" cy="20" r="16" fill="none"
                          stroke={rate === 100 ? 'var(--green)' : rate > 50 ? 'var(--amber)' : 'var(--red)'}
                          strokeWidth="4" strokeDasharray={`${(rate || 0) * 1.005} 100.5`}
                          strokeLinecap="round" transform="rotate(-90 20 20)" />
                      </svg>
                      <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 9, fontWeight: 700, color: rate === 100 ? 'var(--green)' : 'var(--text-secondary)' }}>
                        {rate != null ? `${rate}%` : '—'}
                      </div>
                    </div>

                    {/* Suite name + date */}
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 2 }}>
                        {r.suite_name || 'Flow Suite Run'}
                      </div>
                      <div style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>
                        {new Date(r.created_at * 1000).toLocaleString()}
                        {dur && <span style={{ marginLeft: 8 }}>⏱ {dur}</span>}
                      </div>
                    </div>

                    {/* Stats */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexShrink: 0 }}>
                      {r.run_total && (
                        <div style={{ textAlign: 'center' }}>
                          <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--text-primary)' }}>{r.run_total}</div>
                          <div style={{ fontSize: 9, color: 'var(--text-tertiary)', textTransform: 'uppercase' }}>Steps</div>
                        </div>
                      )}
                      {r.run_passed != null && (
                        <div style={{ textAlign: 'center' }}>
                          <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--green)' }}>{r.run_passed}</div>
                          <div style={{ fontSize: 9, color: 'var(--text-tertiary)', textTransform: 'uppercase' }}>Passed</div>
                        </div>
                      )}
                      {r.run_failed != null && r.run_failed > 0 && (
                        <div style={{ textAlign: 'center' }}>
                          <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--red)' }}>{r.run_failed}</div>
                          <div style={{ fontSize: 9, color: 'var(--text-tertiary)', textTransform: 'uppercase' }}>Failed</div>
                        </div>
                      )}
                      {r.run_bugs > 0 && (
                        <div style={{ textAlign: 'center' }}>
                          <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--amber)' }}>{r.run_bugs}</div>
                          <div style={{ fontSize: 9, color: 'var(--text-tertiary)', textTransform: 'uppercase' }}>Bugs</div>
                        </div>
                      )}
                      <div style={{ padding: '3px 10px', borderRadius: 5, fontSize: 11, fontWeight: 600, background: r.run_status === 'done' ? 'var(--green-bg)' : r.run_status === 'failed' ? 'var(--red-bg)' : 'var(--amber-bg)', color: statusColor, border: `1px solid ${statusColor}33` }}>
                        {r.run_status || 'unknown'}
                      </div>
                    </div>
                  </div>

                  {/* Progress bar */}
                  {r.run_total > 0 && (
                    <div style={{ marginTop: 10, height: 4, borderRadius: 2, background: 'rgba(255,255,255,0.06)', overflow: 'hidden' }}>
                      <div style={{ height: '100%', borderRadius: 2, background: rate === 100 ? 'var(--green)' : 'linear-gradient(90deg, var(--green), var(--amber))', width: `${rate || 0}%`, transition: 'width .3s' }} />
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* Detail panel */}
          {selected && (
            <div style={{ width: 320, flexShrink: 0 }}>
              <div className="card" style={{ padding: '16px', position: 'sticky', top: 20 }}>
                <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 12, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span>Run Details</span>
                  <button onClick={() => setSelected(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-tertiary)', fontSize: 16, padding: 0 }}>×</button>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  <Detail label="Suite" value={selected.suite_name || '—'} />
                  <Detail label="Status" value={selected.run_status || '—'} valueColor={selected.run_status === 'done' ? 'var(--green)' : selected.run_status === 'failed' ? 'var(--red)' : 'var(--amber)'} />
                  <Detail label="Pass rate" value={`${passRate(selected) ?? '—'}%`} />
                  <Detail label="Steps" value={`${selected.run_passed || 0} passed / ${selected.run_failed || 0} failed / ${selected.run_total || 0} total`} />
                  {selected.run_bugs > 0 && <Detail label="Bugs found" value={`${selected.run_bugs} bug${selected.run_bugs > 1 ? 's' : ''}`} valueColor="var(--amber)" />}
                  <Detail label="Duration" value={duration(selected) || '—'} />
                  <Detail label="Started" value={selected.run_started ? new Date(selected.run_started * 1000).toLocaleString() : '—'} />
                  <Detail label="Format" value={(selected.format || 'json').toUpperCase()} />
                  <Detail label="Size" value={selected.size_bytes ? `${Math.round(selected.size_bytes / 1024)} KB` : '—'} />
                </div>

                <div style={{ marginTop: 14, display: 'flex', flexDirection: 'column', gap: 8 }}>
                  <a href={`/projects/${projectId}/flows`}
                    style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, padding: '8px', borderRadius: 7, background: 'rgba(130,100,255,0.08)', color: 'var(--accent)', border: '1px solid rgba(130,100,255,0.2)', fontSize: 12, fontWeight: 500, textDecoration: 'none' }}>
                    <ExternalLink size={12} /> View flow suite
                  </a>
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function Detail({ label, value, valueColor }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8, fontSize: 12 }}>
      <span style={{ color: 'var(--text-tertiary)', flexShrink: 0 }}>{label}</span>
      <span style={{ color: valueColor || 'var(--text-secondary)', fontWeight: 500, textAlign: 'right' }}>{value}</span>
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
                🔐 Login flow — HitAPI will POST to your login endpoint first, extract the token, then inject it as Bearer into all test requests.
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
      </div>
    </div>
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