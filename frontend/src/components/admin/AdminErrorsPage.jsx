import React, { useState, useEffect } from 'react';
import { api } from '../../store/index.js';
import { AlertTriangle, RefreshCw, Filter } from 'lucide-react';

const SEVERITY_COLOR = {
    critical: 'var(--red)',
    error: 'var(--amber)',
    warning: 'var(--text-tertiary)',
};

const SOURCE_ICON = {
    worker: '⚙',
    queue: '📬',
    ai: '🤖',
    db: '🗄',
    test_run: '🧪',
    flow_run: '🔀',
    swagger_import: '📥',
};

export function AdminErrorsPage() {
    const [errors, setErrors] = useState([]);
    const [stats, setStats] = useState(null);
    const [loading, setLoading] = useState(true);
    const [scope, setScope] = useState('');
    const [severity, setSeverity] = useState('');
    const [expanded, setExpanded] = useState(null);

    useEffect(() => { load(); }, [scope, severity]);

    async function load() {
        setLoading(true);
        try {
            const params = new URLSearchParams();
            if (scope) params.set('scope', scope);
            if (severity) params.set('severity', severity);
            params.set('limit', '100');

            const [errData, statsData] = await Promise.all([
                api.admin.errors(params.toString()),
                api.admin.errorStats(),
            ]);
            setErrors(errData.errors || []);
            setStats(statsData);
        } catch (e) {
            console.error(e);
        } finally {
            setLoading(false);
        }
    }

    function formatTime(ts) {
        return new Date(ts * 1000).toLocaleString();
    }

    return (
        <div className="page">
            <div className="page-header" style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
                <div>
                    <h1 className="page-title">Platform Errors</h1>
                    <p className="page-subtitle">Internal and external errors across all projects — admin only</p>
                </div>
                <button className="btn btn-ghost" onClick={load} style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                    <RefreshCw size={13} /> Refresh
                </button>
            </div>

            {/* Stats bar */}
            {stats && (
                <div style={{ display: 'flex', gap: 12, marginBottom: 20, flexWrap: 'wrap' }}>
                    {[
                        { label: 'Critical (24h)', value: stats.critical_last_24h, color: 'var(--red)' },
                        { label: 'Total errors', value: errors.length, color: 'var(--amber)' },
                        { label: 'Internal', value: errors.filter(e => e.scope === 'internal').length, color: 'var(--accent)' },
                        { label: 'External', value: errors.filter(e => e.scope === 'external').length, color: 'var(--blue)' },
                    ].map(({ label, value, color }) => (
                        <div key={label} style={{ padding: '10px 16px', background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 9, minWidth: 120 }}>
                            <div style={{ fontSize: 22, fontWeight: 700, color }}>{value}</div>
                            <div style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>{label}</div>
                        </div>
                    ))}
                </div>
            )}

            {/* Filters */}
            <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
                <select value={scope} onChange={e => setScope(e.target.value)}
                    style={{ padding: '6px 10px', borderRadius: 6, background: 'var(--bg-card)', border: '1px solid var(--border)', color: 'var(--text-primary)', fontSize: 12 }}>
                    <option value="">All scopes</option>
                    <option value="internal">Internal</option>
                    <option value="external">External</option>
                </select>
                <select value={severity} onChange={e => setSeverity(e.target.value)}
                    style={{ padding: '6px 10px', borderRadius: 6, background: 'var(--bg-card)', border: '1px solid var(--border)', color: 'var(--text-primary)', fontSize: 12 }}>
                    <option value="">All severities</option>
                    <option value="critical">Critical</option>
                    <option value="error">Error</option>
                    <option value="warning">Warning</option>
                </select>
            </div>

            {loading ? (
                <div className="empty-state"><div className="spinner" style={{ width: 28, height: 28 }} /></div>
            ) : errors.length === 0 ? (
                <div className="card">
                    <div className="empty-state">
                        <AlertTriangle size={32} color="var(--green)" />
                        <h3>No errors found</h3>
                        <p>Everything looks healthy.</p>
                    </div>
                </div>
            ) : (
                <div className="card" style={{ overflow: 'hidden' }}>
                    <table className="table">
                        <thead>
                            <tr>
                                <th style={{ width: 80 }}>Severity</th>
                                <th style={{ width: 80 }}>Scope</th>
                                <th style={{ width: 100 }}>Source</th>
                                <th>Message</th>
                                <th style={{ width: 120 }}>Project</th>
                                <th style={{ width: 140 }}>Time</th>
                            </tr>
                        </thead>
                        <tbody>
                            {errors.map(err => (
                                <React.Fragment key={err.id}>
                                    <tr onClick={() => setExpanded(expanded === err.id ? null : err.id)}
                                        style={{ cursor: 'pointer' }}
                                        onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,0.02)'}
                                        onMouseLeave={e => e.currentTarget.style.background = ''}>
                                        <td>
                                            <span style={{ fontSize: 11, fontWeight: 600, color: SEVERITY_COLOR[err.severity] || 'var(--text-tertiary)', padding: '2px 8px', borderRadius: 10, background: 'rgba(255,255,255,0.05)' }}>
                                                {err.severity}
                                            </span>
                                        </td>
                                        <td>
                                            <span style={{ fontSize: 11, color: err.scope === 'internal' ? 'var(--accent)' : 'var(--blue)' }}>
                                                {err.scope}
                                            </span>
                                        </td>
                                        <td style={{ fontSize: 12 }}>
                                            {SOURCE_ICON[err.source] || '•'} {err.source}
                                        </td>
                                        <td style={{ fontSize: 12, color: 'var(--text-secondary)', maxWidth: 400, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                            {err.message}
                                        </td>
                                        <td style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>
                                            {err.project_name || '—'}
                                        </td>
                                        <td style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>
                                            {formatTime(err.created_at)}
                                        </td>
                                    </tr>
                                    {expanded === err.id && (
                                        <tr>
                                            <td colSpan={6} style={{ padding: 0, background: 'rgba(0,0,0,0.2)' }}>
                                                <div style={{ padding: '12px 16px', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                                                    {/* HTTP details for external errors */}
                                                    {err.scope === 'external' && (
                                                        <div>
                                                            <div style={{ fontSize: 10, fontWeight: 600, color: 'var(--text-tertiary)', textTransform: 'uppercase', marginBottom: 6 }}>Request</div>
                                                            <div style={{ background: 'rgba(0,0,0,0.3)', borderRadius: 6, padding: '8px 10px', fontFamily: 'JetBrains Mono, monospace', fontSize: 11 }}>
                                                                <div><span style={{ color: 'var(--amber)' }}>Method:</span> {err.request_method}</div>
                                                                <div><span style={{ color: 'var(--amber)' }}>URL:</span> {err.request_url}</div>
                                                                <div><span style={{ color: 'var(--amber)' }}>Expected:</span> <span style={{ color: 'var(--green)' }}>{err.expected_status}</span></div>
                                                                <div><span style={{ color: 'var(--amber)' }}>Got:</span> <span style={{ color: 'var(--red)' }}>{err.actual_status}</span></div>
                                                            </div>
                                                        </div>
                                                    )}
                                                    {/* Stack trace for internal errors */}
                                                    {err.stack && (
                                                        <div style={{ gridColumn: err.scope === 'external' ? '2' : '1/-1' }}>
                                                            <div style={{ fontSize: 10, fontWeight: 600, color: 'var(--text-tertiary)', textTransform: 'uppercase', marginBottom: 6 }}>Stack trace</div>
                                                            <pre style={{ background: 'rgba(0,0,0,0.3)', borderRadius: 6, padding: '8px 10px', fontFamily: 'JetBrains Mono, monospace', fontSize: 10, color: 'var(--red)', margin: 0, maxHeight: 150, overflow: 'auto', whiteSpace: 'pre-wrap' }}>
                                                                {err.stack}
                                                            </pre>
                                                        </div>
                                                    )}
                                                    {/* Context */}
                                                    {err.context && (
                                                        <div style={{ gridColumn: '1/-1' }}>
                                                            <div style={{ fontSize: 10, fontWeight: 600, color: 'var(--text-tertiary)', textTransform: 'uppercase', marginBottom: 6 }}>Context</div>
                                                            <pre style={{ background: 'rgba(0,0,0,0.3)', borderRadius: 6, padding: '8px 10px', fontFamily: 'JetBrains Mono, monospace', fontSize: 10, color: 'var(--text-secondary)', margin: 0, maxHeight: 100, overflow: 'auto', whiteSpace: 'pre-wrap' }}>
                                                                {JSON.stringify(err.context, null, 2)}
                                                            </pre>
                                                        </div>
                                                    )}
                                                </div>
                                            </td>
                                        </tr>
                                    )}
                                </React.Fragment>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}
        </div>
    );
}