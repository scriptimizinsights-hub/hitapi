/**
 * StepEditPanel
 * Inline edit panel for a flow step result.
 * Single Responsibility: only handles editing + single-step execution.
 * Does NOT touch suite-level run logic.
 */
import { useState } from 'react';
import { api } from '../../store/index.js';
import { Play, Save, X, Info, Check } from 'lucide-react';

function safeJSON(val) {
    if (!val) return null;
    if (typeof val === 'object') return val;
    try { return JSON.parse(val); } catch { return null; }
}

function prettyJSON(val) {
    if (!val) return '';
    if (typeof val === 'string') {
        try { return JSON.stringify(JSON.parse(val), null, 2); } catch { return val; }
    }
    return JSON.stringify(val, null, 2);
}

// ── JSON editor with validation ───────────────────────────────────────────────
function JSONEditor({ label, hint, value, onChange, placeholder, rows = 5, reference }) {
    const [error, setError] = useState('');

    function handleChange(raw) {
        onChange(raw);
        if (!raw.trim()) { setError(''); return; }
        try { JSON.parse(raw); setError(''); }
        catch (e) { setError(e.message); }
    }

    return (
        <div>
            <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 5 }}>
                <div>
                    <span style={{ fontSize: 12, fontWeight: 500, color: 'var(--text-secondary)' }}>{label}</span>
                    {hint && <span style={{ fontSize: 11, color: 'var(--text-tertiary)', marginLeft: 6 }}>{hint}</span>}
                </div>
                {reference && (
                    <button
                        onClick={() => onChange(prettyJSON(reference))}
                        style={{ fontSize: 10, padding: '2px 7px', borderRadius: 4, cursor: 'pointer', background: 'var(--accent-dim)', color: 'var(--accent)', border: '1px solid rgba(130,100,255,0.25)' }}>
                        Use Swagger example
                    </button>
                )}
            </div>
            <textarea
                value={value}
                onChange={e => handleChange(e.target.value)}
                rows={rows}
                placeholder={placeholder}
                style={{
                    width: '100%', boxSizing: 'border-box', fontFamily: 'JetBrains Mono, monospace',
                    fontSize: 11, resize: 'vertical', background: 'var(--bg-input)', color: 'var(--text-primary)',
                    border: `1px solid ${error ? 'var(--red)' : 'var(--border)'}`, borderRadius: 7, padding: '8px 10px',
                    outline: 'none', lineHeight: 1.6
                }} />
            {error && <div style={{ fontSize: 10, color: 'var(--red)', marginTop: 3 }}>⚠ {error}</div>}
        </div>
    );
}

// ── Context vars badge ────────────────────────────────────────────────────────
function ContextBadge({ context }) {
    const vars = Object.entries(context || {}).filter(([k]) => !k.startsWith('__'));
    if (!vars.length) return null;
    return (
        <div style={{ padding: '8px 10px', background: 'var(--accent-dim)', borderRadius: 7, border: '1px solid rgba(130,100,255,0.15)' }}>
            <div style={{ fontSize: 10, fontWeight: 600, color: 'var(--accent)', textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: 5 }}>
                Available context vars (from previous steps)
            </div>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                {vars.map(([k, v]) => (
                    <span key={k} title={String(v)} style={{ fontSize: 10, fontFamily: 'JetBrains Mono, monospace', padding: '2px 7px', borderRadius: 10, background: 'rgba(130,100,255,0.15)', color: 'var(--accent)' }}>
                        {`{{${k}}}`}
                    </span>
                ))}
            </div>
            <div style={{ fontSize: 10, color: 'var(--text-tertiary)', marginTop: 5 }}>
                Use these in your request body or path params
            </div>
        </div>
    );
}

// ── Main export ───────────────────────────────────────────────────────────────
export function StepEditPanel({ step, result, context, projectId, suiteId, swaggerExample, onClose, onSaved, onRunResult }) {
    // Initialise from last result's request (what was actually sent) — fallback to step definition
    const [body, setBody] = useState(() => {
        const fromResult = result?.request_body;
        const fromStep = step?.input_payload;
        const raw = fromResult || fromStep;
        return prettyJSON(raw);
    });
    const [params, setParams] = useState(() => prettyJSON(result?.request_params || step?.input_params));
    const [expectedStatus, setExpectedStatus] = useState(String(step?.expected_status || result?.actual_status || 200));
    const [extractVars, setExtractVars] = useState(
        step?.extract_vars
            ? (Array.isArray(step.extract_vars)
                ? step.extract_vars.map(v => `${v.var}=${v.path}`).join(', ')
                : step.extract_vars)
            : ''
    );

    const [running, setRunning] = useState(false);
    const [saving, setSaving] = useState(false);
    const [saveSuccess, setSaveSuccess] = useState(false);
    const [runResult, setRunResult] = useState(null);
    const [error, setError] = useState('');

    const method = step?.method || result?.request_method || 'GET';
    const url = result?.request_url || '';
    const hasBody = ['POST', 'PUT', 'PATCH'].includes(method);

    function parseBody() {
        if (!body?.trim()) return null;
        try { return JSON.parse(body); } catch { return body; }
    }

    function parseParams() {
        if (!params?.trim()) return null;
        try { return JSON.parse(params); } catch { return null; }
    }

    // ── Run single step with current edit values ──────────────────────────────
    async function handleRun() {
        setRunning(true);
        setRunResult(null);
        setError('');

        try {
            // Build URL with params + context
            let resolvedUrl = url;
            const parsedParams = parseParams() || {};
            const mergedContext = { ...context };

            // Resolve {{var}} in URL
            resolvedUrl = resolvedUrl.replace(/\{\{(\w+)\}\}/g, (_, k) =>
                mergedContext[k] !== undefined ? String(mergedContext[k]) : `{{${k}}}`
            );
            // Replace path params
            for (const [k, v] of Object.entries(parsedParams)) {
                const resolved = String(v).replace(/\{\{(\w+)\}\}/g, (_, kk) => mergedContext[kk] || kk);
                resolvedUrl = resolvedUrl.replace(`{${k}}`, encodeURIComponent(resolved));
                resolvedUrl = resolvedUrl.replace(/%7B%7B\w+%7D%7D/g, '1');
            }

            // Build headers — inject token from context
            const headers = { 'Content-Type': 'application/json' };
            if (mergedContext.__token || mergedContext.token) {
                headers['Authorization'] = `Bearer ${mergedContext.__token || mergedContext.token}`;
            }

            // Resolve {{var}} in body
            let resolvedBody = body;
            if (resolvedBody) {
                resolvedBody = resolvedBody.replace(/\{\{(\w+)\}\}/g, (_, k) =>
                    mergedContext[k] !== undefined ? JSON.stringify(mergedContext[k]).replace(/^"|"$/g, '') : `{{${k}}}`
                );
            }

            const start = Date.now();
            const response = await fetch(resolvedUrl, {
                method,
                headers,
                body: hasBody ? (resolvedBody || '{}') : undefined,
            });

            const ct = response.headers.get('content-type') || '';
            const responseBody = ct.includes('application/json')
                ? await response.json().catch(() => null)
                : { _text: await response.text() };

            const ms = Date.now() - start;
            const expected = parseInt(expectedStatus) || null;
            const passed = !expected || response.status === expected;

            const res = {
                status: passed ? 'passed' : 'failed',
                actual_status: response.status,
                actual_body: responseBody,
                response_time_ms: ms,
                failure_reason: passed ? null : `Expected ${expected}, got ${response.status}`,
                request_url: resolvedUrl,
                request_method: method,
                request_headers: headers,
                request_body: parseBody(),
            };

            setRunResult(res);
            onRunResult?.(res);
        } catch (err) {
            setError(err.message);
        } finally {
            setRunning(false);
        }
    }

    // ── Save edits back to DB ─────────────────────────────────────────────────
    async function handleSave() {
        if (!step?.id) { setError('Step ID missing — cannot save'); return; }
        setSaving(true);
        setError('');
        try {
            const extractVarsParsed = extractVars
                ? extractVars.split(',').map(part => {
                    const [varName, path] = part.trim().split('=').map(s => s.trim());
                    return varName && path ? { var: varName, path } : null;
                }).filter(Boolean)
                : [];

            const response = await api.flows.updateStep(projectId, suiteId, step.id, {
                input_payload: parseBody(),
                input_params: parseParams(),
                expected_status: parseInt(expectedStatus) || null,
                extract_vars: extractVarsParsed,
            });

            console.log('[StepEditPanel] Save response:', response);
            setSaveSuccess(true);
            setTimeout(() => setSaveSuccess(false), 2000);
            onSaved?.();
        } catch (err) {
            setError(err.message);
        } finally {
            setSaving(false);
        }
    }

    return (
        <div style={{
            background: 'rgba(0,0,0,0.25)', borderTop: '1px solid rgba(130,100,255,0.2)',
            borderBottom: '1px solid rgba(130,100,255,0.2)',
        }}>
            <div style={{ padding: '16px 18px', display: 'flex', flexDirection: 'column', gap: 14 }}>

                {/* Header */}
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <div style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--accent)' }} />
                        <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--accent)' }}>Editing step</span>
                        <span style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 11, color: 'var(--text-secondary)' }}>
                            {method} {url.replace(/^https?:\/\/[^/]+/, '')}
                        </span>
                    </div>
                    <button onClick={onClose} style={{ padding: '3px 6px', borderRadius: 5, cursor: 'pointer', background: 'rgba(255,255,255,0.05)', border: '1px solid var(--border)', color: 'var(--text-tertiary)', display: 'flex', alignItems: 'center' }}>
                        <X size={13} />
                    </button>
                </div>

                {/* Context vars */}
                <ContextBadge context={context} />

                {/* Swagger reference */}
                {swaggerExample && (
                    <div style={{ padding: '8px 10px', background: 'rgba(0,0,0,0.2)', borderRadius: 7, border: '1px solid rgba(255,255,255,0.06)' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginBottom: 5 }}>
                            <Info size={11} color="var(--text-tertiary)" />
                            <span style={{ fontSize: 10, fontWeight: 600, color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '.06em' }}>Swagger example (reference)</span>
                        </div>
                        <pre style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 10, color: 'var(--text-tertiary)', margin: 0, whiteSpace: 'pre-wrap' }}>
                            {prettyJSON(swaggerExample)}
                        </pre>
                    </div>
                )}

                {/* 2-col grid: left=edit fields, right=run result */}
                <div style={{ display: 'grid', gridTemplateColumns: runResult ? '1fr 1fr' : '1fr', gap: 16 }}>

                    {/* Left: edit fields */}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>

                        {/* Body */}
                        {hasBody && (
                            <JSONEditor
                                label="Request body"
                                hint="Supports {{token}}, {{userId}} placeholders"
                                value={body}
                                onChange={setBody}
                                reference={swaggerExample}
                                placeholder={'{\n  "email": "test@example.com"\n}'}
                                rows={6}
                            />
                        )}

                        {/* Params */}
                        <JSONEditor
                            label="Path / query params"
                            hint='e.g. {"id": "{{userId}}"}'
                            value={params}
                            onChange={setParams}
                            placeholder='{"id": "{{userId}}"}'
                            rows={2}
                        />

                        {/* Expected status + Extract vars */}
                        <div style={{ display: 'grid', gridTemplateColumns: '120px 1fr', gap: 10 }}>
                            <div>
                                <div style={{ fontSize: 12, fontWeight: 500, color: 'var(--text-secondary)', marginBottom: 5 }}>Expected status</div>
                                <input value={expectedStatus} onChange={e => setExpectedStatus(e.target.value)}
                                    style={{ width: '100%', boxSizing: 'border-box', background: 'var(--bg-input)', color: 'var(--text-primary)', border: '1px solid var(--border)', borderRadius: 7, padding: '7px 10px', fontSize: 13, outline: 'none', fontFamily: 'JetBrains Mono, monospace' }} />
                            </div>
                            <div>
                                <div style={{ fontSize: 12, fontWeight: 500, color: 'var(--text-secondary)', marginBottom: 5 }}>
                                    Extract from response
                                    <span style={{ fontSize: 10, color: 'var(--text-tertiary)', marginLeft: 5 }}>varName=response.path</span>
                                </div>
                                <input value={extractVars} onChange={e => setExtractVars(e.target.value)}
                                    placeholder="token=data.token, userId=data.id"
                                    style={{ width: '100%', boxSizing: 'border-box', background: 'var(--bg-input)', color: 'var(--text-primary)', border: '1px solid var(--border)', borderRadius: 7, padding: '7px 10px', fontSize: 12, outline: 'none' }} />
                            </div>
                        </div>
                    </div>

                    {/* Right: run result */}
                    {runResult && (
                        <div>
                            <div style={{ fontSize: 11, fontWeight: 600, color: runResult.status === 'passed' ? 'var(--green)' : 'var(--red)', textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: 8 }}>
                                Run result
                            </div>
                            <div style={{
                                padding: '8px 10px', borderRadius: 7, marginBottom: 8,
                                background: runResult.status === 'passed' ? 'rgba(35,209,139,0.08)' : 'rgba(255,92,92,0.08)',
                                border: `1px solid ${runResult.status === 'passed' ? 'rgba(35,209,139,0.2)' : 'rgba(255,92,92,0.2)'}`,
                                display: 'flex', justifyContent: 'space-between', alignItems: 'center'
                            }}>
                                <span style={{ fontSize: 12, color: runResult.status === 'passed' ? 'var(--green)' : 'var(--red)', fontWeight: 500 }}>
                                    {runResult.status === 'passed' ? '✓ Passed' : `✗ ${runResult.failure_reason || 'Failed'}`}
                                </span>
                                <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                                    <span style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 13, fontWeight: 700, color: runResult.actual_status < 300 ? 'var(--green)' : 'var(--red)' }}>
                                        {runResult.actual_status}
                                    </span>
                                    <span style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>{runResult.response_time_ms}ms</span>
                                </div>
                            </div>
                            <pre style={{
                                fontFamily: 'JetBrains Mono, monospace', fontSize: 11, lineHeight: 1.6,
                                background: 'rgba(0,0,0,0.3)', borderRadius: 7, padding: '10px 12px',
                                color: 'var(--text-secondary)', margin: 0, maxHeight: 240, overflow: 'auto',
                                whiteSpace: 'pre-wrap', wordBreak: 'break-all',
                                border: `1px solid ${runResult.status === 'passed' ? 'rgba(35,209,139,0.12)' : 'rgba(255,92,92,0.12)'}`
                            }}>
                                {prettyJSON(runResult.actual_body) || 'No response body'}
                            </pre>
                        </div>
                    )}
                </div>

                {/* Error */}
                {error && (
                    <div style={{ padding: '8px 12px', background: 'var(--red-bg)', borderRadius: 7, fontSize: 12, color: 'var(--red)', border: '1px solid rgba(255,92,92,0.25)' }}>
                        ✗ {error}
                    </div>
                )}

                {/* Action buttons */}
                <div style={{ display: 'flex', gap: 8, paddingTop: 4, borderTop: '1px solid rgba(255,255,255,0.05)' }}>
                    <button onClick={handleRun} disabled={running} style={{
                        display: 'flex', alignItems: 'center', gap: 5, padding: '7px 14px', borderRadius: 7,
                        cursor: running ? 'not-allowed' : 'pointer', fontSize: 12, fontWeight: 500,
                        background: 'var(--accent)', color: '#fff', border: 'none', opacity: running ? 0.7 : 1
                    }}>
                        {running
                            ? <><div className="spinner" style={{ width: 12, height: 12 }} /> Running…</>
                            : <><Play size={12} fill="currentColor" /> Run step</>}
                    </button>

                    <button onClick={handleSave} disabled={saving || !step?.id} style={{
                        display: 'flex', alignItems: 'center', gap: 5, padding: '7px 14px', borderRadius: 7,
                        cursor: saving ? 'not-allowed' : 'pointer', fontSize: 12, fontWeight: 500,
                        background: saveSuccess ? 'var(--green-bg)' : 'var(--green-bg)',
                        color: saveSuccess ? 'var(--green)' : 'var(--green)',
                        border: `1px solid ${saveSuccess ? 'var(--green-border)' : 'rgba(35,209,139,0.3)'}`,
                        opacity: saving ? 0.7 : 1
                    }}>
                        {saving
                            ? <><div className="spinner" style={{ width: 12, height: 12 }} /> Saving…</>
                            : saveSuccess
                                ? <><Check size={12} /> Saved!</>
                                : <><Save size={12} /> Save to suite</>}
                    </button>

                    <div style={{ fontSize: 11, color: 'var(--text-tertiary)', display: 'flex', alignItems: 'center', gap: 4, marginLeft: 4 }}>
                        <Info size={11} />
                        Run step uses token from last suite run · Save updates DB permanently
                    </div>

                    <button onClick={onClose} style={{ marginLeft: 'auto', padding: '7px 12px', borderRadius: 7, cursor: 'pointer', fontSize: 12, background: 'rgba(255,255,255,0.05)', color: 'var(--text-tertiary)', border: '1px solid var(--border)' }}>
                        Cancel
                    </button>
                </div>
            </div>
        </div>
    );
}