import { useEffect, useState } from 'react';
import { RefreshCw, Globe2, Server, FileText, X } from 'lucide-react';
import { api, useStore } from '../../store/index.js';

/**
 * Super Admin → Traffic: every request to the website, the API and mock
 * servers, logged in or not (kept 30 days).
 */

const KIND = {
    page: { label: 'Page', icon: FileText, cls: 'badge-green' },
    api: { label: 'API', icon: Server, cls: 'badge-blue' },
    mock: { label: 'Mock', icon: Globe2, cls: 'badge-amber' },
};

function fmtTime(ms) {
    const d = new Date(ms);
    const today = new Date().toDateString() === d.toDateString();
    return today
        ? d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit', second: '2-digit' })
        : d.toLocaleString(undefined, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
}

/** "Chrome · macOS" from a user-agent string. */
export function device(ua) {
    if (!ua) return '—';
    if (/bot|crawl|spider|slurp|bingpreview|facebookexternalhit|curl|wget|python-requests|httpclient|postman|okhttp|go-http/i.test(ua)) {
        const m = ua.match(/(Googlebot|bingbot|DuckDuckBot|YandexBot|Baiduspider|facebookexternalhit|curl|Wget|python-requests|PostmanRuntime|okhttp|Go-http-client)/i);
        return m ? m[1] : 'Bot / script';
    }
    const browser = /Edg\//.test(ua) ? 'Edge' : /OPR\//.test(ua) ? 'Opera' : /Chrome\//.test(ua) ? 'Chrome'
        : /Firefox\//.test(ua) ? 'Firefox' : /Safari\//.test(ua) ? 'Safari' : 'Other';
    const os = /Windows/.test(ua) ? 'Windows' : /iPhone|iPad/.test(ua) ? 'iOS' : /Android/.test(ua) ? 'Android'
        : /Mac OS X/.test(ua) ? 'macOS' : /Linux/.test(ua) ? 'Linux' : '';
    return os ? `${browser} · ${os}` : browser;
}

function Tile({ label, value, sub, color }) {
    return (
        <div className="card" style={{ padding: '12px 14px' }}>
            <div style={{ fontSize: 22, fontWeight: 700, color: color || 'var(--text-primary)' }}>{value ?? '—'}</div>
            <div style={{ fontSize: 'var(--fs-sm)', color: 'var(--text-secondary)' }}>{label}</div>
            {sub && <div style={{ fontSize: 'var(--fs-xs)', color: 'var(--text-tertiary)', marginTop: 2 }}>{sub}</div>}
        </div>
    );
}

export function TrafficTab({ users }) {
    const { addToast } = useStore();
    const [items, setItems] = useState([]);
    const [summary, setSummary] = useState(null);
    const [next, setNext] = useState(null);
    const [loading, setLoading] = useState(false);
    const [err, setErr] = useState(null);
    const [f, setF] = useState({ kind: '', user: '', user_id: '', status: '', q: '', ip: '' });
    const [qInput, setQInput] = useState('');

    async function load(more = false) {
        setLoading(true); setErr(null);
        try {
            const params = { limit: 100 };
            for (const [k, v] of Object.entries(f)) if (v) params[k] = v;
            if (more && next) params.before = next;
            const res = await api.admin.traffic(params);
            setItems(a => (more ? [...a, ...res.items] : res.items));
            setNext(res.has_more ? res.next_before : null);
            setSummary(res.summary);
        } catch (e) { setErr(e.message); if (more) addToast(e.message, 'error'); }
        finally { setLoading(false); }
    }
    useEffect(() => { load(false); }, [f]);
    useEffect(() => { const t = setTimeout(() => setF(x => (x.q === qInput ? x : { ...x, q: qInput })), 400); return () => clearTimeout(t); }, [qInput]);

    const set = (k, v) => setF(x => ({ ...x, [k]: v }));
    const s = summary || {};

    return (
        <div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 10, marginBottom: 12 }}>
                <Tile label="Requests (24 h)" value={s.requests} sub={s.requests ? `${s.page_views || 0} pages · ${s.api_calls || 0} API · ${s.mock_calls || 0} mock` : null} />
                <Tile label="Unique visitors (IPs)" value={s.unique_ips} color="var(--accent)" />
                <Tile label="Signed-in users" value={s.signed_in_users} color="var(--green)" />
                <Tile label="Errors (24 h)" value={(s.server_errors || 0) + (s.client_errors || 0)} sub={`${s.server_errors || 0} server (5xx) · ${s.client_errors || 0} client (4xx)`} color={s.server_errors ? 'var(--red)' : undefined} />
                <Tile label="Avg API time" value={s.avg_api_ms != null ? `${s.avg_api_ms} ms` : '—'} />
            </div>

            {(s.top_pages?.length > 0 || s.top_countries?.length > 0) && (
                <div className="grid-2" style={{ gap: 10, marginBottom: 12 }}>
                    <div className="card" style={{ padding: '10px 14px' }}>
                        <div className="text-xs text-tertiary" style={{ marginBottom: 6, textTransform: 'uppercase', letterSpacing: '.06em', fontWeight: 700 }}>Top pages (24 h)</div>
                        {(s.top_pages || []).map(p => (
                            <button key={p.path} onClick={() => { setQInput(p.path); setF(x => ({ ...x, kind: 'page', q: p.path })); }}
                                style={{ display: 'flex', width: '100%', justifyContent: 'space-between', background: 'none', padding: '3px 0', color: 'var(--text-secondary)', fontSize: 'var(--fs-sm)' }}>
                                <span className="font-mono" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.path}</span><b>{p.n}</b>
                            </button>
                        ))}
                    </div>
                    <div className="card" style={{ padding: '10px 14px' }}>
                        <div className="text-xs text-tertiary" style={{ marginBottom: 6, textTransform: 'uppercase', letterSpacing: '.06em', fontWeight: 700 }}>Top countries (24 h)</div>
                        {(s.top_countries || []).map(c => (
                            <div key={c.country} style={{ display: 'flex', justifyContent: 'space-between', padding: '3px 0', color: 'var(--text-secondary)', fontSize: 'var(--fs-sm)' }}>
                                <span>{c.country === '??' ? 'Unknown' : c.country}</span><b>{c.n}</b>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 10, alignItems: 'center' }}>
                <select className="input" style={{ width: 130 }} value={f.kind} onChange={e => set('kind', e.target.value)} aria-label="Type">
                    <option value="">All types</option><option value="page">Page views</option><option value="api">API calls</option><option value="mock">Mock calls</option>
                </select>
                <select className="input" style={{ width: 220 }} value={f.user_id || f.user} aria-label="User"
                    onChange={e => { const v = e.target.value; setF(x => ({ ...x, user: v === 'anonymous' || v === 'signed_in' ? v : '', user_id: v === 'anonymous' || v === 'signed_in' || !v ? '' : v })); }}>
                    <option value="">Everyone</option>
                    <option value="anonymous">Not signed in</option>
                    <option value="signed_in">Signed in</option>
                    {[...(users || [])].sort((a, b) => (a.name || a.email).localeCompare(b.name || b.email)).map(u => (
                        <option key={u.id} value={u.id}>{u.name ? `${u.name} (${u.email})` : u.email}</option>
                    ))}
                </select>
                <select className="input" style={{ width: 120 }} value={f.status} onChange={e => set('status', e.target.value)} aria-label="Status">
                    <option value="">Any status</option><option value="2xx">2xx</option><option value="3xx">3xx</option><option value="4xx">4xx</option><option value="5xx">5xx</option>
                </select>
                <input className="input" style={{ width: 220 }} placeholder="Path contains…" value={qInput} onChange={e => setQInput(e.target.value)} aria-label="Path contains" />
                {f.ip && (
                    <span className="badge badge-accent" style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                        IP {f.ip}
                        <button onClick={() => set('ip', '')} aria-label="Clear IP filter" style={{ background: 'none', color: 'inherit', padding: 0, display: 'flex' }}><X size={11} /></button>
                    </span>
                )}
                <button className="btn btn-ghost btn-sm" onClick={() => load(false)} style={{ marginLeft: 'auto' }} disabled={loading}>
                    <RefreshCw size={12} /> Refresh
                </button>
            </div>

            {err ? (
                <div className="card" style={{ padding: 16, color: 'var(--red)' }}>{err}</div>
            ) : (
                <div className="card" style={{ overflowX: 'auto' }}>
                    <table className="table">
                        <thead>
                            <tr>
                                <th style={{ width: 110 }}>Time</th>
                                <th style={{ width: 70 }}>Type</th>
                                <th>Request</th>
                                <th style={{ width: 70 }}>Status</th>
                                <th style={{ width: 70, textAlign: 'right' }}>Time</th>
                                <th>Who</th>
                                <th>Where</th>
                                <th>Device</th>
                            </tr>
                        </thead>
                        <tbody>
                            {items.map(r => {
                                const k = KIND[r.kind] || KIND.api;
                                return (
                                    <tr key={r.id}>
                                        <td className="text-xs text-tertiary" title={new Date(r.ts).toLocaleString()} style={{ whiteSpace: 'nowrap' }}>{fmtTime(r.ts)}</td>
                                        <td><span className={`badge ${k.cls}`}>{k.label}</span></td>
                                        <td style={{ maxWidth: 420 }}>
                                            <div className="font-mono" style={{ fontSize: 'var(--fs-sm)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={`${r.method} ${r.host || ''}${r.path}${r.query ? `?${r.query}` : ''}`}>
                                                {r.kind !== 'page' && <b style={{ marginRight: 6 }}>{r.method}</b>}{r.path}{r.query ? <span className="text-tertiary">?{r.query}</span> : null}
                                            </div>
                                            {r.referer && r.kind === 'page' && <div className="text-xs text-tertiary" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>from {r.referer}</div>}
                                        </td>
                                        <td className="font-mono" style={{ color: !r.status ? 'var(--text-tertiary)' : r.status >= 500 ? 'var(--red)' : r.status >= 400 ? 'var(--amber)' : 'var(--green)' }}>{r.status || '—'}</td>
                                        <td className="text-xs text-tertiary" style={{ textAlign: 'right' }}>{r.duration_ms != null ? `${r.duration_ms} ms` : '—'}</td>
                                        <td style={{ fontSize: 'var(--fs-sm)' }}>
                                            {r.user_id
                                                ? <button onClick={() => setF(x => ({ ...x, user: '', user_id: r.user_id }))} style={{ background: 'none', padding: 0, color: 'var(--text-primary)', textAlign: 'left' }} title={r.user_email || ''}>{r.user_name || r.user_email || 'Deleted user'}</button>
                                                : <span className="text-tertiary">Not signed in</span>}
                                        </td>
                                        <td style={{ fontSize: 'var(--fs-sm)', whiteSpace: 'nowrap' }}>
                                            <button onClick={() => r.ip && set('ip', r.ip)} title="Show only this IP" style={{ background: 'none', padding: 0, color: 'var(--text-secondary)' }}>
                                                {[r.city, r.country].filter(Boolean).join(', ') || '—'}<div className="text-xs text-tertiary font-mono">{r.ip || ''}</div>
                                            </button>
                                        </td>
                                        <td className="text-xs text-tertiary" title={r.user_agent || ''} style={{ whiteSpace: 'nowrap' }}>{device(r.user_agent)}</td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                    {!items.length && !loading && <div className="empty-state"><Globe2 size={28} /><h3>No requests</h3><p>Nothing matches these filters in the last 30 days.</p></div>}
                    {loading && <div className="empty-state" style={{ padding: 20 }}><div className="spinner" style={{ width: 22, height: 22 }} /></div>}
                    {next && !loading && (
                        <div style={{ padding: 12, textAlign: 'center', borderTop: '1px solid var(--border)' }}>
                            <button className="btn btn-ghost btn-sm" onClick={() => load(true)}>Load older requests</button>
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}
