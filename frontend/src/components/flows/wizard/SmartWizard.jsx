import { useState, useEffect } from 'react';
import { api } from '../../../store/index.js';
import {
    ChevronRight, ChevronLeft, Check,
    Lock,
} from 'lucide-react';
import { useAuthDetector } from '../hooks/useAuthDetector.js';
import { useEndpointGroups } from '../hooks/useEndpointGroups.js';
import { StepAuthConfig } from './StepAuthConfig.jsx';
import { StepCrudGroups } from './StepCrudGroups.jsx';
import { Label, Input, EndpointPicker, safeJSON } from './Helpers.jsx'

export default function SmartWizard({ projectId, endpoints, onCreated, onClose }) {
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
        console.log('calling generateAllPayloadsWithAI', preview);
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
                setAiOverrides(prev => ({ ...prev, [endpointId]: result?.data || result }));
            } catch (err) {
                console.warn(`AI generation failed for step ${i}:`, err.message);
            }
            setAiProgress(prev => ({ ...prev, done: prev.done + 1 }));
        }

        setGeneratingAI(false);
    }

    function guardedClose() {
        if (generatingAI) {
            addToast?.('⏳ Please wait — generating request bodies with AI', 'info');
            return;
        }
        onClose();
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
                const aiCases = aiOverrides[id] || [];
                // If AI generated test cases, add ALL of them
                if (aiCases.length > 0) {
                    for (const aiCase of aiCases) {
                        const pathParams =
                            (ep.path.match(/\{(\w+)\}/g) || [])
                                .map(p => p.slice(1, -1));

                        steps.push({
                            step_order: order++,
                            name: aiCase.name,
                            endpoint_id: ep.id,
                            method: ep.method,
                            path: ep.path,
                            input_payload: aiCase.input_payload,
                            input_params: aiCase.input_params,
                            expected_status: aiCase.expected_status,
                            extract_vars: aiCase.extract_vars || [],
                            skip_if_failed: 1
                        });
                    }

                    continue;
                }
                const schema = safeJSON(ep.request_body);
                const hasBody = ['POST', 'PUT', 'PATCH'].includes(ep.method);
                const payload = hasBody
                    ? (
                        schema?._example ||
                        (
                            schema?.properties
                                ? buildPayload(
                                    Object.keys(schema.properties || {}),
                                    ep.path
                                )
                                : {}
                        )
                    )
                    : null;

                const pathParams =
                    (ep.path.match(/\{(\w+)\}/g) || [])
                        .map(p => p.slice(1, -1));

                steps.push({
                    step_order: order++,
                    name: `${ep.method} ${ep.path}`,
                    endpoint_id: ep.id,
                    method: ep.method,
                    path: ep.path,

                    input_payload: payload,

                    input_params: pathParams.length
                        ? Object.fromEntries(
                            pathParams.map(p => [
                                p,
                                `{{${p === 'id' ? 'userId' : p}}}`
                            ])
                        )
                        : null,

                    expected_status:
                        ep.method === 'DELETE'
                            ? 204
                            : ep.method === 'POST'
                                ? 201
                                : 200,

                    extract_vars: [],
                    skip_if_failed: 1
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