import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Shield, Users, FolderKanban, RefreshCw, Search, ArrowRight, AlertTriangle, X, Activity, UserPlus, LogIn, FileCheck, FolderPlus, Download, Sparkles, Play, GitBranch, Bug } from 'lucide-react';
import { api, useStore } from '../../store/index.js';

/**
 * Super Admin — every user and every project on the platform.
 * Opening a project shows all its pages read-only (enforced by the worker).
 */

function fmtDate(ts) {
    if (!ts) return '—';
    return new Date(ts * 1000).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
}
function fmtAgo(ts) {
    if (!ts) return '—';
    const s = Math.floor(Date.now() / 1000) - ts;
    if (s < 60) return 'just now';
    if (s < 3600) return `${Math.floor(s / 60)} min ago`;
    if (s < 86400) return `${Math.floor(s / 3600)} h ago`;
    if (s < 86400 * 30) return `${Math.floor(s / 86400)} d ago`;
    return fmtDate(ts);
}

const th = { cursor: 'pointer', userSelect: 'none', whiteSpace: 'nowrap' };

// ─── Activity timeline ───────────────────────────────────────────────────────

const ACTIVITY = {
    signup: { icon: UserPlus, color: 'var(--green)', label: 'Sign-ups' },
    login: { icon: LogIn, color: 'var(--blue)', label: 'Logins (latest)' },
    terms: { icon: FileCheck, color: 'var(--text-secondary)', label: 'Terms accepted' },
    project_created: { icon: FolderPlus, color: 'var(--accent)', label: 'Projects created' },
    endpoints_imported: { icon: Download, color: 'var(--accent)', label: 'Endpoints imported' },
    tests_generated: { icon: Sparkles, color: 'var(--accent)', label: 'Tests generated' },
    test_run: { icon: Play, color: 'var(--blue)', label: 'Test runs' },
    flow_created: { icon: GitBranch, color: 'var(--accent)', label: 'Flows created' },
    flow_run: { icon: GitBranch, color: 'var(--blue)', label: 'Flow runs' },
    bug_found: { icon: Bug, color: 'var(--amber)', label: 'Bugs found' },
};

function plural(n, word) { return `${n} ${word}${n === 1 ? '' : 's'}`; }

function describe(a) {
    const project = a.project_name ? <b>{a.project_name}</b> : 'a deleted project';
    switch (a.type) {
        case 'signup': return <>signed up</>;
        case 'login': return <>logged in <span className="text-tertiary">(most recent login)</span></>;
        case 'terms': return <>accepted the Terms &amp; Conditions{a.label ? ` (version ${a.label})` : ''}</>;
        case 'project_created': return <>created project {project}</>;
        case 'endpoints_imported': return <>imported {plural(a.total, 'endpoint')} into {project}</>;
        case 'tests_generated': return <>generated {plural(a.total, 'test case')} for {project}</>;
        case 'test_run': {
            const what = a.label === 'schedule' ? 'scheduled run of' : 'ran';
            if (a.status === 'running' || a.status === 'queued') return <>{what} {plural(a.total, 'test')} on {project} <span className="text-tertiary">({a.status})</span></>;
            return <>{what} {plural(a.total, 'test')} on {project} — <span className="text-green">{a.passed} passed</span>{a.failed ? <>, <span className="text-red">{a.failed} failed</span></> : null}</>;
        }
        case 'flow_created': return <>created flow <b>"{a.label}"</b> in {project}</>;
        case 'flow_run': return <>ran flow <b>"{a.label}"</b> on {project} — {a.status === 'running' ? 'running' : <><span className="text-green">{a.passed} passed</span>{a.failed ? <>, <span className="text-red">{a.failed} failed</span></> : null} of {plural(a.total, 'step')}</>}</>;
        case 'bug_found': return <>bug found in {project}: <b>"{a.label}"</b> {a.status ? <span className={`badge ${a.status === 'critical' || a.status === 'high' ? 'badge-red' : 'badge-amber'}`} style={{ fontSize: 9, marginLeft: 4 }}>{a.status}</span> : null}</>;
        default: return a.type;
    }
}

function useSort(rows, initialKey, initialDir = 'desc') {
    const [sort, setSort] = useState({ key: initialKey, dir: initialDir });
    const sorted = useMemo(() => {
        const r = [...rows];
        r.sort((a, b) => {
            const x = a[sort.key] ?? '', y = b[sort.key] ?? '';
            const c = typeof x === 'number' && typeof y === 'number' ? x - y : String(x).localeCompare(String(y));
            return sort.dir === 'asc' ? c : -c;
        });
        return r;
    }, [rows, sort]);
    const header = (key, label, style) => (
        <th style={{ ...th, ...style }} onClick={() => setSort(s => ({ key, dir: s.key === key && s.dir === 'desc' ? 'asc' : 'desc' }))}>
            {label}{sort.key === key ? (sort.dir === 'desc' ? ' ↓' : ' ↑') : ''}
        </th>
    );
    return [sorted, header];
}

function StatCard({ label, value, sub, color = 'var(--text-primary)' }) {
    return (
        <div style={{ padding: '14px 18px', background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 10 }}>
            <div style={{ fontSize: 24, fontWeight: 700, color }}>{value ?? '—'}</div>
            <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{label}</div>
            {sub && <div style={{ fontSize: 11, color: 'var(--text-tertiary)', marginTop: 2 }}>{sub}</div>}
        </div>
    );
}

export function SuperAdminPage() {
    const navigate = useNavigate();
    const { isAdmin, setCurrentProject, addToast } = useStore();

    const [tab, setTab] = useState('users');
    const [stats, setStats] = useState(null);
    const [users, setUsers] = useState([]);
    const [projects, setProjects] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [q, setQ] = useState('');
    const [ownerFilter, setOwnerFilter] = useState(null); // { id, label }

    // Activity tab
    const [activity, setActivity] = useState([]);
    const [actNext, setActNext] = useState(null);
    const [actLoading, setActLoading] = useState(false);
    const [actUser, setActUser] = useState('');
    const [actType, setActType] = useState('');

    async function loadActivity(more = false) {
        setActLoading(true);
        try {
            const params = { limit: 100 };
            if (actUser) params.user_id = actUser;
            if (actType) params.type = actType;
            if (more && actNext) params.before = actNext;
            const res = await api.admin.activity(params);
            setActivity(a => (more ? [...a, ...(res.items || [])] : (res.items || [])));
            setActNext(res.has_more ? res.next_before : null);
        } catch (e) {
            addToast(e.message, 'error');
        } finally {
            setActLoading(false);
        }
    }
    useEffect(() => { if (isAdmin && tab === 'activity') loadActivity(false); }, [isAdmin, tab, actUser, actType]);

    async function load() {
        setLoading(true); setError(null);
        try {
            const [s, u, p] = await Promise.all([api.admin.stats(), api.admin.users(), api.admin.projects()]);
            setStats(s); setUsers(u || []); setProjects(p || []);
            if (tab === 'activity') loadActivity(false);
        } catch (e) {
            setError(e.message);
        } finally {
            setLoading(false);
        }
    }
    useEffect(() => { if (isAdmin) load(); }, [isAdmin]);

    const needle = q.trim().toLowerCase();
    const filteredUsers = useMemo(() => users.filter(u =>
        !needle || `${u.name} ${u.email}`.toLowerCase().includes(needle)), [users, needle]);
    const filteredProjects = useMemo(() => projects.filter(p =>
        (!ownerFilter || p.user_id === ownerFilter.id) &&
        (!needle || `${p.name} ${p.base_url} ${p.owner_email} ${p.owner_name}`.toLowerCase().includes(needle))), [projects, needle, ownerFilter]);

    const [sortedUsers, userTh] = useSort(filteredUsers, 'created_at');
    const [sortedProjects, projTh] = useSort(filteredProjects, 'created_at');

    function openProject(p) {
        setCurrentProject(p);
        navigate(`/projects/${p.id}/dashboard`);
    }
    function showUserActivity(u) {
        setActUser(u.id); setActType(''); setTab('activity');
    }
    function showUserProjects(u) {
        if (!u.project_count) { addToast(`${u.name || u.email} has no projects yet`, 'info'); return; }
        setOwnerFilter({ id: u.id, label: u.name || u.email });
        setQ(''); setTab('projects');
    }

    if (!isAdmin) {
        return (
            <div className="page">
                <div className="card"><div className="empty-state">
                    <Shield size={32} />
                    <h3>Super admin only</h3>
                    <p>You don't have access to this page.</p>
                </div></div>
            </div>
        );
    }

    return (
        <div className="page">
            <div className="page-header" style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16 }}>
                <div>
                    <h1 className="page-title" style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        <Shield size={20} color="var(--accent)" /> Super Admin
                    </h1>
                    <p className="page-subtitle">All users and projects on HitAPI. Opening someone else's project is read-only, and stored credentials are hidden.</p>
                </div>
                <div style={{ display: 'flex', gap: 8 }}>
                    <button className="btn btn-ghost btn-sm" onClick={() => navigate('/admin/errors')}>
                        <AlertTriangle size={13} /> Platform errors
                    </button>
                    <button className="btn btn-ghost btn-sm" onClick={load} disabled={loading}>
                        <RefreshCw size={13} /> Refresh
                    </button>
                </div>
            </div>

            {error && (
                <div style={{ padding: 12, marginBottom: 16, borderRadius: 'var(--radius-sm)', background: 'var(--red-bg)', border: '1px solid var(--red-border)', color: 'var(--red)', fontSize: 13 }}>
                    {error}
                </div>
            )}

            {/* Totals */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 12, marginBottom: 24 }}>
                <StatCard label="Users" value={stats?.users} sub={stats ? `+${stats.users_7d} this week` : null} color="var(--accent)" />
                <StatCard label="Projects" value={stats?.projects} />
                <StatCard label="Endpoints" value={stats?.endpoints} />
                <StatCard label="Test cases" value={stats?.test_cases} />
                <StatCard label="Test runs" value={stats?.executions} sub={stats ? `${stats.executions_24h} in last 24 h` : null} color="var(--blue)" />
                <StatCard label="Flow suites" value={stats?.flow_suites} sub={stats ? `${stats.flow_runs} runs` : null} />
                <StatCard label="Open bugs" value={stats?.open_bugs} color="var(--amber)" />
            </div>

            {/* Tabs + search */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12, flexWrap: 'wrap' }}>
                {[['users', Users, `Users (${users.length})`], ['projects', FolderKanban, `Projects (${projects.length})`], ['activity', Activity, 'Activity']].map(([id, Icon, label]) => (
                    <button key={id} className={`btn btn-sm ${tab === id ? 'btn-primary' : 'btn-ghost'}`} onClick={() => setTab(id)}>
                        <Icon size={13} /> {label}
                    </button>
                ))}
                {tab === 'projects' && ownerFilter && (
                    <span className="badge badge-accent" style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                        Owner: {ownerFilter.label}
                        <button onClick={() => setOwnerFilter(null)} aria-label="Clear owner filter" style={{ background: 'none', color: 'inherit', padding: 0, display: 'flex' }}><X size={11} /></button>
                    </span>
                )}
                {tab === 'activity' ? (
                    <div style={{ marginLeft: 'auto', display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                        <select className="input" style={{ width: 220 }} value={actUser} onChange={e => setActUser(e.target.value)} aria-label="Filter by user">
                            <option value="">All users</option>
                            {[...users].sort((a, b) => (a.name || a.email).localeCompare(b.name || b.email)).map(u => (
                                <option key={u.id} value={u.id}>{u.name ? `${u.name} (${u.email})` : u.email}</option>
                            ))}
                        </select>
                        <select className="input" style={{ width: 190 }} value={actType} onChange={e => setActType(e.target.value)} aria-label="Filter by activity">
                            <option value="">All activity</option>
                            {Object.entries(ACTIVITY).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
                        </select>
                    </div>
                ) : (
                    <div style={{ marginLeft: 'auto', position: 'relative', width: 280, maxWidth: '100%' }}>
                        <Search size={13} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-tertiary)' }} />
                        <input className="input" style={{ paddingLeft: 30 }} placeholder={tab === 'users' ? 'Search name or email' : 'Search project, URL or owner'}
                            value={q} onChange={e => setQ(e.target.value)} />
                    </div>
                )}
            </div>

            {tab === 'activity' ? (
                <div className="card" style={{ padding: 0 }}>
                    {activity.map((a, i) => {
                        const meta = ACTIVITY[a.type] || { icon: Activity, color: 'var(--text-tertiary)' };
                        const Icon = meta.icon;
                        const proj = a.project_id ? projects.find(p => p.id === a.project_id) : null;
                        return (
                            <div key={`${a.type}-${a.ts}-${i}`} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '11px 16px', borderTop: i ? '1px solid var(--border)' : 'none' }}>
                                <div style={{ width: 30, height: 30, borderRadius: 8, background: 'rgba(255,255,255,0.04)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                                    <Icon size={14} color={meta.color} />
                                </div>
                                <div style={{ flex: 1, minWidth: 0, fontSize: 13, lineHeight: 1.5 }}>
                                    <b>{a.user_name || a.user_email || 'Unknown user'}</b>{' '}{describe(a)}
                                    {a.user_email && a.user_name && <div className="text-xs text-tertiary">{a.user_email}</div>}
                                </div>
                                {proj && (
                                    <button className="btn btn-ghost btn-sm" onClick={() => openProject(proj)} title="Open this project (read-only)">
                                        Open <ArrowRight size={12} />
                                    </button>
                                )}
                                <div className="text-xs text-tertiary" style={{ width: 92, textAlign: 'right', flexShrink: 0 }} title={new Date(a.ts * 1000).toLocaleString()}>
                                    {fmtAgo(a.ts)}
                                </div>
                            </div>
                        );
                    })}
                    {!activity.length && !actLoading && (
                        <div className="empty-state"><Activity size={28} /><h3>No activity</h3><p>Nothing matches these filters yet.</p></div>
                    )}
                    {actLoading && <div className="empty-state" style={{ padding: 24 }}><div className="spinner" style={{ width: 22, height: 22 }} /></div>}
                    {actNext && !actLoading && (
                        <div style={{ padding: 12, textAlign: 'center', borderTop: '1px solid var(--border)' }}>
                            <button className="btn btn-ghost btn-sm" onClick={() => loadActivity(true)}>Load older activity</button>
                        </div>
                    )}
                </div>
            ) : loading ? (
                <div className="empty-state"><div className="spinner" style={{ width: 28, height: 28 }} /></div>
            ) : tab === 'users' ? (
                <div className="card" style={{ overflowX: 'auto' }}>
                    <table className="table">
                        <thead><tr>
                            {userTh('name', 'User')}
                            {userTh('created_at', 'Signed up')}
                            {userTh('last_login_at', 'Last login')}
                            {userTh('project_count', 'Projects', { textAlign: 'right' })}
                            {userTh('execution_count', 'Test runs', { textAlign: 'right' })}
                            {userTh('last_run_at', 'Last run')}
                            <th></th>
                        </tr></thead>
                        <tbody>
                            {sortedUsers.map(u => (
                                <tr key={u.id}>
                                    <td>
                                        <div style={{ fontWeight: 500, display: 'flex', alignItems: 'center', gap: 6 }}>
                                            {u.name || '—'} {u.is_admin ? <span className="badge badge-accent" style={{ fontSize: 9 }}>Admin</span> : null}
                                        </div>
                                        <div className="text-xs text-tertiary">{u.email}</div>
                                    </td>
                                    <td className="text-sm">{fmtDate(u.created_at)}</td>
                                    <td className="text-sm" title={u.last_login_at ? new Date(u.last_login_at * 1000).toLocaleString() : 'Not recorded yet'}>{fmtAgo(u.last_login_at)}</td>
                                    <td className="text-sm" style={{ textAlign: 'right' }}>{u.project_count}</td>
                                    <td className="text-sm" style={{ textAlign: 'right' }}>{u.execution_count}</td>
                                    <td className="text-sm">{fmtAgo(u.last_run_at)}</td>
                                    <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                                        <button className="btn btn-ghost btn-sm" onClick={() => showUserActivity(u)}>
                                            <Activity size={12} /> Activity
                                        </button>{' '}
                                        <button className="btn btn-ghost btn-sm" onClick={() => showUserProjects(u)} disabled={!u.project_count}>
                                            Projects <ArrowRight size={12} />
                                        </button>
                                    </td>
                                </tr>
                            ))}
                            {!sortedUsers.length && <tr><td colSpan={7} className="text-tertiary" style={{ textAlign: 'center', padding: 24 }}>No users match.</td></tr>}
                        </tbody>
                    </table>
                </div>
            ) : (
                <div className="card" style={{ overflowX: 'auto' }}>
                    <table className="table">
                        <thead><tr>
                            {projTh('name', 'Project')}
                            {projTh('owner_email', 'Owner')}
                            {projTh('endpoint_count', 'Endpoints', { textAlign: 'right' })}
                            {projTh('test_count', 'Tests', { textAlign: 'right' })}
                            {projTh('execution_count', 'Runs', { textAlign: 'right' })}
                            {projTh('open_bugs', 'Open bugs', { textAlign: 'right' })}
                            {projTh('last_run_at', 'Last run')}
                            {projTh('created_at', 'Created')}
                            <th></th>
                        </tr></thead>
                        <tbody>
                            {sortedProjects.map(p => (
                                <tr key={p.id}>
                                    <td>
                                        <div style={{ fontWeight: 500 }}>{p.name}</div>
                                        <div className="text-xs text-tertiary font-mono truncate" style={{ maxWidth: 260 }}>{p.base_url}</div>
                                    </td>
                                    <td>
                                        <div className="text-sm">{p.owner_name || '—'}</div>
                                        <div className="text-xs text-tertiary">{p.owner_email || 'no owner'}</div>
                                    </td>
                                    <td className="text-sm" style={{ textAlign: 'right' }}>{p.endpoint_count}</td>
                                    <td className="text-sm" style={{ textAlign: 'right' }}>{p.test_count}</td>
                                    <td className="text-sm" style={{ textAlign: 'right' }}>{p.execution_count}</td>
                                    <td className="text-sm" style={{ textAlign: 'right', color: p.open_bugs ? 'var(--amber)' : undefined }}>{p.open_bugs}</td>
                                    <td className="text-sm">{fmtAgo(p.last_run_at)}</td>
                                    <td className="text-sm">{fmtDate(p.created_at)}</td>
                                    <td style={{ textAlign: 'right' }}>
                                        <button className="btn btn-primary btn-sm" onClick={() => openProject(p)} disabled={!p.user_id}>
                                            Open <ArrowRight size={12} />
                                        </button>
                                    </td>
                                </tr>
                            ))}
                            {!sortedProjects.length && <tr><td colSpan={9} className="text-tertiary" style={{ textAlign: 'center', padding: 24 }}>No projects match.</td></tr>}
                        </tbody>
                    </table>
                </div>
            )}
        </div>
    );
}