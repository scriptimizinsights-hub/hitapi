import { useState } from 'react';
import { api } from '../../store/index.js';
import {
    Check, Plus, PenLine,
} from 'lucide-react';

import { Input, safeJSON } from './Helpers.jsx'
export default function ManualBuilder({ projectId, endpoints, onCreated, onClose }) {
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
    async function onPickEndpoint(stepId, endpointId) {
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
                input_payload: result.input_payload ? JSON.stringify(result.input_payload) : '',
                input_params: result.input_params ? JSON.stringify(result.input_params) : '',
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