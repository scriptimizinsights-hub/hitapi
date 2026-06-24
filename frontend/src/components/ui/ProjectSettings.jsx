import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Save, Trash2, Lock, Globe, Settings, AlertTriangle, CheckCircle2 } from 'lucide-react';
import { useStore, api } from '../../store/index.js';

const AUTH_TYPES = [
    { value: 'none', label: 'None', desc: 'No authentication' },
    { value: 'bearer', label: 'Bearer token (static)', desc: 'Fixed token in Authorization header' },
    { value: 'basic', label: 'Basic auth', desc: 'Username + password' },
    { value: 'apikey', label: 'API key', desc: 'Key in a custom header' },
    { value: 'login_flow', label: 'Login flow (auto token)', desc: 'POST to login → extract token → inject into all tests' },
];

export function ProjectSettings() {
    const { projectId } = useParams();
    const navigate = useNavigate();
    const { currentProject, projects, setCurrentProject, deleteProject, addToast } = useStore();

    const [form, setForm] = useState(null);
    const [authConfig, setAuthConfig] = useState({});
    const [saving, setSaving] = useState(false);
    const [deleting, setDeleting] = useState(false);
    const [confirmDelete, setConfirmDelete] = useState(false);
    const [testingLogin, setTestingLogin] = useState(false);
    const [loginTestResult, setLoginTestResult] = useState(null);

    // Load project into form
    useEffect(() => {
        const p = currentProject?.id === projectId
            ? currentProject
            : projects.find(x => x.id === projectId);
        if (p) {
            setForm({
                name: p.name || '',
                description: p.description || '',
                swagger_url: p.swagger_url || '',
                base_url: p.base_url || '',
                environment: p.environment || 'development',
                auth_type: p.auth_type || 'none',
            });
            try {
                setAuthConfig(p.auth_config ? JSON.parse(p.auth_config) : {});
            } catch {
                setAuthConfig({});
            }
        }
    }, [currentProject, projects, projectId]);

    function setField(key, val) {
        setForm(f => ({ ...f, [key]: val }));
    }

    function setAC(key, val) {
        setAuthConfig(c => ({ ...c, [key]: val }));
    }

    async function handleSave() {
        setSaving(true);
        setLoginTestResult(null);
        try {
            const payload = {
                ...form,
                auth_config: Object.keys(authConfig).length ? authConfig : null
            };
            const updated = await api.projects.update(projectId, payload);
            // Refresh store
            setCurrentProject(updated);
            addToast('Project settings saved', 'success');
        } catch (err) {
            addToast(err.message, 'error');
        } finally {
            setSaving(false);
        }
    }

    async function handleTestLogin() {
        setTestingLogin(true);
        setLoginTestResult(null);
        try {
            if (!authConfig.login_url) throw new Error('Login URL is required');
            if (!authConfig.login_body) throw new Error('Login body is required');

            const body = typeof authConfig.login_body === 'string'
                ? JSON.parse(authConfig.login_body)
                : authConfig.login_body;

            // Route through the Worker — avoids CORS since Worker has no origin restriction
            const result = await api.projects.testLogin(projectId, {
                login_url: authConfig.login_url,
                login_body: body,
                token_path: authConfig.token_path || 'token'
            });

            if (result.success) {
                setLoginTestResult({ success: true, message: `Token found at "${result.token_path}" — ${String(result.token_preview)}` });
            } else {
                setLoginTestResult({ success: false, message: result.message });
            }
        } catch (err) {
            setLoginTestResult({ success: false, message: err.message });
        } finally {
            setTestingLogin(false);
        }
    }

    async function handleDelete() {
        if (!confirmDelete) { setConfirmDelete(true); return; }
        setDeleting(true);
        try {
            await deleteProject(projectId);
            navigate('/');
        } catch (err) {
            addToast(err.message, 'error');
            setDeleting(false);
        }
    }

    if (!form) {
        return (
            <div className="page">
                <div className="empty-state"><div className="spinner" style={{ width: 24, height: 24 }} /></div>
            </div>
        );
    }

    return (
        <div className="page" style={{ maxWidth: 680 }}>
            <div className="page-header">
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <Settings size={18} color="var(--accent)" />
                    <h1 className="page-title" style={{ margin: 0 }}>Project settings</h1>
                </div>
                <p className="page-subtitle">Update project details, base URL, and authentication</p>
            </div>

            {/* ── General ── */}
            <div className="card" style={{ padding: '20px 22px', marginBottom: 16 }}>
                <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 16, display: 'flex', alignItems: 'center', gap: 6 }}>
                    <Globe size={14} color="var(--accent)" /> General
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                    <div>
                        <label style={{ fontSize: 12, color: 'var(--text-secondary)', display: 'block', marginBottom: 5 }}>Project name *</label>
                        <input className="input" value={form.name} onChange={e => setField('name', e.target.value)} />
                    </div>
                    <div>
                        <label style={{ fontSize: 12, color: 'var(--text-secondary)', display: 'block', marginBottom: 5 }}>Base URL *</label>
                        <input className="input" placeholder="https://api.example.com" value={form.base_url} onChange={e => setField('base_url', e.target.value)} />
                    </div>
                    <div>
                        <label style={{ fontSize: 12, color: 'var(--text-secondary)', display: 'block', marginBottom: 5 }}>Swagger URL</label>
                        <input className="input" placeholder="https://api.example.com/swagger.json" value={form.swagger_url} onChange={e => setField('swagger_url', e.target.value)} />
                    </div>
                    <div className="grid-2">
                        <div>
                            <label style={{ fontSize: 12, color: 'var(--text-secondary)', display: 'block', marginBottom: 5 }}>Environment</label>
                            <select className="input" value={form.environment} onChange={e => setField('environment', e.target.value)}>
                                <option value="development">Development</option>
                                <option value="staging">Staging</option>
                                <option value="qa">QA</option>
                                <option value="production">Production</option>
                            </select>
                        </div>
                        <div>
                            <label style={{ fontSize: 12, color: 'var(--text-secondary)', display: 'block', marginBottom: 5 }}>Description</label>
                            <input className="input" value={form.description} onChange={e => setField('description', e.target.value)} />
                        </div>
                    </div>
                </div>
            </div>

            {/* ── Authentication ── */}
            <div className="card" style={{ padding: '20px 22px', marginBottom: 16 }}>
                <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 16, display: 'flex', alignItems: 'center', gap: 6 }}>
                    <Lock size={14} color="var(--accent)" /> Authentication
                </div>

                {/* Auth type selector */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 20 }}>
                    {AUTH_TYPES.map(({ value, label, desc }) => (
                        <label key={value} onClick={() => setField('auth_type', value)} style={{
                            display: 'flex', alignItems: 'center', gap: 12, padding: '12px 14px',
                            borderRadius: 8, cursor: 'pointer',
                            background: form.auth_type === value ? 'var(--accent-dim)' : 'var(--bg-input)',
                            border: form.auth_type === value ? '1px solid rgba(130,100,255,0.4)' : '1px solid var(--border)',
                            transition: 'all 0.12s'
                        }}>
                            <div style={{
                                width: 16, height: 16, borderRadius: '50%', flexShrink: 0,
                                border: `2px solid ${form.auth_type === value ? 'var(--accent)' : 'var(--border)'}`,
                                background: form.auth_type === value ? 'var(--accent)' : 'transparent',
                                display: 'flex', alignItems: 'center', justifyContent: 'center'
                            }}>
                                {form.auth_type === value && <div style={{ width: 6, height: 6, borderRadius: '50%', background: '#fff' }} />}
                            </div>
                            <div>
                                <div style={{ fontSize: 13, fontWeight: 500, color: form.auth_type === value ? 'var(--accent)' : 'var(--text-primary)' }}>{label}</div>
                                <div style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>{desc}</div>
                            </div>
                        </label>
                    ))}
                </div>

                {/* Auth config fields */}
                {form.auth_type === 'bearer' && (
                    <div>
                        <label style={{ fontSize: 12, color: 'var(--text-secondary)', display: 'block', marginBottom: 5 }}>Bearer token</label>
                        <input className="input" type="password" placeholder="eyJhbGciOiJIUzI1NiIs…"
                            value={authConfig.token || ''} onChange={e => setAC('token', e.target.value)} />
                    </div>
                )}

                {form.auth_type === 'basic' && (
                    <div className="grid-2">
                        <div>
                            <label style={{ fontSize: 12, color: 'var(--text-secondary)', display: 'block', marginBottom: 5 }}>Username</label>
                            <input className="input" value={authConfig.username || ''} onChange={e => setAC('username', e.target.value)} />
                        </div>
                        <div>
                            <label style={{ fontSize: 12, color: 'var(--text-secondary)', display: 'block', marginBottom: 5 }}>Password</label>
                            <input className="input" type="password" value={authConfig.password || ''} onChange={e => setAC('password', e.target.value)} />
                        </div>
                    </div>
                )}

                {form.auth_type === 'apikey' && (
                    <div className="grid-2">
                        <div>
                            <label style={{ fontSize: 12, color: 'var(--text-secondary)', display: 'block', marginBottom: 5 }}>Header name</label>
                            <input className="input" placeholder="X-API-Key" value={authConfig.header || ''} onChange={e => setAC('header', e.target.value)} />
                        </div>
                        <div>
                            <label style={{ fontSize: 12, color: 'var(--text-secondary)', display: 'block', marginBottom: 5 }}>API key</label>
                            <input className="input" type="password" value={authConfig.key || ''} onChange={e => setAC('key', e.target.value)} />
                        </div>
                    </div>
                )}

                {form.auth_type === 'login_flow' && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                        <div style={{ padding: '10px 14px', background: 'rgba(130,100,255,0.06)', border: '1px solid rgba(130,100,255,0.2)', borderRadius: 8, fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.6 }}>
                            🔐 APIForge will POST to your login URL before running tests, extract the token from the response, and inject it as <code style={{ fontFamily: 'JetBrains Mono, monospace', color: 'var(--accent)' }}>Authorization: Bearer &lt;token&gt;</code> into every test request automatically.
                        </div>
                        <div>
                            <label style={{ fontSize: 12, color: 'var(--text-secondary)', display: 'block', marginBottom: 5 }}>Login URL *</label>
                            <input className="input" placeholder="https://api.example.com/auth/login"
                                value={authConfig.login_url || ''} onChange={e => setAC('login_url', e.target.value)} />
                        </div>
                        <div>
                            <label style={{ fontSize: 12, color: 'var(--text-secondary)', display: 'block', marginBottom: 5 }}>
                                Login body (JSON) *
                                <span style={{ color: 'var(--text-tertiary)', marginLeft: 6 }}>credentials to POST</span>
                            </label>
                            <textarea className="input" style={{ height: 72, resize: 'none', fontFamily: 'JetBrains Mono, monospace', fontSize: 12 }}
                                placeholder={'{"email": "test@example.com", "password": "secret"}'}
                                value={
                                    typeof authConfig.login_body === 'object'
                                        ? JSON.stringify(authConfig.login_body, null, 2)
                                        : authConfig.login_body || ''
                                }
                                onChange={e => {
                                    try { setAC('login_body', JSON.parse(e.target.value)); }
                                    catch { setAC('login_body', e.target.value); }
                                }}
                            />
                        </div>
                        <div>
                            <label style={{ fontSize: 12, color: 'var(--text-secondary)', display: 'block', marginBottom: 5 }}>
                                Token path *
                                <span style={{ color: 'var(--text-tertiary)', marginLeft: 6 }}>dot-path into the response JSON</span>
                            </label>
                            <input className="input" placeholder="token  or  data.access_token  or  result.auth.token"
                                value={authConfig.token_path || ''} onChange={e => setAC('token_path', e.target.value)} />
                            <div style={{ marginTop: 6, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                                {['token', 'access_token', 'data.token', 'data.access_token'].map(p => (
                                    <button key={p} onClick={() => setAC('token_path', p)} style={{
                                        fontSize: 10, padding: '3px 8px', borderRadius: 4, cursor: 'pointer',
                                        fontFamily: 'JetBrains Mono, monospace',
                                        background: authConfig.token_path === p ? 'var(--accent-dim)' : 'rgba(255,255,255,0.05)',
                                        color: authConfig.token_path === p ? 'var(--accent)' : 'var(--text-tertiary)',
                                        border: authConfig.token_path === p ? '1px solid rgba(130,100,255,0.3)' : '1px solid var(--border)'
                                    }}>{p}</button>
                                ))}
                            </div>
                        </div>

                        {/* Test login button */}
                        <div>
                            <button
                                onClick={handleTestLogin}
                                disabled={testingLogin || !authConfig.login_url}
                                className="btn btn-ghost"
                                style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12 }}
                            >
                                {testingLogin
                                    ? <><div className="spinner" style={{ width: 12, height: 12 }} /> Testing login…</>
                                    : <><Lock size={12} /> Test login now</>}
                            </button>
                            {loginTestResult && (
                                <div style={{
                                    marginTop: 10, padding: '10px 14px', borderRadius: 8, fontSize: 12,
                                    display: 'flex', alignItems: 'flex-start', gap: 8,
                                    background: loginTestResult.success ? 'var(--green-bg)' : 'var(--red-bg)',
                                    border: `1px solid ${loginTestResult.success ? 'var(--green-border)' : 'var(--red-border)'}`,
                                    color: loginTestResult.success ? 'var(--green)' : 'var(--red)'
                                }}>
                                    {loginTestResult.success
                                        ? <CheckCircle2 size={14} style={{ flexShrink: 0, marginTop: 1 }} />
                                        : <AlertTriangle size={14} style={{ flexShrink: 0, marginTop: 1 }} />}
                                    <span>{loginTestResult.message}</span>
                                </div>
                            )}
                        </div>
                    </div>
                )}
            </div>

            {/* ── Actions ── */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <button
                    onClick={handleDelete}
                    disabled={deleting}
                    className="btn btn-danger"
                    style={{ display: 'flex', alignItems: 'center', gap: 6 }}
                >
                    <Trash2 size={13} />
                    {confirmDelete ? 'Click again to confirm delete' : 'Delete project'}
                </button>

                <div style={{ display: 'flex', gap: 8 }}>
                    <button className="btn btn-ghost" onClick={() => navigate(-1)}>Cancel</button>
                    <button
                        onClick={handleSave}
                        disabled={saving || !form.name || !form.base_url}
                        className="btn btn-primary"
                        style={{ display: 'flex', alignItems: 'center', gap: 6 }}
                    >
                        {saving
                            ? <><div className="spinner" style={{ width: 14, height: 14 }} /> Saving…</>
                            : <><Save size={13} /> Save changes</>}
                    </button>
                </div>
            </div>
        </div>
    );
}