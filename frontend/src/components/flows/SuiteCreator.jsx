import { useState, useEffect } from 'react';
import { api } from '../../store/index.js';
import {
    X, ChevronRight, ChevronLeft, Check, Plus, Trash2,
    Wand2, PenLine, Search, ArrowRight, GitBranch,
    Lock, Globe, Cpu, ChevronDown
} from 'lucide-react';

// ── Helpers ───────────────────────────────────────────────────────────────────
function safeJSON(str) {
    if (!str) return null;
    if (typeof str === 'object') return str;
    try { return JSON.parse(str); } catch { return null; }
}

function Label({ children, hint }) {
    return (
        <div style={{ marginBottom: 6 }}>
            <span style={{ fontSize: 12, fontWeight: 500, color: 'var(--text-secondary)' }}>{children}</span>
            {hint && <span style={{ fontSize: 11, color: 'var(--text-tertiary)', marginLeft: 6 }}>{hint}</span>}
        </div>
    );
}

function Input({ value, onChange, placeholder, type = 'text', style = {} }) {
    return (
        <input className="input" type={type} value={value} onChange={e => onChange(e.target.value)}
            placeholder={placeholder} style={{ width: '100%', boxSizing: 'border-box', ...style }} />
    );
}

function Textarea({ value, onChange, placeholder, rows = 4 }) {
    return (
        <textarea className="input" value={value} onChange={e => onChange(e.target.value)}
            placeholder={placeholder} rows={rows}
            style={{ width: '100%', boxSizing: 'border-box', fontFamily: 'JetBrains Mono, monospace', fontSize: 11, resize: 'vertical' }} />
    );
}

function EndpointPicker({ endpoints, value, onChange, placeholder = 'Select endpoint…' }) {
    const [search, setSearch] = useState('');
    const [open, setOpen] = useState(false);
    const selected = endpoints.find(e => e.id === value);
    const filtered = endpoints.filter(e =>
        `${e.method} ${e.path}`.toLowerCase().includes(search.toLowerCase())
    );

    return (
        <div style={{ position: 'relative' }}>
            <button onClick={() => setOpen(o => !o)} style={{
                width: '100%', padding: '8px 12px', borderRadius: 8, cursor: 'pointer', textAlign: 'left',
                background: 'var(--bg-input)', border: '1px solid var(--border)', color: selected ? 'var(--text-primary)' : 'var(--text-tertiary)',
                display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: 13
            }}>
                <span>
                    {selected
                        ? <><span className={`method-badge method-${selected.method}`} style={{ fontSize: 9, marginRight: 6 }}>{selected.method}</span>{selected.path}</>
                        : placeholder}
                </span>
                <ChevronDown size={14} color="var(--text-tertiary)" />
            </button>

            {open && (
                <div style={{
                    position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 100,
                    background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 8,
                    boxShadow: '0 8px 24px rgba(0,0,0,0.4)', marginTop: 4, maxHeight: 260, overflow: 'hidden',
                    display: 'flex', flexDirection: 'column'
                }}>
                    <div style={{ padding: '8px 10px', borderBottom: '1px solid var(--border)' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'rgba(0,0,0,0.2)', borderRadius: 6, padding: '5px 8px' }}>
                            <Search size={12} color="var(--text-tertiary)" />
                            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search endpoints…"
                                style={{ background: 'none', border: 'none', outline: 'none', fontSize: 12, color: 'var(--text-primary)', flex: 1 }} />
                        </div>
                    </div>
                    <div style={{ overflow: 'auto', flex: 1 }}>
                        <div onClick={() => { onChange(null); setOpen(false); setSearch(''); }}
                            style={{
                                padding: '8px 12px', cursor: 'pointer', fontSize: 12, color: 'var(--text-tertiary)',
                                borderBottom: '1px solid rgba(255,255,255,0.04)'
                            }}>
                            — None / Skip this step
                        </div>
                        {filtered.map(ep => (
                            <div key={ep.id} onClick={() => { onChange(ep.id); setOpen(false); setSearch(''); }}
                                style={{
                                    padding: '8px 12px', cursor: 'pointer', fontSize: 12,
                                    display: 'flex', alignItems: 'center', gap: 8,
                                    background: value === ep.id ? 'var(--accent-dim)' : 'transparent',
                                    borderBottom: '1px solid rgba(255,255,255,0.03)'
                                }}>
                                <span className={`method-badge method-${ep.method}`} style={{ fontSize: 9, flexShrink: 0 }}>{ep.method}</span>
                                <span style={{ color: value === ep.id ? 'var(--accent)' : 'var(--text-secondary)' }}>{ep.path}</span>
                                {ep.summary && <span style={{ fontSize: 10, color: 'var(--text-tertiary)', marginLeft: 'auto' }}>{ep.summary.slice(0, 30)}</span>}
                            </div>
                        ))}
                    </div>
                </div>
            )}
        </div>
    );
}

// ══════════════════════════════════════════════════════════════════════════════
// SMART WIZARD
// ══════════════════════════════════════════════════════════════════════════════
function SmartWizard({ projectId, endpoints, onCreated, onClose }) {
    const [step, setStep] = useState(1);
    const TOTAL = 5;

    // Wizard state
    const [signupId, setSignupId] = useState(null);
    const [loginId, setLoginId] = useState(null);
    const [tokenPath, setTokenPath] = useState('token');
    const [customToken, setCustomToken] = useState('');
    const [selected, setSelected] = useState(new Set());
    const [suiteName, setSuiteName] = useState('');
    const [creating, setCreating] = useState(false);
    const [error, setError] = useState('');

    // Auto-detect on mount
    useEffect(() => {
        const signup = endpoints.find(e => e.method === 'POST' &&
            (e.path.toLowerCase().includes('signup') || e.path.toLowerCase().includes('register')));
        const login = endpoints.find(e => e.method === 'POST' &&
            (e.path.toLowerCase().includes('login') || e.path.toLowerCase().includes('signin') || e.path.toLowerCase().includes('token')));
        if (signup) setSignupId(signup.id);
        if (login) setLoginId(login.id);

        // Pre-select secured endpoints
        const secured = endpoints.filter(e => {
            if (!e.security) return false;
            try { const s = JSON.parse(e.security); return Array.isArray(s) && s.length > 0; }
            catch { return false; }
        }).filter(e => e.id !== signup?.id && e.id !== login?.id);
        setSelected(new Set(secured.map(e => e.id)));

        // Default suite name
        setSuiteName('Full Auth Flow');
    }, []);

    const signupEp = endpoints.find(e => e.id === signupId);
    const loginEp = endpoints.find(e => e.id === loginId);
    const otherEps = endpoints.filter(e => e.id !== signupId && e.id !== loginId);

    function toggleEndpoint(id) {
        setSelected(prev => {
            const next = new Set(prev);
            next.has(id) ? next.delete(id) : next.add(id);
            return next;
        });
    }

    async function handleCreate() {
        if (!loginId && !signupId) { setError('Select at least a login or signup endpoint'); return; }
        setCreating(true);
        setError('');
        try {
            const finalTokenPath = tokenPath === 'custom' ? customToken : tokenPath;
            const steps = [];
            let order = 1;

            if (signupId) {
                const ep = endpoints.find(e => e.id === signupId);
                const schema = safeJSON(ep?.request_body);
                const example = schema?._example;
                const fields = schema?.properties ? Object.keys(schema.properties) : [];
                const payload = example || buildPayload(fields, ep?.path);
                steps.push({
                    step_order: order++, name: 'Sign up',
                    endpoint_id: signupId, method: 'POST',
                    input_payload: payload, expected_status: 201,
                    extract_vars: [{ var: 'userId', path: 'data.id' }, { var: 'userId', path: 'id' }],
                    skip_if_failed: 0
                });
            }

            if (loginId) {
                const ep = endpoints.find(e => e.id === loginId);
                const schema = safeJSON(ep?.request_body);
                const example = schema?._example;
                const fields = schema?.properties ? Object.keys(schema.properties) : [];
                const payload = example || buildPayload(fields, ep?.path);
                steps.push({
                    step_order: order++, name: 'Login',
                    endpoint_id: loginId, method: 'POST',
                    input_payload: payload, expected_status: 200,
                    extract_vars: [
                        { var: 'token', path: finalTokenPath },
                        { var: 'token', path: 'data.token' },
                        { var: 'token', path: 'access_token' },
                    ],
                    skip_if_failed: 0
                });
            }

            for (const id of selected) {
                const ep = endpoints.find(e => e.id === id);
                if (!ep) continue;
                const schema = safeJSON(ep.request_body);
                const hasBody = ['POST', 'PUT', 'PATCH'].includes(ep.method);
                const payload = hasBody ? (schema?._example || schema?.properties
                    ? buildPayload(Object.keys(schema?.properties || {}), ep.path)
                    : {}) : null;
                const pathParams = (ep.path.match(/\{(\w+)\}/g) || []).map(p => p.slice(1, -1));
                steps.push({
                    step_order: order++,
                    name: `${ep.method} ${ep.path}`,
                    endpoint_id: ep.id, method: ep.method,
                    input_payload: payload,
                    input_params: pathParams.length ? Object.fromEntries(pathParams.map(p => [p, `{{${p === 'id' ? 'userId' : p}}}`])) : null,
                    expected_status: ep.method === 'DELETE' ? 204 : ep.method === 'POST' ? 201 : 200,
                    extract_vars: [], skip_if_failed: 1
                });
            }

            const result = await api.flows.create(projectId, { name: suiteName, description: `Wizard: ${steps.length} steps`, steps });
            onCreated(result);
        } catch (err) { setError(err.message); }
        finally { setCreating(false); }
    }

    function buildPayload(fields, path) {
        const p = (path || '').toLowerCase();
        if (!fields.length) {
            if (p.includes('login') || p.includes('signin')) return { email: 'test@example.com', password: 'Test@123456' };
            if (p.includes('signup') || p.includes('register')) return { email: 'test@example.com', password: 'Test@123456', name: 'Test User' };
            return {};
        }
        const obj = {};
        fields.forEach(f => {
            const n = f.toLowerCase();
            if (n.includes('email')) obj[f] = 'test@example.com';
            else if (n.includes('password') || n === 'pass') obj[f] = 'Test@123456';
            else if (n.includes('name') && n.includes('user')) obj[f] = 'Test User';
            else if (n.includes('firstname') || n === 'first_name') obj[f] = 'Test';
            else if (n.includes('lastname') || n === 'last_name') obj[f] = 'User';
            else if (n.includes('username')) obj[f] = 'testuser';
            else if (n.includes('name')) obj[f] = 'Test Name';
            else if (n.includes('phone')) obj[f] = '+919876543210';
            else if (n.includes('title')) obj[f] = 'Test Title';
            else if (n.includes('desc')) obj[f] = 'Test description';
            else obj[f] = 'test_value';
        });
        return obj;
    }

    const TOKEN_OPTIONS = ['token', 'access_token', 'data.token', 'data.access_token', 'result.token', 'auth.token', 'jwt', 'custom'];

    return (
        <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
            {/* Progress */}
            <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border)' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 10 }}>
                    {Array.from({ length: TOTAL }, (_, i) => (
                        <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                            <div style={{
                                width: 24, height: 24, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center',
                                fontSize: 11, fontWeight: 700, flexShrink: 0,
                                background: i + 1 < step ? 'var(--green)' : i + 1 === step ? 'var(--accent)' : 'rgba(255,255,255,0.08)',
                                color: i + 1 <= step ? '#fff' : 'var(--text-tertiary)',
                            }}>
                                {i + 1 < step ? <Check size={12} /> : i + 1}
                            </div>
                            {i < TOTAL - 1 && <div style={{ width: 20, height: 1, background: i + 1 < step ? 'var(--green)' : 'var(--border)' }} />}
                        </div>
                    ))}
                </div>
                <div style={{ fontSize: 13, fontWeight: 600 }}>
                    {['Pick signup endpoint', 'Pick login endpoint', 'Token extraction', 'Select endpoints', 'Review & create'][step - 1]}
                </div>
            </div>

            {/* Step content */}
            <div style={{ flex: 1, overflow: 'auto', padding: '20px' }}>

                {step === 1 && (
                    <div>
                        <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 16, lineHeight: 1.6 }}>
                            Select the endpoint that creates a new user. This runs first, then login uses the same credentials.
                            <br />If your API doesn't have signup, click <strong>Skip</strong>.
                        </div>
                        <Label>Signup endpoint</Label>
                        <EndpointPicker endpoints={endpoints.filter(e => e.method === 'POST')}
                            value={signupId} onChange={setSignupId} placeholder="Skip — no signup needed" />
                        {signupEp && (
                            <div style={{ marginTop: 10, padding: '10px 12px', background: 'var(--green-bg)', borderRadius: 8, fontSize: 12, color: 'var(--green)', border: '1px solid var(--green-border)' }}>
                                ✓ Will POST to <code style={{ fontFamily: 'JetBrains Mono, monospace' }}>{signupEp.path}</code>
                            </div>
                        )}
                    </div>
                )}

                {step === 2 && (
                    <div>
                        <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 16, lineHeight: 1.6 }}>
                            Select the login endpoint. HitAPI will automatically try multiple credential combinations
                            (<code style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 11 }}>email+password</code>,{' '}
                            <code style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 11 }}>username+password</code>, etc.) until one works.
                        </div>
                        <Label>Login endpoint</Label>
                        <EndpointPicker endpoints={endpoints.filter(e => e.method === 'POST')}
                            value={loginId} onChange={setLoginId} placeholder="Skip — use static Bearer token" />
                        {loginEp && (
                            <div style={{ marginTop: 10, padding: '10px 12px', background: 'var(--green-bg)', borderRadius: 8, fontSize: 12, color: 'var(--green)', border: '1px solid var(--green-border)' }}>
                                ✓ Will POST to <code style={{ fontFamily: 'JetBrains Mono, monospace' }}>{loginEp.path}</code>
                            </div>
                        )}
                    </div>
                )}

                {step === 3 && (
                    <div>
                        <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 16, lineHeight: 1.6 }}>
                            Where is the token in the login response? HitAPI will try common paths automatically, but you can specify a custom one.
                        </div>
                        <Label>Token path in response</Label>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                            {TOKEN_OPTIONS.map(opt => (
                                <label key={opt} onClick={() => setTokenPath(opt)} style={{
                                    display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px',
                                    borderRadius: 8, cursor: 'pointer',
                                    background: tokenPath === opt ? 'var(--accent-dim)' : 'var(--bg-input)',
                                    border: `1px solid ${tokenPath === opt ? 'rgba(130,100,255,0.4)' : 'var(--border)'}`,
                                }}>
                                    <div style={{
                                        width: 14, height: 14, borderRadius: '50%', flexShrink: 0,
                                        border: `2px solid ${tokenPath === opt ? 'var(--accent)' : 'var(--border)'}`,
                                        background: tokenPath === opt ? 'var(--accent)' : 'transparent'
                                    }} />
                                    <code style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 12, color: tokenPath === opt ? 'var(--accent)' : 'var(--text-secondary)' }}>
                                        {opt === 'custom' ? 'Custom path…' : opt}
                                    </code>
                                    {opt === 'token' && <span style={{ fontSize: 10, color: 'var(--text-tertiary)', marginLeft: 'auto' }}>most common</span>}
                                    {opt === 'access_token' && <span style={{ fontSize: 10, color: 'var(--text-tertiary)', marginLeft: 'auto' }}>OAuth2</span>}
                                </label>
                            ))}
                        </div>
                        {tokenPath === 'custom' && (
                            <div style={{ marginTop: 10 }}>
                                <Label hint="e.g. result.auth.jwt">Custom path</Label>
                                <Input value={customToken} onChange={setCustomToken} placeholder="data.access_token" />
                            </div>
                        )}
                        <div style={{ marginTop: 14, padding: '10px 12px', background: 'var(--accent-dim)', borderRadius: 8, fontSize: 11, color: 'var(--text-secondary)', lineHeight: 1.6 }}>
                            💡 HitAPI will also try 15 common token paths automatically as fallback.
                        </div>
                    </div>
                )}

                {step === 4 && (
                    <div>
                        <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 12, lineHeight: 1.6 }}>
                            Select which endpoints to include in the suite. These will run after login with the token automatically injected.
                        </div>
                        <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
                            <button onClick={() => setSelected(new Set(otherEps.map(e => e.id)))}
                                style={{ fontSize: 11, padding: '4px 10px', borderRadius: 5, cursor: 'pointer', background: 'var(--accent-dim)', color: 'var(--accent)', border: '1px solid rgba(130,100,255,0.3)' }}>
                                Select all ({otherEps.length})
                            </button>
                            <button onClick={() => {
                                const secured = otherEps.filter(e => { try { const s = JSON.parse(e.security || '[]'); return s.length > 0; } catch { return false; } });
                                setSelected(new Set(secured.map(e => e.id)));
                            }} style={{ fontSize: 11, padding: '4px 10px', borderRadius: 5, cursor: 'pointer', background: 'var(--bg-card)', color: 'var(--text-secondary)', border: '1px solid var(--border)' }}>
                                <Lock size={10} style={{ marginRight: 4 }} />Secured only
                            </button>
                            <button onClick={() => setSelected(new Set())}
                                style={{ fontSize: 11, padding: '4px 10px', borderRadius: 5, cursor: 'pointer', background: 'var(--bg-card)', color: 'var(--text-secondary)', border: '1px solid var(--border)' }}>
                                Clear
                            </button>
                        </div>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 4, maxHeight: 320, overflow: 'auto' }}>
                            {otherEps.map(ep => {
                                const checked = selected.has(ep.id);
                                const isSecured = (() => { try { const s = JSON.parse(ep.security || '[]'); return s.length > 0; } catch { return false; } })();
                                return (
                                    <div key={ep.id} onClick={() => toggleEndpoint(ep.id)} style={{
                                        display: 'flex', alignItems: 'center', gap: 8, padding: '8px 10px',
                                        borderRadius: 6, cursor: 'pointer',
                                        background: checked ? 'rgba(130,100,255,0.06)' : 'rgba(255,255,255,0.02)',
                                        border: `1px solid ${checked ? 'rgba(130,100,255,0.2)' : 'var(--border)'}`,
                                    }}>
                                        <div style={{
                                            width: 14, height: 14, borderRadius: 3, flexShrink: 0,
                                            border: `2px solid ${checked ? 'var(--accent)' : 'var(--border)'}`,
                                            background: checked ? 'var(--accent)' : 'transparent',
                                            display: 'flex', alignItems: 'center', justifyContent: 'center'
                                        }}>
                                            {checked && <Check size={9} color="#fff" />}
                                        </div>
                                        <span className={`method-badge method-${ep.method}`} style={{ fontSize: 9, flexShrink: 0 }}>{ep.method}</span>
                                        <span style={{ fontSize: 12, flex: 1, color: 'var(--text-secondary)' }}>{ep.path}</span>
                                        {isSecured && <Lock size={10} color="var(--accent)" style={{ flexShrink: 0 }} />}
                                        {ep.summary && <span style={{ fontSize: 10, color: 'var(--text-tertiary)', flexShrink: 0 }}>{ep.summary.slice(0, 25)}</span>}
                                    </div>
                                );
                            })}
                        </div>
                        <div style={{ marginTop: 10, fontSize: 11, color: 'var(--text-tertiary)' }}>
                            {selected.size} endpoint{selected.size !== 1 ? 's' : ''} selected
                        </div>
                    </div>
                )}

                {step === 5 && (
                    <div>
                        <div style={{ marginBottom: 16 }}>
                            <Label>Suite name</Label>
                            <Input value={suiteName} onChange={setSuiteName} placeholder="My Auth Flow" />
                        </div>
                        <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 10, color: 'var(--text-secondary)' }}>Summary</div>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                            {[
                                signupEp && { icon: '1', label: 'Sign up', path: signupEp.path, color: 'var(--green)' },
                                loginEp && { icon: '2', label: 'Login', path: loginEp.path, color: 'var(--accent)' },
                                selected.size > 0 && { icon: '3+', label: `${selected.size} endpoint${selected.size > 1 ? 's' : ''} to test`, path: 'with Bearer {{token}}', color: 'var(--amber)' }
                            ].filter(Boolean).map((item, i) => (
                                <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px', background: 'rgba(255,255,255,0.02)', borderRadius: 8, border: '1px solid var(--border)' }}>
                                    <div style={{ width: 26, height: 26, borderRadius: '50%', background: `${item.color}22`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, fontWeight: 700, color: item.color, flexShrink: 0 }}>{item.icon}</div>
                                    <div>
                                        <div style={{ fontSize: 12, fontWeight: 500 }}>{item.label}</div>
                                        <div style={{ fontSize: 11, color: 'var(--text-tertiary)', fontFamily: 'JetBrains Mono, monospace' }}>{item.path}</div>
                                    </div>
                                </div>
                            ))}
                        </div>
                        {!signupEp && !loginEp && (
                            <div style={{ marginTop: 10, padding: '10px 12px', background: 'var(--red-bg)', borderRadius: 8, fontSize: 12, color: 'var(--red)' }}>
                                ⚠ Select at least a login or signup endpoint to continue
                            </div>
                        )}
                        {error && <div style={{ marginTop: 10, padding: '10px 12px', background: 'var(--red-bg)', borderRadius: 8, fontSize: 12, color: 'var(--red)' }}>{error}</div>}
                    </div>
                )}
            </div>

            {/* Footer navigation */}
            <div style={{ padding: '14px 20px', borderTop: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between' }}>
                <button onClick={() => step > 1 ? setStep(s => s - 1) : onClose()}
                    style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '7px 14px', borderRadius: 7, cursor: 'pointer', background: 'rgba(255,255,255,0.05)', color: 'var(--text-secondary)', border: '1px solid var(--border)', fontSize: 13 }}>
                    <ChevronLeft size={14} /> {step > 1 ? 'Back' : 'Cancel'}
                </button>
                {step < TOTAL ? (
                    <button onClick={() => setStep(s => s + 1)}
                        style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '7px 16px', borderRadius: 7, cursor: 'pointer', background: 'var(--accent)', color: '#fff', border: 'none', fontSize: 13, fontWeight: 500 }}>
                        Next <ChevronRight size={14} />
                    </button>
                ) : (
                    <button onClick={handleCreate} disabled={creating || (!signupId && !loginId)}
                        style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '7px 16px', borderRadius: 7, cursor: creating ? 'not-allowed' : 'pointer', background: 'var(--accent)', color: '#fff', border: 'none', fontSize: 13, fontWeight: 500, opacity: creating ? 0.7 : 1 }}>
                        {creating ? <><div className="spinner" style={{ width: 13, height: 13 }} /> Creating…</> : <><Check size={14} /> Create suite</>}
                    </button>
                )}
            </div>
        </div>
    );
}

// ══════════════════════════════════════════════════════════════════════════════
// MANUAL BUILDER
// ══════════════════════════════════════════════════════════════════════════════
function ManualBuilder({ projectId, endpoints, onCreated, onClose }) {
    const [suiteName, setSuiteName] = useState('');
    const [steps, setSteps] = useState([]);
    const [creating, setCreating] = useState(false);
    const [error, setError] = useState('');

    function addStep() {
        setSteps(prev => [...prev, {
            id: Date.now(),
            name: '',
            endpoint_id: null,
            method: 'GET',
            input_payload: '',
            input_params: '',
            expected_status: 200,
            extract_vars: '',   // e.g. "token=data.token"
            skip_if_failed: true
        }]);
    }

    function updateStep(id, key, val) {
        setSteps(prev => prev.map(s => s.id === id ? { ...s, [key]: val } : s));
    }

    function removeStep(id) {
        setSteps(prev => prev.filter(s => s.id !== id));
    }

    function moveStep(id, dir) {
        setSteps(prev => {
            const idx = prev.findIndex(s => s.id === id);
            const next = [...prev];
            const swap = idx + dir;
            if (swap < 0 || swap >= next.length) return prev;
            [next[idx], next[swap]] = [next[swap], next[idx]];
            return next;
        });
    }

    // When endpoint is picked — auto-fill method and body
    function onPickEndpoint(stepId, endpointId) {
        const ep = endpoints.find(e => e.id === endpointId);
        if (!ep) { updateStep(stepId, 'endpoint_id', null); return; }

        const schema = safeJSON(ep.request_body);
        const example = schema?._example;
        const fields = schema?.properties ? Object.keys(schema.properties) : [];
        const hasBody = ['POST', 'PUT', 'PATCH'].includes(ep.method);

        let payload = '';
        if (hasBody) {
            if (example) payload = JSON.stringify(example, null, 2);
            else if (fields.length) {
                const obj = {};
                fields.forEach(f => { obj[f] = f.toLowerCase().includes('email') ? 'test@example.com' : f.toLowerCase().includes('password') ? 'Test@123456' : 'test_value'; });
                payload = JSON.stringify(obj, null, 2);
            } else {
                payload = '{}';
            }
        }

        const pathParams = (ep.path.match(/\{(\w+)\}/g) || []).map(p => p.slice(1, -1));
        const params = pathParams.length ? JSON.stringify(Object.fromEntries(pathParams.map(p => [p, `{{${p}}}`])), null, 2) : '';

        setSteps(prev => prev.map(s => s.id === stepId ? {
            ...s,
            endpoint_id: endpointId,
            method: ep.method,
            name: s.name || `${ep.method} ${ep.path}`,
            input_payload: payload,
            input_params: params,
            expected_status: ep.method === 'POST' ? 201 : ep.method === 'DELETE' ? 204 : 200,
        } : s));
    }

    async function handleCreate() {
        if (!suiteName.trim()) { setError('Suite name is required'); return; }
        if (steps.length === 0) { setError('Add at least one step'); return; }
        setCreating(true);
        setError('');
        try {
            const builtSteps = steps.map((s, i) => {
                // Parse extract_vars: "token=data.token, userId=data.id"
                const extractVars = s.extract_vars
                    ? s.extract_vars.split(',').map(part => {
                        const [varName, path] = part.trim().split('=').map(x => x.trim());
                        return varName && path ? { var: varName, path } : null;
                    }).filter(Boolean)
                    : [];

                return {
                    step_order: i + 1,
                    name: s.name || `Step ${i + 1}`,
                    endpoint_id: s.endpoint_id || null,
                    method: s.method,
                    input_payload: s.input_payload ? safeJSON(s.input_payload) : null,
                    input_params: s.input_params ? safeJSON(s.input_params) : null,
                    expected_status: Number(s.expected_status) || 200,
                    extract_vars: extractVars,
                    skip_if_failed: s.skip_if_failed ? 1 : 0
                };
            });

            const result = await api.flows.create(projectId, {
                name: suiteName.trim(),
                description: `Manual suite — ${steps.length} steps`,
                steps: builtSteps
            });
            onCreated(result);
        } catch (err) { setError(err.message); }
        finally { setCreating(false); }
    }

    return (
        <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
            {/* Header */}
            <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border)' }}>
                <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 8 }}>Suite name</div>
                <Input value={suiteName} onChange={setSuiteName} placeholder="e.g. Admin API Flow" />
            </div>

            {/* Steps */}
            <div style={{ flex: 1, overflow: 'auto', padding: '16px 20px' }}>
                {steps.length === 0 ? (
                    <div style={{ textAlign: 'center', padding: '40px 20px', color: 'var(--text-tertiary)' }}>
                        <PenLine size={28} style={{ marginBottom: 12, opacity: 0.4 }} />
                        <div style={{ fontSize: 13, marginBottom: 8 }}>No steps yet</div>
                        <div style={{ fontSize: 12 }}>Click "Add step" to start building your suite</div>
                    </div>
                ) : (
                    steps.map((s, i) => (
                        <StepEditor key={s.id} step={s} index={i} total={steps.length}
                            endpoints={endpoints}
                            onUpdate={(key, val) => updateStep(s.id, key, val)}
                            onPickEndpoint={(epId) => onPickEndpoint(s.id, epId)}
                            onRemove={() => removeStep(s.id)}
                            onMoveUp={() => moveStep(s.id, -1)}
                            onMoveDown={() => moveStep(s.id, 1)} />
                    ))
                )}

                <button onClick={addStep} style={{
                    width: '100%', padding: '10px', borderRadius: 8, cursor: 'pointer', marginTop: 8,
                    background: 'rgba(130,100,255,0.06)', color: 'var(--accent)',
                    border: '1px dashed rgba(130,100,255,0.3)', fontSize: 13, fontWeight: 500,
                    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6
                }}>
                    <Plus size={14} /> Add step
                </button>
            </div>

            {/* Footer */}
            <div style={{ padding: '14px 20px', borderTop: '1px solid var(--border)' }}>
                {error && <div style={{ marginBottom: 10, padding: '8px 12px', background: 'var(--red-bg)', borderRadius: 6, fontSize: 12, color: 'var(--red)' }}>{error}</div>}
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <button onClick={onClose} style={{ padding: '7px 14px', borderRadius: 7, cursor: 'pointer', background: 'rgba(255,255,255,0.05)', color: 'var(--text-secondary)', border: '1px solid var(--border)', fontSize: 13 }}>
                        Cancel
                    </button>
                    <button onClick={handleCreate} disabled={creating}
                        style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '7px 16px', borderRadius: 7, cursor: creating ? 'not-allowed' : 'pointer', background: 'var(--accent)', color: '#fff', border: 'none', fontSize: 13, fontWeight: 500, opacity: creating ? 0.7 : 1 }}>
                        {creating ? <><div className="spinner" style={{ width: 13, height: 13 }} /> Creating…</> : <><Check size={14} /> Create suite ({steps.length} steps)</>}
                    </button>
                </div>
            </div>
        </div>
    );
}

// ── Single step editor ────────────────────────────────────────────────────────
function StepEditor({ step, index, total, endpoints, onUpdate, onPickEndpoint, onRemove, onMoveUp, onMoveDown }) {
    const [expanded, setExpanded] = useState(true);

    return (
        <div style={{ marginBottom: 10, border: '1px solid var(--border)', borderRadius: 10, overflow: 'hidden' }}>
            {/* Step header */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 14px', background: 'rgba(255,255,255,0.02)', cursor: 'pointer' }}
                onClick={() => setExpanded(e => !e)}>
                <div style={{ width: 22, height: 22, borderRadius: '50%', background: 'var(--accent-dim)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, fontWeight: 700, color: 'var(--accent)', flexShrink: 0 }}>
                    {index + 1}
                </div>
                <span style={{ flex: 1, fontSize: 13, fontWeight: 500 }}>{step.name || `Step ${index + 1}`}</span>
                {step.endpoint_id && (() => { const ep = endpoints.find(e => e.id === step.endpoint_id); return ep ? <span className={`method-badge method-${ep.method}`} style={{ fontSize: 9 }}>{ep.method}</span> : null; })()}
                <div style={{ display: 'flex', gap: 4 }} onClick={e => e.stopPropagation()}>
                    {index > 0 && <button onClick={onMoveUp} style={{ padding: '2px 5px', borderRadius: 4, cursor: 'pointer', background: 'rgba(255,255,255,0.05)', border: '1px solid var(--border)', fontSize: 10, color: 'var(--text-tertiary)' }}>↑</button>}
                    {index < total - 1 && <button onClick={onMoveDown} style={{ padding: '2px 5px', borderRadius: 4, cursor: 'pointer', background: 'rgba(255,255,255,0.05)', border: '1px solid var(--border)', fontSize: 10, color: 'var(--text-tertiary)' }}>↓</button>}
                    <button onClick={onRemove} style={{ padding: '2px 5px', borderRadius: 4, cursor: 'pointer', background: 'var(--red-bg)', border: '1px solid rgba(255,92,92,0.25)', color: 'var(--red)' }}><Trash2 size={11} /></button>
                </div>
                {expanded ? <ChevronDown size={13} color="var(--text-tertiary)" /> : <ChevronRight size={13} color="var(--text-tertiary)" />}
            </div>

            {expanded && (
                <div style={{ padding: '14px', display: 'flex', flexDirection: 'column', gap: 12, borderTop: '1px solid rgba(255,255,255,0.04)' }}>
                    {/* Name */}
                    <div>
                        <Label>Step name</Label>
                        <Input value={step.name} onChange={v => onUpdate('name', v)} placeholder={`Step ${index + 1}`} />
                    </div>

                    {/* Endpoint picker */}
                    <div>
                        <Label>Endpoint</Label>
                        <EndpointPicker endpoints={endpoints} value={step.endpoint_id} onChange={onPickEndpoint} />
                    </div>

                    {/* Method + Expected status */}
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                        <div>
                            <Label>Method</Label>
                            <select className="input" value={step.method} onChange={e => onUpdate('method', e.target.value)}
                                style={{ width: '100%' }}>
                                {['GET', 'POST', 'PUT', 'PATCH', 'DELETE'].map(m => <option key={m}>{m}</option>)}
                            </select>
                        </div>
                        <div>
                            <Label>Expected status</Label>
                            <Input value={step.expected_status} onChange={v => onUpdate('expected_status', v)} placeholder="200" />
                        </div>
                    </div>

                    {/* Request body */}
                    {['POST', 'PUT', 'PATCH'].includes(step.method) && (
                        <div>
                            <Label hint="JSON — supports {{token}}, {{userId}} placeholders">Request body</Label>
                            <Textarea value={step.input_payload} onChange={v => onUpdate('input_payload', v)}
                                placeholder={'{\n  "email": "test@example.com"\n}'} rows={5} />
                        </div>
                    )}

                    {/* Path params */}
                    <div>
                        <Label hint="JSON — e.g. {&quot;id&quot;: &quot;{{userId}}&quot;}">Path / query params</Label>
                        <Textarea value={step.input_params} onChange={v => onUpdate('input_params', v)}
                            placeholder={'{\n  "id": "{{userId}}"\n}'} rows={2} />
                    </div>

                    {/* Extract vars */}
                    <div>
                        <Label hint="varName=response.path, e.g. token=data.token, userId=data.id">Extract from response</Label>
                        <Input value={step.extract_vars} onChange={v => onUpdate('extract_vars', v)}
                            placeholder="token=data.token, userId=data.id" />
                    </div>

                    {/* Skip if failed */}
                    <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: 12, color: 'var(--text-secondary)' }}>
                        <div onClick={() => onUpdate('skip_if_failed', !step.skip_if_failed)} style={{
                            width: 32, height: 18, borderRadius: 9, position: 'relative', cursor: 'pointer', flexShrink: 0,
                            background: step.skip_if_failed ? 'var(--accent)' : 'rgba(255,255,255,0.1)',
                            transition: 'background 0.2s'
                        }}>
                            <div style={{ width: 14, height: 14, borderRadius: '50%', background: '#fff', position: 'absolute', top: 2, left: step.skip_if_failed ? 16 : 2, transition: 'left 0.2s' }} />
                        </div>
                        Skip next steps if this step fails
                    </label>
                </div>
            )}
        </div>
    );
}

// ══════════════════════════════════════════════════════════════════════════════
// MAIN EXPORT — Suite Creator Modal
// ══════════════════════════════════════════════════════════════════════════════
export function SuiteCreator({ projectId, onCreated, onClose }) {
    const [mode, setMode] = useState(null); // null | 'wizard' | 'manual'
    const [endpoints, setEndpoints] = useState([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        api.endpoints.list(projectId)
            .then(data => setEndpoints(Array.isArray(data) ? data : []))
            .catch(() => { })
            .finally(() => setLoading(false));
    }, [projectId]);

    return (
        <div style={{
            position: 'fixed', inset: 0, zIndex: 1000,
            background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            padding: 20
        }} onClick={e => e.target === e.currentTarget && onClose()}>
            <div style={{
                width: '100%', maxWidth: mode ? 600 : 480,
                maxHeight: '90vh', borderRadius: 14,
                background: 'var(--bg-card)', border: '1px solid var(--border)',
                boxShadow: '0 24px 64px rgba(0,0,0,0.5)',
                display: 'flex', flexDirection: 'column', overflow: 'hidden'
            }}>
                {/* Modal header */}
                <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <GitBranch size={16} color="var(--accent)" />
                        <span style={{ fontSize: 14, fontWeight: 600 }}>
                            {!mode ? 'Create flow suite' : mode === 'wizard' ? 'Smart Wizard' : 'Manual Builder'}
                        </span>
                        {mode && (
                            <button onClick={() => setMode(null)} style={{ fontSize: 11, padding: '2px 8px', borderRadius: 4, cursor: 'pointer', background: 'rgba(255,255,255,0.05)', color: 'var(--text-tertiary)', border: '1px solid var(--border)', marginLeft: 4 }}>
                                ← Change
                            </button>
                        )}
                    </div>
                    <button onClick={onClose} style={{ width: 28, height: 28, borderRadius: 6, cursor: 'pointer', background: 'rgba(255,255,255,0.06)', border: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-tertiary)' }}>
                        <X size={14} />
                    </button>
                </div>

                {loading ? (
                    <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        <div className="spinner" style={{ width: 24, height: 24 }} />
                    </div>
                ) : !mode ? (
                    /* Mode selector */
                    <div style={{ padding: '24px 20px', display: 'flex', flexDirection: 'column', gap: 12 }}>
                        <p style={{ fontSize: 12, color: 'var(--text-secondary)', margin: 0, lineHeight: 1.6 }}>
                            Choose how you want to create your test suite:
                        </p>

                        <button onClick={() => setMode('wizard')} style={{
                            padding: '18px 20px', borderRadius: 10, cursor: 'pointer', textAlign: 'left',
                            background: 'var(--accent-dim)', border: '1px solid rgba(130,100,255,0.3)',
                            transition: 'all 0.12s'
                        }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
                                <div style={{ width: 32, height: 32, borderRadius: 8, background: 'var(--accent)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                    <Wand2 size={16} color="#fff" />
                                </div>
                                <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--accent)' }}>Smart Wizard</div>
                                <span style={{ fontSize: 10, padding: '2px 7px', borderRadius: 10, background: 'var(--accent)', color: '#fff', marginLeft: 'auto' }}>Recommended</span>
                            </div>
                            <div style={{ fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.6, paddingLeft: 42 }}>
                                Step-by-step guided setup. Pick your endpoints, configure token extraction, select which APIs to test. Takes 1 minute.
                            </div>
                        </button>

                        <button onClick={() => setMode('manual')} style={{
                            padding: '18px 20px', borderRadius: 10, cursor: 'pointer', textAlign: 'left',
                            background: 'rgba(255,255,255,0.02)', border: '1px solid var(--border)',
                            transition: 'all 0.12s'
                        }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
                                <div style={{ width: 32, height: 32, borderRadius: 8, background: 'rgba(255,255,255,0.08)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                    <PenLine size={16} color="var(--text-secondary)" />
                                </div>
                                <div style={{ fontSize: 14, fontWeight: 600 }}>Manual Builder</div>
                            </div>
                            <div style={{ fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.6, paddingLeft: 42 }}>
                                Build from scratch. Add steps one by one, define exact request body, path params, what to extract from each response. Full control.
                            </div>
                        </button>
                    </div>
                ) : mode === 'wizard' ? (
                    <SmartWizard projectId={projectId} endpoints={endpoints} onCreated={onCreated} onClose={onClose} />
                ) : (
                    <ManualBuilder projectId={projectId} endpoints={endpoints} onCreated={onCreated} onClose={onClose} />
                )}
            </div>
        </div>
    );
}