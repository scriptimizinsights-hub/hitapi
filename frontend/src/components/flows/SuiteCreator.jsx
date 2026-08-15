import { useState, useEffect } from 'react';
import { api } from '../../store/index.js';
import {
    X, ChevronRight, ChevronLeft, Check, Plus, Trash2,
    Wand2, PenLine, Search, ArrowRight, GitBranch,
    Lock, Globe, Cpu, ChevronDown
} from 'lucide-react';
import { useAuthDetector } from './hooks/useAuthDetector.js';
import { useEndpointGroups } from './hooks/useEndpointGroups.js';
import { StepAuthConfig } from './wizard/StepAuthConfig.jsx';
import { StepCrudGroups } from './wizard/StepCrudGroups.jsx';

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
    const ref = useState(() => ({ current: null }))[0];
    const selected = endpoints.find(e => e.id === value);
    const filtered = endpoints.filter(e =>
        `${e.method} ${e.path} ${e.summary || ''}`.toLowerCase().includes(search.toLowerCase())
    );

    // Close on outside click
    useEffect(() => {
        if (!open) return;
        function handleClick(e) {
            if (ref.current && !ref.current.contains(e.target)) setOpen(false);
        }
        document.addEventListener('mousedown', handleClick);
        return () => document.removeEventListener('mousedown', handleClick);
    }, [open]);

    return (
        <div style={{ position: 'relative' }} ref={el => ref.current = el}>
            <button onClick={() => setOpen(o => !o)} style={{
                width: '100%', padding: '8px 12px', borderRadius: 8, cursor: 'pointer', textAlign: 'left',
                background: 'var(--bg-input)', border: '1px solid var(--border)',
                color: selected ? 'var(--text-primary)' : 'var(--text-tertiary)',
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
                    position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 200,
                    background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 8,
                    boxShadow: '0 8px 24px rgba(0,0,0,0.5)', marginTop: 4, maxHeight: 280, overflow: 'hidden',
                    display: 'flex', flexDirection: 'column'
                }}>
                    {/* Search — stopPropagation prevents dropdown closing */}
                    <div style={{ padding: '8px 10px', borderBottom: '1px solid var(--border)', flexShrink: 0 }}
                        onMouseDown={e => e.stopPropagation()}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'rgba(0,0,0,0.25)', borderRadius: 6, padding: '6px 10px' }}>
                            <Search size={12} color="var(--text-tertiary)" />
                            <input
                                autoFocus
                                value={search}
                                onChange={e => setSearch(e.target.value)}
                                placeholder="Search by method, path or name…"
                                onMouseDown={e => e.stopPropagation()}
                                onClick={e => e.stopPropagation()}
                                style={{ background: 'none', border: 'none', outline: 'none', fontSize: 12, color: 'var(--text-primary)', flex: 1 }}
                            />
                            {search && (
                                <button onClick={e => { e.stopPropagation(); setSearch(''); }}
                                    style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-tertiary)', padding: 0, lineHeight: 1 }}>
                                    ×
                                </button>
                            )}
                        </div>
                    </div>

                    <div style={{ overflow: 'auto', flex: 1 }}>
                        <div onClick={() => { onChange(null); setOpen(false); setSearch(''); }}
                            style={{ padding: '8px 12px', cursor: 'pointer', fontSize: 12, color: 'var(--text-tertiary)', borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                            — None / Skip this step
                        </div>
                        {endpoints.length === 0 ? (
                            <div style={{ padding: '20px 12px', fontSize: 12, color: 'var(--text-tertiary)', textAlign: 'center', lineHeight: 1.6 }}>
                                No endpoints imported yet.<br />
                                <span style={{ color: 'var(--accent)' }}>Import a Swagger spec first</span>
                            </div>
                        ) : filtered.length === 0 ? (
                            <div style={{ padding: '16px 12px', fontSize: 12, color: 'var(--text-tertiary)', textAlign: 'center', lineHeight: 1.6 }}>
                                No results for "<strong>{search}</strong>"<br />
                                <span style={{ fontSize: 11 }}>Try searching by method (GET, POST) or path keyword</span>
                            </div>
                        ) : filtered.map(ep => (
                            <div key={ep.id} onClick={() => { onChange(ep.id); setOpen(false); setSearch(''); }}
                                style={{
                                    padding: '8px 12px', cursor: 'pointer', fontSize: 12,
                                    display: 'flex', alignItems: 'center', gap: 8,
                                    background: value === ep.id ? 'var(--accent-dim)' : 'transparent',
                                    borderBottom: '1px solid rgba(255,255,255,0.03)'
                                }}
                                onMouseEnter={e => { if (value !== ep.id) e.currentTarget.style.background = 'rgba(255,255,255,0.03)'; }}
                                onMouseLeave={e => { if (value !== ep.id) e.currentTarget.style.background = ''; }}>
                                <span className={`method-badge method-${ep.method}`} style={{ fontSize: 9, flexShrink: 0 }}>{ep.method}</span>
                                <span style={{ color: value === ep.id ? 'var(--accent)' : 'var(--text-secondary)', flex: 1 }}>{ep.path}</span>
                                {ep.summary && <span style={{ fontSize: 10, color: 'var(--text-tertiary)', flexShrink: 0, maxWidth: 120, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{ep.summary}</span>}
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
    const ALL_STEPS = [
        { key: 'auth_method', label: 'Authentication method' },
        { key: 'signup', label: 'Pick signup endpoint', flowOnly: true },
        { key: 'login', label: 'Pick login endpoint', flowOnly: true },
        { key: 'token', label: 'Token extraction', flowOnly: true },
        { key: 'endpoints', label: 'Select endpoints' },
        { key: 'auth_config', label: 'Auth configuration' },
        { key: 'crud', label: 'CRUD groups' },
        { key: 'review', label: 'Review & create' },
    ];

    // Existing wizard state (unchanged)
    const [signupId, setSignupId] = useState(null);
    const [loginId, setLoginId] = useState(null);
    const [tokenPath, setTokenPath] = useState('token');
    const [customToken, setCustomToken] = useState('');
    const [selected, setSelected] = useState(new Set());
    const [suiteName, setSuiteName] = useState('');
    const [creating, setCreating] = useState(false);
    const [error, setError] = useState('');
    const [authType, setAuthType] = useState('flow'); // 'flow' | 'static' | 'none'
    const [staticToken, setStaticToken] = useState('');
    const activeSteps = ALL_STEPS.filter(s => !s.flowOnly || authType === 'flow');
    const TOTAL = activeSteps.length;
    const STEP_LABELS = activeSteps.map(s => s.label);
    const currentStepKey = activeSteps[step - 1]?.key;
    const [aiOverrides, setAiOverrides] = useState({});
    const [generatingAI, setGeneratingAI] = useState(false);
    const [aiProgress, setAiProgress] = useState({ done: 0, total: 0 });

    // NEW: auth detection hook
    const { annotated, toggleAuth, authCount, publicCount } = useAuthDetector(endpoints);

    // NEW: CRUD groups hook — uses annotated endpoints so auth overrides flow through
    const { groups, getGroupConfig, toggleGroup, setIdPath, buildCrudSteps,
        excludeEndpoint, moveEndpoint, resetEndpoint,
        endpointOverrides, excludedEndpoints } = useEndpointGroups(annotated);

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

    const [reviewSteps, setReviewSteps] = useState([]);

    // Build preview steps when entering step 7
    useEffect(() => {
        if (currentStepKey !== 'review') return;
        const preview = [];
        let order = 1;

        // Only include signup/login if authType === 'flow'
        if (authType === 'flow' && signupId) {
            const ep = endpoints.find(e => e.id === signupId);
            preview.push({ order: order++, name: 'Sign up', method: 'POST', path: ep?.path || '', color: 'var(--green)', fixed: true });
        }
        if (authType === 'flow' && loginId) {
            const ep = endpoints.find(e => e.id === loginId);
            preview.push({ order: order++, name: 'Login', method: 'POST', path: ep?.path || '', color: 'var(--accent)', fixed: true });
        }

        const crudEndpointIds = new Set(
            groups.filter(g => getGroupConfig(g.basePath).included).flatMap(g => g.endpoints.map(e => e.id))
        );

        for (const id of selected) {
            const ep = endpoints.find(e => e.id === id);
            if (!ep) continue;
            if (crudEndpointIds.has(id)) continue;
            if (id === signupId || id === loginId) continue;
            preview.push({ order: order++, name: `${ep.method} ${ep.path}`, method: ep.method, path: ep.path, color: 'var(--amber)', endpointId: id });
        }
        const crudSteps = buildCrudSteps(order);
        crudSteps.forEach(s => {
            preview.push({ order: order++, name: s.name, method: s.method, path: s.name.split(' ').slice(1).join(' '), color: 'var(--blue)', crudStep: s });
        });
        setReviewSteps(preview);
        generateAllPayloadsWithAI(preview)
    }, [currentStepKey]);


    async function generateAllPayloadsWithAI(previewSteps) {
        const targets = previewSteps
            .map((step, i) => ({ step, i }))
            .filter(({ step }) => {
                if (step.fixed) return false;
                const method = step.crudStep?.method || step.method;
                const endpointId = step.crudStep?.endpoint_id || step.endpointId;
                return endpointId && ['POST', 'PUT', 'PATCH'].includes(method);
            });

        if (!targets.length) return;

        setGeneratingAI(true);
        setAiProgress({ done: 0, total: targets.length });

        for (const { step, i } of targets) {
            const endpointId = step.crudStep?.endpoint_id || step.endpointId;
            try {
                const result = await api.flows.generateStep(projectId, endpointId);
                setAiOverrides(prev => ({ ...prev, [i]: result }));
            } catch (err) {
                console.warn(`AI generation failed for step ${i}:`, err.message);
            }
            setAiProgress(prev => ({ ...prev, done: prev.done + 1 }));
        }

        setGeneratingAI(false);
    }

    function moveReviewStep(idx, dir) {
        setReviewSteps(prev => {
            const next = [...prev];
            const swap = idx + dir;
            if (swap < 0 || swap >= next.length) return prev;
            // Don't move fixed steps (signup/login)
            if (next[idx].fixed || next[swap].fixed) return prev;
            [next[idx], next[swap]] = [next[swap], next[idx]];
            return next.map((s, i) => ({ ...s, order: i + 1 }));
        });
    }
    const signupEp = endpoints.find(e => e.id === signupId);
    const loginEp = endpoints.find(e => e.id === loginId);
    const otherEps = endpoints.filter(e => e.id !== signupId && e.id !== loginId);


    //     'Pick signup endpoint',
    //     'Pick login endpoint',
    //     'Token extraction',
    //     'Select endpoints',
    //     'Auth configuration',   // NEW step 5
    //     'CRUD groups',          // NEW step 6
    //     'Review & create',      // was step 5
    // ];

    function toggleEndpoint(id) {
        setSelected(prev => {
            const next = new Set(prev);
            next.has(id) ? next.delete(id) : next.add(id);
            return next;
        });
    }

    async function handleCreate() {
        // Only require login/signup when using the flow auth method
        if (authType === 'flow' && !loginId && !signupId) {
            setError('Select at least a login or signup endpoint');
            return;
        }
        if (authType === 'static' && !staticToken.trim()) {
            setError('Enter a static token, or go back and pick a different auth method');
            return;
        }

        // Count total steps before creating
        const crudStepCount = buildCrudSteps(1).length;
        const totalSteps = (authType === 'flow' ? (signupId ? 1 : 0) + (loginId ? 1 : 0) : 0) + selected.size + crudStepCount;
        const MAX_STEPS = 100;
        if (totalSteps > MAX_STEPS) {
            setError(`Too many steps (${totalSteps}). Maximum is ${MAX_STEPS}.`);
            return;
        }

        setCreating(true);
        setError('');
        try {
            const finalTokenPath = tokenPath === 'custom' ? customToken : tokenPath;
            const steps = [];
            let order = 1;

            // Only build signup/login steps when authType === 'flow'
            if (authType === 'flow' && signupId) {
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

            if (authType === 'flow' && loginId) {
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

            const crudEndpointIds = new Set(
                groups.filter(g => getGroupConfig(g.basePath).included).flatMap(g => g.endpoints.map(e => e.id))
            );

            for (const id of selected) {
                const ep = endpoints.find(e => e.id === id);
                if (!ep) continue;
                if (crudEndpointIds.has(id)) continue;
                if (id === signupId || id === loginId) continue;

                const schema = safeJSON(ep.request_body);
                const hasBody = ['POST', 'PUT', 'PATCH'].includes(ep.method);
                const payload = hasBody ? (schema?._example || (schema?.properties
                    ? buildPayload(Object.keys(schema.properties || {}), ep.path)
                    : {})) : null;
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

            const crudSteps = buildCrudSteps(order);
            crudSteps.forEach(s => { s.step_order = order++; steps.push(s); });

            let finalSteps;
            if (reviewSteps.length > 0) {
                finalSteps = reviewSteps.map((rs, i) => {
                    if (rs.crudStep) return { ...rs.crudStep, step_order: i + 1 };
                    if (rs.fixed && rs.name === 'Sign up' && signupId) {
                        const ep = endpoints.find(e => e.id === signupId);
                        const schema = safeJSON(ep?.request_body);
                        return {
                            step_order: i + 1, name: 'Sign up', endpoint_id: signupId, method: 'POST',
                            input_payload: schema?._example || buildPayload(Object.keys(schema?.properties || {}), ep?.path),
                            expected_status: 201, extract_vars: [{ var: 'userId', path: 'id' }], skip_if_failed: 0
                        };
                    }
                    if (rs.fixed && rs.name === 'Login' && loginId) {
                        const ep = endpoints.find(e => e.id === loginId);
                        const schema = safeJSON(ep?.request_body);
                        return {
                            step_order: i + 1, name: 'Login', endpoint_id: loginId, method: 'POST',
                            input_payload: schema?._example || buildPayload(Object.keys(schema?.properties || {}), ep?.path),
                            expected_status: 200,
                            extract_vars: [{ var: 'token', path: finalTokenPath }, { var: 'token', path: 'data.token' }, { var: 'token', path: 'access_token' }],
                            skip_if_failed: 0
                        };
                    }
                    const ep = endpoints.find(e => e.id === rs.endpointId);
                    if (!ep) return null;
                    const schema = safeJSON(ep.request_body);
                    const hasBody = ['POST', 'PUT', 'PATCH'].includes(ep.method);
                    const payload = hasBody ? (schema?._example || buildPayload(Object.keys(schema?.properties || {}), ep.path)) : null;
                    const pathParams = (ep.path.match(/\{(\w+)\}/g) || []).map(p => p.slice(1, -1));
                    return {
                        step_order: i + 1, name: `${ep.method} ${ep.path}`, endpoint_id: ep.id, method: ep.method,
                        input_payload: payload, input_params: pathParams.length ? Object.fromEntries(pathParams.map(p => [p, `{{${p}}}`])) : null,
                        expected_status: ep.method === 'DELETE' ? 204 : ep.method === 'POST' ? 201 : 200,
                        extract_vars: [], skip_if_failed: 1
                    };
                }).filter(Boolean);
            } else {
                finalSteps = steps;
            }

            const result = await api.flows.create(projectId, {
                name: suiteName || 'Full Auth Flow',
                description: `Wizard: ${finalSteps.length} steps · ${groups.filter(g => getGroupConfig(g.basePath).included).length} CRUD groups`,
                steps: finalSteps,
                auth_type: authType,
                static_token: authType === 'static' ? staticToken : null,
            });
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
        <div style={{ display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0 }}>
            {/* Progress — compact */}
            <div style={{ padding: '12px 20px', borderBottom: '1px solid var(--border)', flexShrink: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginBottom: 8 }}>
                    {Array.from({ length: TOTAL }, (_, i) => (
                        <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                            <div style={{
                                width: 22, height: 22, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center',
                                fontSize: 10, fontWeight: 700, flexShrink: 0,
                                background: i + 1 < step ? 'var(--green)' : i + 1 === step ? 'var(--accent)' : 'rgba(255,255,255,0.08)',
                                color: i + 1 <= step ? '#fff' : 'var(--text-tertiary)',
                            }}>
                                {i + 1 < step ? <Check size={11} /> : i + 1}
                            </div>
                            {i < TOTAL - 1 && <div style={{ width: 14, height: 1, background: i + 1 < step ? 'var(--green)' : 'var(--border)' }} />}
                        </div>
                    ))}
                </div>
                <div style={{ fontSize: 13, fontWeight: 600 }}>
                    {STEP_LABELS[step - 1]}
                </div>
            </div>

            {/* Scrollable step content */}
            <div style={{ flex: 1, overflow: 'auto', padding: '16px 20px', minHeight: 0 }}>

                {currentStepKey === 'auth_method' && (
                    <div>
                        <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 16, lineHeight: 1.6 }}>
                            Choose how HitAPI should authenticate when running this suite.
                        </div>

                        <div style={{ marginBottom: 16 }}>
                            {/* Option 1 — Auto login flow */}
                            <div
                                onClick={() => setAuthType('flow')}
                                style={{
                                    padding: '12px 14px', borderRadius: 8, marginBottom: 8, cursor: 'pointer',
                                    border: `1px solid ${authType === 'flow' ? 'rgba(130,100,255,0.5)' : 'var(--border)'}`,
                                    background: authType === 'flow' ? 'rgba(130,100,255,0.08)' : 'var(--bg-card)',
                                }}
                            >
                                <div style={{ fontSize: 13, fontWeight: 600, color: authType === 'flow' ? 'var(--accent)' : 'var(--text-primary)' }}>
                                    🔐 Auto login flow
                                </div>
                                <div style={{ fontSize: 11, color: 'var(--text-tertiary)', marginTop: 3 }}>
                                    HitAPI will run signup → login steps and extract the token automatically
                                </div>
                            </div>

                            {/* Option 2 — Static token */}
                            <div
                                onClick={() => setAuthType('static')}
                                style={{
                                    padding: '12px 14px', borderRadius: 8, marginBottom: 8, cursor: 'pointer',
                                    border: `1px solid ${authType === 'static' ? 'rgba(130,100,255,0.5)' : 'var(--border)'}`,
                                    background: authType === 'static' ? 'rgba(130,100,255,0.08)' : 'var(--bg-card)',
                                }}
                            >
                                <div style={{ fontSize: 13, fontWeight: 600, color: authType === 'static' ? 'var(--accent)' : 'var(--text-primary)' }}>
                                    🔑 Static API token
                                </div>
                                <div style={{ fontSize: 11, color: 'var(--text-tertiary)', marginTop: 3 }}>
                                    Provide a fixed token — no login step needed. Good for API keys that never expire.
                                </div>
                            </div>

                            {/* Option 3 — No auth */}
                            <div
                                onClick={() => setAuthType('none')}
                                style={{
                                    padding: '12px 14px', borderRadius: 8, cursor: 'pointer',
                                    border: `1px solid ${authType === 'none' ? 'rgba(130,100,255,0.5)' : 'var(--border)'}`,
                                    background: authType === 'none' ? 'rgba(130,100,255,0.08)' : 'var(--bg-card)',
                                }}
                            >
                                <div style={{ fontSize: 13, fontWeight: 600, color: authType === 'none' ? 'var(--accent)' : 'var(--text-primary)' }}>
                                    🌐 No authentication
                                </div>
                                <div style={{ fontSize: 11, color: 'var(--text-tertiary)', marginTop: 3 }}>
                                    API is public — no Authorization header needed
                                </div>
                            </div>

                            {authType === 'static' && (
                                <div style={{ marginTop: 12 }}>
                                    <Label>API Token / Bearer token</Label>
                                    <input
                                        type="password"
                                        value={staticToken}
                                        onChange={e => setStaticToken(e.target.value)}
                                        placeholder="eyJhbGciOiJIUzI1NiJ9... or sk-..."
                                        style={{
                                            width: '100%', padding: '8px 10px', borderRadius: 6,
                                            background: 'var(--bg-card)', border: '1px solid var(--border)',
                                            color: 'var(--text-primary)', fontSize: 12,
                                            fontFamily: 'JetBrains Mono, monospace',
                                        }}
                                    />
                                    <div style={{ fontSize: 10, color: 'var(--text-tertiary)', marginTop: 4 }}>
                                        This token will be sent as <code>Authorization: Bearer &lt;token&gt;</code> on every step
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>
                )}


                {currentStepKey === 'signup' && (
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

                {currentStepKey === 'login' && (
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

                {currentStepKey === 'token' && (
                    <div>
                        <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 16, lineHeight: 1.6 }}>
                            Where is the token in the login response? HitAPI will try common paths automatically, but you can specify a custom one.
                        </div>
                        <Label>Token path in response</Label>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, maxHeight: 280, overflow: 'auto' }}>
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

                {currentStepKey === 'endpoints' && (
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
                        <div style={{ marginTop: 10, fontSize: 11, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                            <span style={{ color: 'var(--text-tertiary)' }}>
                                {selected.size} endpoint{selected.size !== 1 ? 's' : ''} selected
                            </span>
                            {(() => {
                                const total = (signupId ? 1 : 0) + (loginId ? 1 : 0) + selected.size;
                                const over = total > 100;
                                return (
                                    <span style={{ fontSize: 11, fontWeight: 600, color: over ? 'var(--red)' : total > 90 ? 'var(--amber)' : 'var(--green)' }}>
                                        {total}/100 steps {over ? '⚠ over limit' : ''}
                                    </span>
                                );
                            })()}
                        </div>
                    </div>
                )}

                {currentStepKey === 'auth_config' && (
                    <StepAuthConfig
                        annotated={annotated}
                        toggleAuth={toggleAuth}
                        authCount={authCount}
                        publicCount={publicCount}
                    />
                )}

                {currentStepKey === 'crud' && (
                    <StepCrudGroups
                        groups={groups}
                        getGroupConfig={getGroupConfig}
                        toggleGroup={toggleGroup}
                        setIdPath={setIdPath}
                        excludeEndpoint={excludeEndpoint}
                        moveEndpoint={moveEndpoint}
                        resetEndpoint={resetEndpoint}
                        endpointOverrides={endpointOverrides}
                        excludedEndpoints={excludedEndpoints}
                    />
                )}

                {currentStepKey === 'review' && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                        <div>
                            <Label>Suite name</Label>
                            <Input value={suiteName} onChange={setSuiteName} placeholder="My Auth Flow" />
                        </div>

                        {generatingAI && (
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px', background: 'rgba(130,100,255,0.08)', borderRadius: 8, fontSize: 12, color: 'var(--accent)' }}>
                                <div className="spinner" style={{ width: 12, height: 12 }} />
                                ✨ Generating request bodies with AI — {aiProgress.done}/{aiProgress.total}
                            </div>
                        )}

                        <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                            <span>Steps ({reviewSteps.length}) — reorder with ↑↓</span>
                            <span style={{ fontSize: 11, color: 'var(--text-tertiary)', fontWeight: 400 }}>Signup & Login are fixed</span>
                        </div>

                        <div style={{ display: 'flex', flexDirection: 'column', gap: 4, maxHeight: 340, overflow: 'auto' }}>
                            {reviewSteps.map((s, i) => (
                                <div key={i} style={{
                                    display: 'flex', alignItems: 'center', gap: 8, padding: '8px 10px',
                                    borderRadius: 7, background: s.fixed ? 'rgba(255,255,255,0.02)' : 'rgba(255,255,255,0.02)',
                                    border: `1px solid ${s.fixed ? 'rgba(255,255,255,0.06)' : 'var(--border)'}`,
                                }}>
                                    {/* Step number */}
                                    <div style={{ width: 22, height: 22, borderRadius: '50%', background: `${s.color}22`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, fontWeight: 700, color: s.color, flexShrink: 0 }}>
                                        {s.order}
                                    </div>

                                    {/* Method badge */}
                                    <span className={`method-badge method-${s.method}`} style={{ fontSize: 9, flexShrink: 0 }}>{s.method}</span>

                                    {/* Path */}
                                    <span style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 11, color: 'var(--text-secondary)', flex: 1 }}>
                                        {s.path}
                                    </span>

                                    {/* NEW — AI badge */}
                                    {aiOverrides[i] && (
                                        <span title={aiOverrides[i].reasoning || 'Generated by AI'} style={{ fontSize: 9, padding: '1px 6px', borderRadius: 10, background: 'rgba(130,100,255,0.15)', color: 'var(--accent)', flexShrink: 0 }}>
                                            ✨ AI
                                        </span>
                                    )}

                                    {/* Fixed badge */}
                                    {s.fixed && (
                                        <span style={{ fontSize: 9, padding: '1px 6px', borderRadius: 10, background: 'rgba(255,255,255,0.06)', color: 'var(--text-tertiary)' }}>fixed</span>
                                    )}

                                    {/* ↑↓ buttons — only for non-fixed steps */}
                                    {!s.fixed && (
                                        <div style={{ display: 'flex', gap: 2, flexShrink: 0 }}>
                                            <button onClick={() => moveReviewStep(i, -1)} disabled={i <= (signupId && loginId ? 2 : signupId || loginId ? 1 : 0)}
                                                style={{
                                                    width: 22, height: 22, borderRadius: 4, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(255,255,255,0.05)', border: '1px solid var(--border)', color: 'var(--text-secondary)', fontSize: 11,
                                                    opacity: i <= (signupId && loginId ? 2 : signupId || loginId ? 1 : 0) ? 0.3 : 1
                                                }}>
                                                ↑
                                            </button>
                                            <button onClick={() => moveReviewStep(i, 1)} disabled={i === reviewSteps.length - 1}
                                                style={{
                                                    width: 22, height: 22, borderRadius: 4, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(255,255,255,0.05)', border: '1px solid var(--border)', color: 'var(--text-secondary)', fontSize: 11,
                                                    opacity: i === reviewSteps.length - 1 ? 0.3 : 1
                                                }}>
                                                ↓
                                            </button>
                                        </div>
                                    )}
                                </div>
                            ))}
                        </div>

                        {authType === 'flow' && !signupEp && !loginEp && (
                            <div style={{ padding: '10px 12px', background: 'var(--red-bg)', borderRadius: 8, fontSize: 12, color: 'var(--red)' }}>
                                ⚠ Select at least a login or signup endpoint to continue
                            </div>
                        )}
                        {error && <div style={{ padding: '10px 12px', background: 'var(--red-bg)', borderRadius: 8, fontSize: 12, color: 'var(--red)' }}>{error}</div>}
                    </div>
                )}
            </div>

            {/* Footer navigation — always visible */}
            <div style={{ padding: '12px 20px', borderTop: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', flexShrink: 0, background: 'var(--bg-card)' }}>
                <button onClick={() => step > 1 ? setStep(s => s - 1) : onClose()}
                    style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '7px 14px', borderRadius: 7, cursor: 'pointer', background: 'rgba(255,255,255,0.05)', color: 'var(--text-secondary)', border: '1px solid var(--border)', fontSize: 13 }}>
                    <ChevronLeft size={14} /> {step > 1 ? 'Back' : 'Cancel'}
                </button>
                {step < TOTAL ? (
                    <button onClick={() => setStep(s => s + 1)} style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '7px 16px', borderRadius: 7, cursor: 'pointer', background: 'var(--accent)', color: '#fff', border: 'none', fontSize: 13, fontWeight: 500 }}>
                        Next <ChevronRight size={14} />
                    </button>
                ) : (
                    <button onClick={handleCreate} disabled={creating || (authType === 'flow' && !signupId && !loginId) || (authType === 'static' && !staticToken.trim())}
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
    const [authType, setAuthType] = useState('flow');
    const [staticToken, setStaticToken] = useState('');

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

        setSteps(prev => prev.map(s => s.id === stepId ? {
            ...s,
            endpoint_id: endpointId,
            method: ep.method || 'GET',
            name: s.name || `${ep.method} ${ep.path}`,
        } : s));

        try {
            const result = await api.flows.generateStep(projectId, endpointId);
            setSteps(prev => prev.map(s => s.id === stepId ? {
                ...s,
                input_payload: result.input_payload ? JSON.stringify(result.input_payload, null, 2) : '',
                input_params: result.input_params ? JSON.stringify(result.input_params, null, 2) : '',
                expected_status: String(result.expected_status || (ep.method === 'POST' ? 201 : 200)),
                name: s.name || result.name || `${ep.method} ${ep.path}`,
            } : s));
            return;
        } catch (err) {
            console.warn('AI generation failed, using rule-based fallback:', err.message);
        }

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
        if (steps.length > 100) { setError(`Maximum 100 steps allowed. Remove ${steps.length - 100} step(s).`); return; }
        if (authType === 'static' && !staticToken.trim()) { setError('Enter a static token, or pick a different auth method'); return; }

        setCreating(true);
        setError('');
        try {
            const builtSteps = steps.map((s, i) => {
                // Parse extract_vars: "token=data.token, userId=data.id"
                const extractVars = s.extract_vars
                    ? s.extract_vars.split(',').map(part => {
                        const [varName, path] = part.trim().split('=').map(x =>
                            x.trim()
                                .replace(/^\[+/, '').replace(/\]+$/, '') // strip accidental [ ]
                                .replace(/^response\./, '') // strip accidental "response." prefix
                                .trim()
                        );
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
                steps: builtSteps,
                auth_type: authType,
                static_token: authType === 'static' ? staticToken : null,
            });
            onCreated(result);
        } catch (err) { setError(err.message); }
        finally { setCreating(false); }
    }

    return (
        <div style={{ display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0 }}>
            {/* Header */}
            <div style={{ padding: '14px 20px', borderBottom: '1px solid var(--border)', flexShrink: 0 }}>
                <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 6 }}>Suite name</div>
                <Input value={suiteName} onChange={setSuiteName} placeholder="e.g. Admin API Flow" />
                <div style={{ marginTop: 8, padding: '8px 10px', background: 'rgba(130,100,255,0.06)', borderRadius: 7, border: '1px solid rgba(130,100,255,0.15)', fontSize: 11, color: 'var(--text-secondary)', lineHeight: 1.6 }}>
                    <strong style={{ color: 'var(--accent)' }}>How it works:</strong> Add steps in order. Values extracted from one step (like <code style={{ fontFamily: 'JetBrains Mono, monospace', color: 'var(--accent)' }}>{'{{token}}'}</code>) are automatically injected into all following steps.
                </div>
            </div>

            <div style={{ padding: '14px 20px', borderBottom: '1px solid var(--border)', flexShrink: 0 }}>
                <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 6 }}>Suite name</div>
                <Input value={suiteName} onChange={setSuiteName} placeholder="e.g. Admin API Flow" />

                {/* NEW — compact auth type selector */}
                <div style={{ marginTop: 12 }}>
                    <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 6 }}>Authentication</div>
                    <div style={{ display: 'flex', gap: 6 }}>
                        {[
                            { key: 'flow', label: '🔐 Login flow', hint: 'signup → login → extract token' },
                            { key: 'static', label: '🔑 Static token', hint: 'fixed token, no login step' },
                            { key: 'none', label: '🌐 No auth', hint: 'public API' },
                        ].map(opt => (
                            <div
                                key={opt.key}
                                onClick={() => setAuthType(opt.key)}
                                title={opt.hint}
                                style={{
                                    flex: 1, padding: '7px 10px', borderRadius: 7, cursor: 'pointer', textAlign: 'center',
                                    border: `1px solid ${authType === opt.key ? 'rgba(130,100,255,0.5)' : 'var(--border)'}`,
                                    background: authType === opt.key ? 'rgba(130,100,255,0.08)' : 'var(--bg-card)',
                                    fontSize: 11, fontWeight: 600,
                                    color: authType === opt.key ? 'var(--accent)' : 'var(--text-secondary)',
                                }}
                            >
                                {opt.label}
                            </div>
                        ))}
                    </div>

                    {authType === 'static' && (
                        <div style={{ marginTop: 8 }}>
                            <input
                                type="password"
                                value={staticToken}
                                onChange={e => setStaticToken(e.target.value)}
                                placeholder="Paste API token / Bearer token…"
                                style={{
                                    width: '100%', padding: '8px 10px', borderRadius: 6,
                                    background: 'var(--bg-card)', border: '1px solid var(--border)',
                                    color: 'var(--text-primary)', fontSize: 12,
                                    fontFamily: 'JetBrains Mono, monospace',
                                }}
                            />
                            <div style={{ fontSize: 10, color: 'var(--text-tertiary)', marginTop: 4 }}>
                                Sent as <code>Authorization: Bearer &lt;token&gt;</code> on every step
                            </div>
                        </div>
                    )}

                    {authType === 'flow' && (
                        <div style={{ fontSize: 10, color: 'var(--text-tertiary)', marginTop: 4 }}>
                            Add a signup/login step below manually, and extract the token via "extract vars" on that step.
                        </div>
                    )}
                </div>

                <div style={{ marginTop: 8, padding: '8px 10px', background: 'rgba(130,100,255,0.06)', borderRadius: 7, border: '1px solid rgba(130,100,255,0.15)', fontSize: 11, color: 'var(--text-secondary)', lineHeight: 1.6 }}>
                    <strong style={{ color: 'var(--accent)' }}>How it works:</strong> Add steps in order. Values extracted from one step (like <code style={{ fontFamily: 'JetBrains Mono, monospace', color: 'var(--accent)' }}>{'{{token}}'}</code>) are automatically injected into all following steps.
                </div>
            </div>

            {/* Steps — scrollable */}
            <div style={{ flex: 1, overflow: 'auto', padding: '14px 20px', minHeight: 0 }}>
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
                            projectId={projectId}
                            onUpdate={(key, val) => updateStep(s.id, key, val)}
                            onPickEndpoint={(epId) => onPickEndpoint(s.id, epId)}
                            onRemove={() => removeStep(s.id)}
                            onMoveUp={() => moveStep(s.id, -1)}
                            onMoveDown={() => moveStep(s.id, 1)} />
                    ))
                )}

                <button onClick={addStep} disabled={steps.length >= 30} style={{
                    width: '100%', padding: '10px', borderRadius: 8, cursor: steps.length >= 30 ? 'not-allowed' : 'pointer', marginTop: 8,
                    background: steps.length >= 30 ? 'rgba(255,92,92,0.05)' : 'rgba(130,100,255,0.06)',
                    color: steps.length >= 30 ? 'var(--red)' : 'var(--accent)',
                    border: `1px dashed ${steps.length >= 30 ? 'rgba(255,92,92,0.3)' : 'rgba(130,100,255,0.3)'}`,
                    fontSize: 13, fontWeight: 500,
                    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6
                }}>
                    {steps.length >= 30
                        ? `⚠ Maximum 100 steps reached`
                        : <><Plus size={14} /> Add step ({steps.length}/30)</>}
                </button>
            </div>

            {/* Footer — always visible */}
            <div style={{ padding: '12px 20px', borderTop: '1px solid var(--border)', flexShrink: 0, background: 'var(--bg-card)' }}>
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

// function StepEditor({ step, index, total, endpoints, onUpdate, onPickEndpoint, onRemove, onMoveUp, onMoveDown }) {
//     const [expanded, setExpanded] = useState(true);

//     return (
//         <div style={{ marginBottom: 10, border: '1px solid var(--border)', borderRadius: 10, overflow: 'hidden' }}>
//             {/* Step header */}
//             <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 14px', background: 'rgba(255,255,255,0.02)', cursor: 'pointer' }}
//                 onClick={() => setExpanded(e => !e)}>
//                 <div style={{ width: 22, height: 22, borderRadius: '50%', background: 'var(--accent-dim)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, fontWeight: 700, color: 'var(--accent)', flexShrink: 0 }}>
//                     {index + 1}
//                 </div>
//                 <span style={{ flex: 1, fontSize: 13, fontWeight: 500 }}>{step.name || `Step ${index + 1}`}</span>
//                 {step.endpoint_id && (() => { const ep = endpoints.find(e => e.id === step.endpoint_id); return ep ? <span className={`method-badge method-${ep.method}`} style={{ fontSize: 9 }}>{ep.method}</span> : null; })()}
//                 <div style={{ display: 'flex', gap: 4 }} onClick={e => e.stopPropagation()}>
//                     {index > 0 && <button onClick={onMoveUp} style={{ padding: '2px 5px', borderRadius: 4, cursor: 'pointer', background: 'rgba(255,255,255,0.05)', border: '1px solid var(--border)', fontSize: 10, color: 'var(--text-tertiary)' }}>↑</button>}
//                     {index < total - 1 && <button onClick={onMoveDown} style={{ padding: '2px 5px', borderRadius: 4, cursor: 'pointer', background: 'rgba(255,255,255,0.05)', border: '1px solid var(--border)', fontSize: 10, color: 'var(--text-tertiary)' }}>↓</button>}
//                     <button onClick={onRemove} style={{ padding: '2px 5px', borderRadius: 4, cursor: 'pointer', background: 'var(--red-bg)', border: '1px solid rgba(255,92,92,0.25)', color: 'var(--red)' }}><Trash2 size={11} /></button>
//                 </div>
//                 {expanded ? <ChevronDown size={13} color="var(--text-tertiary)" /> : <ChevronRight size={13} color="var(--text-tertiary)" />}
//             </div>

//             {expanded && (
//                 <div style={{ padding: '14px', display: 'flex', flexDirection: 'column', gap: 12, borderTop: '1px solid rgba(255,255,255,0.04)' }}>
//                     {/* Name */}
//                     <div>
//                         <Label hint="Give this step a clear name">Step name</Label>
//                         <Input value={step.name} onChange={v => onUpdate('name', v)} placeholder="e.g. Login, Create user, Get profile" />
//                     </div>

//                     {/* Endpoint picker */}
//                     <div>
//                         <Label hint="Pick from your imported Swagger endpoints">Endpoint</Label>
//                         <EndpointPicker endpoints={endpoints} value={step.endpoint_id} onChange={onPickEndpoint} />
//                         {!step.endpoint_id && (
//                             <div style={{ marginTop: 6, fontSize: 11, color: 'var(--text-tertiary)', display: 'flex', alignItems: 'center', gap: 4 }}>
//                                 <span>💡</span> Search by method (e.g. <code style={{ fontFamily: 'JetBrains Mono, monospace' }}>POST</code>) or path keyword (e.g. <code style={{ fontFamily: 'JetBrains Mono, monospace' }}>login</code>)
//                             </div>
//                         )}
//                     </div>

//                     {/* Method + Expected status */}
//                     <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
//                         <div>
//                             <Label hint="HTTP method">Method</Label>
//                             <select className="input" value={step.method} onChange={e => onUpdate('method', e.target.value)} style={{ width: '100%' }}>
//                                 {['GET', 'POST', 'PUT', 'PATCH', 'DELETE'].map(m => <option key={m}>{m}</option>)}
//                             </select>
//                         </div>
//                         <div>
//                             <Label hint="What HTTP status means success?">Expected status</Label>
//                             <Input value={step.expected_status} onChange={v => onUpdate('expected_status', v)} placeholder="200" />
//                             <div style={{ marginTop: 4, fontSize: 10, color: 'var(--text-tertiary)' }}>200 = OK · 201 = Created · 204 = Deleted</div>
//                         </div>
//                     </div>

//                     {/* Request body */}
//                     {['POST', 'PUT', 'PATCH'].includes(step.method) && (
//                         <div>
//                             <Label hint="Use {{token}} or {{userId}} to inject values from previous steps">Request body (JSON)</Label>
//                             <Textarea value={step.input_payload} onChange={v => onUpdate('input_payload', v)}
//                                 placeholder={'{\n  "email": "test@example.com",\n  "password": "Test@123456"\n}'} rows={5} />
//                             {step.input_payload === '{}' && (
//                                 <div style={{ marginTop: 5, fontSize: 11, color: 'var(--amber)', display: 'flex', gap: 4 }}>
//                                     ⚠ Empty body — your API may return 400. Fill in the required fields.
//                                 </div>
//                             )}
//                         </div>
//                     )}

//                     {/* Path params */}
//                     <div>
//                         <Label hint="For URLs like /users/{id} — use {{userId}} to inject from a previous step">Path / query params (JSON)</Label>
//                         <Textarea value={step.input_params} onChange={v => onUpdate('input_params', v)}
//                             placeholder={'{\n  "id": "{{userId}}"\n}'} rows={2} />
//                         <div style={{ marginTop: 4, fontSize: 11, color: 'var(--text-tertiary)' }}>
//                             e.g. if URL is <code style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 10 }}>/users/{'{id}'}</code> → set <code style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 10 }}>{'"id": "{{userId}}"'}</code>
//                         </div>
//                     </div>

//                     {/* Extract vars */}
//                     <div>
//                         <Label hint="Save values from this response for use in later steps">Extract from response</Label>
//                         <Input value={step.extract_vars} onChange={v => onUpdate('extract_vars', v)}
//                             placeholder="adminUserId=id, token=data.token" />
//                         <div style={{ marginTop: 4, fontSize: 11, color: 'var(--text-tertiary)', lineHeight: 1.5 }}>
//                             Format: <code style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 10 }}>variableName=path</code>
//                             &nbsp;— e.g. response <code style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 10 }}>{`{"id": 11}`}</code> → type <code style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 10, color: 'var(--accent)' }}>adminUserId=id</code> → use as <code style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 10, color: 'var(--accent)' }}>{'{{adminUserId}}'}</code>
//                         </div>
//                     </div>

//                     {/* Skip if failed */}
//                     <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: 12, color: 'var(--text-secondary)' }}>
//                         <div onClick={() => onUpdate('skip_if_failed', !step.skip_if_failed)} style={{
//                             width: 32, height: 18, borderRadius: 9, position: 'relative', cursor: 'pointer', flexShrink: 0,
//                             background: step.skip_if_failed ? 'var(--accent)' : 'rgba(255,255,255,0.1)',
//                             transition: 'background 0.2s'
//                         }}>
//                             <div style={{ width: 14, height: 14, borderRadius: '50%', background: '#fff', position: 'absolute', top: 2, left: step.skip_if_failed ? 16 : 2, transition: 'left 0.2s' }} />
//                         </div>
//                         <div>
//                             Skip next steps if this step fails
//                             <div style={{ fontSize: 10, color: 'var(--text-tertiary)', marginTop: 1 }}>Useful for auth steps — if login fails, skip all API tests</div>
//                         </div>
//                     </label>
//                 </div>
//             )}
//         </div>
//     );
// }


function StepEditor({ step, index, total, endpoints, projectId, onUpdate, onPickEndpoint, onRemove, onMoveUp, onMoveDown }) {
    const [expanded, setExpanded] = useState(true);
    const [generating, setGenerating] = useState(false);
    const [aiHint, setAiHint] = useState('');

    async function handleAIFill() {
        if (!step.endpoint_id) return;
        setGenerating(true);
        setAiHint('');
        try {
            const result = await api.flows.generateStep(projectId, step.endpoint_id);
            if (result.input_payload) onUpdate('input_payload', JSON.stringify(result.input_payload, null, 2));
            if (result.input_params) onUpdate('input_params', JSON.stringify(result.input_params, null, 2));
            if (result.expected_status) onUpdate('expected_status', String(result.expected_status));
            if (result.name && !step.name) onUpdate('name', result.name);
            if (result.reasoning) setAiHint(result.reasoning);
        } catch (err) {
            setAiHint(`⚠ AI generation failed: ${err.message}`);
        } finally {
            setGenerating(false);
        }
    }

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
                        <Label hint="Give this step a clear name">Step name</Label>
                        <Input value={step.name} onChange={v => onUpdate('name', v)} placeholder="e.g. Login, Create user, Get profile" />
                    </div>

                    {/* Endpoint picker + AI Fill button */}
                    <div>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
                            <Label hint="Pick from your imported Swagger endpoints">Endpoint</Label>
                            <button
                                onClick={handleAIFill}
                                disabled={!step.endpoint_id || generating}
                                title={!step.endpoint_id ? 'Pick an endpoint first' : 'Generate request body, params, and expected status with AI'}
                                style={{
                                    display: 'flex', alignItems: 'center', gap: 5,
                                    padding: '3px 10px', borderRadius: 6, fontSize: 11,
                                    cursor: (!step.endpoint_id || generating) ? 'not-allowed' : 'pointer',
                                    background: generating ? 'rgba(130,100,255,0.1)' : 'linear-gradient(135deg, rgba(130,100,255,0.18), rgba(92,168,255,0.18))',
                                    color: 'var(--accent)', border: '1px solid rgba(130,100,255,0.3)',
                                    opacity: !step.endpoint_id ? 0.4 : 1,
                                }}
                            >
                                {generating
                                    ? <><div className="spinner" style={{ width: 10, height: 10 }} /> Generating…</>
                                    : <>✨ AI Fill</>}
                            </button>
                        </div>
                        <EndpointPicker endpoints={endpoints} value={step.endpoint_id} onChange={onPickEndpoint} />
                        {!step.endpoint_id && (
                            <div style={{ marginTop: 6, fontSize: 11, color: 'var(--text-tertiary)', display: 'flex', alignItems: 'center', gap: 4 }}>
                                <span>💡</span> Search by method (e.g. <code style={{ fontFamily: 'JetBrains Mono, monospace' }}>POST</code>) or path keyword (e.g. <code style={{ fontFamily: 'JetBrains Mono, monospace' }}>login</code>)
                            </div>
                        )}
                        {aiHint && (
                            <div style={{ marginTop: 6, padding: '6px 9px', background: aiHint.startsWith('⚠') ? 'var(--red-bg)' : 'rgba(130,100,255,0.08)', borderRadius: 6, fontSize: 11, color: aiHint.startsWith('⚠') ? 'var(--red)' : 'var(--accent)' }}>
                                {aiHint.startsWith('⚠') ? aiHint : `✨ ${aiHint}`}
                            </div>
                        )}
                    </div>

                    {/* Method + Expected status */}
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                        <div>
                            <Label hint="HTTP method">Method</Label>
                            <select className="input" value={step.method} onChange={e => onUpdate('method', e.target.value)} style={{ width: '100%' }}>
                                {['GET', 'POST', 'PUT', 'PATCH', 'DELETE'].map(m => <option key={m}>{m}</option>)}
                            </select>
                        </div>
                        <div>
                            <Label hint="What HTTP status means success?">Expected status</Label>
                            <Input value={step.expected_status} onChange={v => onUpdate('expected_status', v)} placeholder="200" />
                            <div style={{ marginTop: 4, fontSize: 10, color: 'var(--text-tertiary)' }}>200 = OK · 201 = Created · 204 = Deleted</div>
                        </div>
                    </div>

                    {/* Request body */}
                    {['POST', 'PUT', 'PATCH'].includes(step.method) && (
                        <div>
                            <Label hint="Use {{token}} or {{userId}} to inject values from previous steps">Request body (JSON)</Label>
                            <Textarea value={step.input_payload} onChange={v => onUpdate('input_payload', v)}
                                placeholder={'{\n  "email": "test@example.com",\n  "password": "Test@123456"\n}'} rows={5} />
                            {step.input_payload === '{}' && (
                                <div style={{ marginTop: 5, fontSize: 11, color: 'var(--amber)', display: 'flex', gap: 4 }}>
                                    ⚠ Empty body — your API may return 400. Click <strong>✨ AI Fill</strong> above or fill in the required fields.
                                </div>
                            )}
                        </div>
                    )}

                    {/* Path params */}
                    <div>
                        <Label hint="For URLs like /users/{id} — use {{userId}} to inject from a previous step">Path / query params (JSON)</Label>
                        <Textarea value={step.input_params} onChange={v => onUpdate('input_params', v)}
                            placeholder={'{\n  "id": "{{userId}}"\n}'} rows={2} />
                        <div style={{ marginTop: 4, fontSize: 11, color: 'var(--text-tertiary)' }}>
                            e.g. if URL is <code style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 10 }}>/users/{'{id}'}</code> → set <code style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 10 }}>{'"id": "{{userId}}"'}</code>
                        </div>
                    </div>

                    {/* Extract vars */}
                    <div>
                        <Label hint="Save values from this response for use in later steps">Extract from response</Label>
                        <Input value={step.extract_vars} onChange={v => onUpdate('extract_vars', v)}
                            placeholder="adminUserId=id, token=data.token" />
                        <div style={{ marginTop: 4, fontSize: 11, color: 'var(--text-tertiary)', lineHeight: 1.5 }}>
                            Format: <code style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 10 }}>variableName=path</code>
                            &nbsp;— e.g. response <code style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 10 }}>{`{"id": 11}`}</code> → type <code style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 10, color: 'var(--accent)' }}>adminUserId=id</code> → use as <code style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 10, color: 'var(--accent)' }}>{'{{adminUserId}}'}</code>
                        </div>
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
                        <div>
                            Skip next steps if this step fails
                            <div style={{ fontSize: 10, color: 'var(--text-tertiary)', marginTop: 1 }}>Useful for auth steps — if login fails, skip all API tests</div>
                        </div>
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
    const [mode, setMode] = useState(null);
    const [endpoints, setEndpoints] = useState([]);
    const [loading, setLoading] = useState(true);
    const [authType, setAuthType] = useState('flow');
    const [staticToken, setStaticToken] = useState('');

    useEffect(() => {
        api.endpoints.list(projectId)
            .then(data => {
                // API returns {endpoints: [], stats: {}} or plain array
                const list = Array.isArray(data) ? data : (data?.endpoints || data?.data || []);
                setEndpoints(list);
            })
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
                maxHeight: '92vh', borderRadius: 14,
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