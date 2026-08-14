import React, { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { useStore, api } from '../../store/index.js';
import {
    Play, Zap, ChevronDown, ChevronRight,
    CheckCircle2, XCircle, AlertTriangle, Clock,
    ArrowRight, Copy, Check, Trash2, RefreshCw,
    GitBranch, Plus, Wand2, PenLine
} from 'lucide-react';
import { StepEditPanel } from './StepEditPanel.jsx';
import { SuiteCreator } from './SuiteCreator.jsx';
import { AutoGenerateModal } from './AutoGenerateModal.jsx'; // Import the new modal component

function getStepGroup(result) {
    const name = result.step_name || '';
    const path = name.includes(' ') ? name.split(' ').slice(1).join(' ') : name;
    if (!path || path.startsWith('/auth') || path.startsWith('/public')) return null;
    const base = path.replace(/\/\{[^}]+\}.*$/, '');
    if (!base || base === '/') return null;
    return base;
}

function safeJSON(str) {
    if (!str) return null;
    if (typeof str === 'object') return str;
    try { return JSON.parse(str); } catch { return null; }
}

function CopyBtn({ text }) {
    const [copied, setCopied] = useState(false);
    return (
        <button onClick={e => { e.stopPropagation(); navigator.clipboard.writeText(text); setCopied(true); setTimeout(() => setCopied(false), 1500); }}
            style={{
                display: 'flex', alignItems: 'center', gap: 3, padding: '2px 7px', borderRadius: 4, fontSize: 10, cursor: 'pointer',
                background: copied ? 'var(--green-bg)' : 'rgba(255,255,255,0.06)',
                color: copied ? 'var(--green)' : 'var(--text-tertiary)',
                border: `1px solid ${copied ? 'var(--green-border)' : 'var(--border)'}`
            }}>
            {copied ? <Check size={9} /> : <Copy size={9} />} {copied ? 'Copied' : 'Copy'}
        </button>
    );
}

function buildCurl(url, method, headers, body) {
    const h = headers || {};
    const parts = [`curl -X ${method || 'GET'} '${url}'`];
    Object.entries(h).forEach(([k, v]) => parts.push(`  -H '${k}: ${v}'`));
    if (!h['Content-Type']) parts.push(`  -H 'Content-Type: application/json'`);
    if (body && ['POST', 'PUT', 'PATCH', 'DELETE'].includes(method))
        parts.push(`  -d '${JSON.stringify(body)}'`);
    return parts.join(' \\\n');
}

function CurlButton({ url, method, headers, body }) {
    const [copied, setCopied] = React.useState(false);
    const copy = (e) => {
        e.stopPropagation();
        navigator.clipboard.writeText(buildCurl(url, method, headers, body));
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    };
    return (
        <button onClick={copy} style={{
            fontSize: 9, padding: '3px 8px', borderRadius: 4, cursor: 'pointer', flexShrink: 0,
            background: copied ? 'rgba(35,209,139,0.1)' : 'rgba(255,255,255,0.05)',
            color: copied ? 'var(--green)' : 'var(--text-tertiary)',
            border: `1px solid ${copied ? 'rgba(35,209,139,0.3)' : 'var(--border)'}`,
            fontFamily: 'JetBrains Mono, monospace', transition: 'all .15s',
        }}>
            {copied ? '✓ Copied' : '⎘ cURL'}
        </button>
    );
}

function SubCheckCard({ check, baseUrl, method }) {
    const [open, setOpen] = React.useState(false);
    const icon = check.check_type === 'auth' ? '🔒'
        : check.check_type === 'validation' ? '⚠'
            : check.check_type === 'security' ? '🛡' : '🔁';
    const passed = check.status === 'passed';
    const color = passed ? 'var(--green)' : check.status === 'failed' ? 'var(--red)' : 'var(--amber)';
    const checkMethod = check.check_type === 'method' ? (method === 'GET' ? 'POST' : 'GET') : method;
    const checkHeaders = check.check_type === 'auth'
        ? { 'Content-Type': 'application/json' }
        : { 'Content-Type': 'application/json', 'Authorization': '{{token}}' };
    const checkBody = check.check_type === 'validation' ? {}
        : check.check_type === 'security' ? { "test": "'; DROP TABLE users; --" } : null;

    return (
        <div style={{
            borderRadius: 7,
            background: passed ? 'rgba(35,209,139,0.04)' : 'rgba(255,92,92,0.04)',
            border: `1px solid ${passed ? 'rgba(35,209,139,0.15)' : 'rgba(255,92,92,0.15)'}`,
            overflow: 'hidden',
        }}>
            <div onClick={() => setOpen(o => !o)} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '7px 10px', cursor: 'pointer' }}>
                <span style={{ fontSize: 12, flexShrink: 0 }}>{icon}</span>
                <span style={{ fontSize: 11, color, fontWeight: 500, flex: 1 }}>
                    {passed ? '✓' : '✗'} {check.label}
                </span>
                <span style={{ fontSize: 10, color: 'var(--text-tertiary)', fontFamily: 'JetBrains Mono, monospace', flexShrink: 0 }}>
                    {checkMethod} → <span style={{ color }}>{check.actual_status ?? 'error'}</span>
                    {' '}(exp: {Array.isArray(check.expected_status) ? check.expected_status.join('/') : check.expected_status})
                </span>
                <CurlButton url={baseUrl} method={checkMethod} headers={checkHeaders} body={checkBody} />
                <span style={{ color: 'var(--text-tertiary)', fontSize: 11, flexShrink: 0 }}>{open ? '▲' : '▼'}</span>
            </div>
            {open && (
                <div style={{ borderTop: `1px solid ${passed ? 'rgba(35,209,139,0.1)' : 'rgba(255,92,92,0.1)'}`, padding: '8px 10px', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                    <div>
                        <div style={{ fontSize: 9, fontWeight: 600, color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: 4 }}>Request</div>
                        <div style={{ background: 'rgba(0,0,0,0.3)', borderRadius: 5, padding: '6px 8px' }}>
                            <div style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 9, color: 'var(--text-secondary)', lineHeight: 1.6 }}>
                                <div><span style={{ color: 'var(--amber)' }}>Method:</span> {checkMethod}</div>
                                <div><span style={{ color: 'var(--amber)' }}>URL:</span> {baseUrl}</div>
                                {check.check_type === 'auth' && <div><span style={{ color: 'var(--red)' }}>Auth:</span> none (removed)</div>}
                                {check.check_type === 'validation' && <div><span style={{ color: 'var(--amber)' }}>Body:</span> {'{}'} (empty)</div>}
                                {check.check_type === 'security' && <div><span style={{ color: 'var(--red)' }}>Body:</span> SQL injection payload</div>}
                            </div>
                        </div>
                    </div>
                    <div>
                        <div style={{ fontSize: 9, fontWeight: 600, color: passed ? 'var(--green)' : 'var(--red)', textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: 4 }}>Response</div>
                        <div style={{ background: 'rgba(0,0,0,0.3)', borderRadius: 5, padding: '6px 8px', minHeight: 40 }}>
                            {check.actual_body ? (
                                <pre style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 9, color: 'var(--text-secondary)', margin: 0, maxHeight: 80, overflow: 'auto', whiteSpace: 'pre-wrap' }}>
                                    {JSON.stringify(check.actual_body, null, 2)}
                                </pre>
                            ) : (
                                <span style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 9, color: 'var(--text-tertiary)' }}>No response body</span>
                            )}
                        </div>
                    </div>
                    {check.failure_reason && !passed && (
                        <div style={{ gridColumn: '1/-1', fontSize: 10, color: 'var(--red)', padding: '4px 6px', background: 'rgba(255,92,92,0.06)', borderRadius: 4 }}>
                            ✗ {check.failure_reason}
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}

function StatusIcon({ status }) {
    if (status === 'passed') return <CheckCircle2 size={14} color="var(--green)" />;
    if (status === 'failed') return <XCircle size={14} color="var(--red)" />;
    if (status === 'skipped') return <AlertTriangle size={14} color="var(--amber)" />;
    return <Clock size={14} color="var(--text-tertiary)" />;
}

// ── Add Step Form ─────────────────────────────────────────────────────────────
function AddStepForm({ projectId, suiteId, onAdded, onCancel }) {
    const [endpoints, setEndpoints] = useState([]);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [generating, setGenerating] = useState(false);
    const [error, setError] = useState('');
    const [aiHint, setAiHint] = useState('');
    const [form, setForm] = useState({
        endpoint_id: '',
        method: 'GET',
        name: '',
        input_payload: '',
        input_params: '',
        expected_status: '200',
        extract_vars: '',
        skip_if_failed: true,
    });

    useEffect(() => {
        api.endpoints.list(projectId)
            .then(data => {
                const list = Array.isArray(data) ? data : (data?.endpoints || []);
                setEndpoints(list);
                if (list.length) {
                    const ep = list[0];
                    setForm(f => ({
                        ...f,
                        endpoint_id: ep.id,
                        method: ep.method || 'GET',
                        name: `${ep.method} ${ep.path}`,
                        expected_status: ep.method === 'POST' ? '201' : '200',
                    }));
                }
            })
            .catch(e => setError(e.message))
            .finally(() => setLoading(false));
    }, [projectId]);

    function handleEndpointChange(e) {
        const ep = endpoints.find(x => x.id === e.target.value);
        if (!ep) return;
        setForm(f => ({
            ...f,
            endpoint_id: ep.id,
            method: ep.method || 'GET',
            name: `${ep.method} ${ep.path}`,
            expected_status: ep.method === 'POST' ? '201' : '200',
        }));
    }

    // Auto-clear AI-generated fields when endpoint changes
    function handleEndpointChange(e) {
        const ep = endpoints.find(x => x.id === e.target.value);
        if (!ep) return;
        setAiHint('');
        setForm(f => ({
            ...f,
            endpoint_id: ep.id,
            method: ep.method || 'GET',
            name: `${ep.method} ${ep.path}`,
            expected_status: ep.method === 'POST' ? '201' : '200',
            input_payload: '',
            input_params: '',
            extract_vars: '',
        }));
    }

    async function handleAIGenerate() {
        const ep = endpoints.find(x => x.id === form.endpoint_id);
        if (!ep) return;
        setGenerating(true);
        setError('');
        setAiHint('');
        try {
            const result = await api.flows.generateStep(projectId, ep.id);
            if (result.input_params) setForm(f => ({ ...f, input_params: JSON.stringify(result.input_params, null, 2) }));
            if (result.input_payload || result.request_body) {
                const body = result.input_payload || result.request_body;
                setForm(f => ({ ...f, input_payload: JSON.stringify(body, null, 2) }));
            }
            if (result.expected_status) setForm(f => ({ ...f, expected_status: String(result.expected_status) }));
            if (result.name) setForm(f => ({ ...f, name: result.name }));
            if (result.extract_vars?.length) setForm(f => ({ ...f, extract_vars: JSON.stringify(result.extract_vars, null, 2) }));
            if (result.reasoning) setAiHint(result.reasoning);
        } catch (e) {
            setError(`AI generation failed: ${e.message}`);
        } finally {
            setGenerating(false);
        }
    }

    async function handleSave() {
        if (!form.endpoint_id) { setError('Select an endpoint'); return; }
        setSaving(true);
        setError('');
        try {
            // Parse JSON fields safely
            let input_payload = null;
            let input_params = null;
            let extract_vars = null;

            if (form.input_payload.trim()) {
                try { input_payload = JSON.parse(form.input_payload); }
                catch { setError('Request body is not valid JSON'); setSaving(false); return; }
            }
            if (form.input_params.trim()) {
                try { input_params = JSON.parse(form.input_params); }
                catch { setError('Path params is not valid JSON'); setSaving(false); return; }
            }
            if (form.extract_vars.trim()) {
                try { extract_vars = JSON.parse(form.extract_vars); }
                catch { setError('Extract vars is not valid JSON'); setSaving(false); return; }
            }

            await api.flows.addStep(projectId, suiteId, {
                endpoint_id: form.endpoint_id,
                method: form.method,
                name: form.name,
                input_payload,
                input_params,
                expected_status: parseInt(form.expected_status) || 200,
                extract_vars,
                skip_if_failed: form.skip_if_failed ? 1 : 0,
            });
            onAdded();
        } catch (e) {
            setError(e.message);
        } finally {
            setSaving(false);
        }
    }

    if (loading) return (
        <div style={{ padding: '20px', textAlign: 'center' }}>
            <div className="spinner" style={{ width: 20, height: 20, margin: '0 auto' }} />
        </div>
    );

    return (
        <div style={{
            margin: '0 18px 16px',
            padding: '16px',
            background: 'rgba(130,100,255,0.05)',
            border: '1px solid rgba(130,100,255,0.25)',
            borderRadius: 10,
        }}>
            {/* Header with AI button */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--accent)', display: 'flex', alignItems: 'center', gap: 6 }}>
                    <Plus size={14} /> Add New Step
                </div>
                <button
                    onClick={handleAIGenerate}
                    disabled={generating || !form.endpoint_id}
                    style={{
                        display: 'flex', alignItems: 'center', gap: 6,
                        padding: '6px 12px', borderRadius: 7, fontSize: 12,
                        cursor: generating || !form.endpoint_id ? 'not-allowed' : 'pointer',
                        background: generating ? 'rgba(130,100,255,0.1)' : 'linear-gradient(135deg, rgba(130,100,255,0.2), rgba(92,168,255,0.2))',
                        color: 'var(--accent)', border: '1px solid rgba(130,100,255,0.35)',
                        opacity: !form.endpoint_id ? 0.5 : 1, transition: 'all .15s',
                    }}
                >
                    {generating
                        ? <><div className="spinner" style={{ width: 11, height: 11 }} /> Generating…</>
                        : <>✨ AI Fill Fields</>}
                </button>
            </div>

            {error && (
                <div style={{ padding: '8px 10px', background: 'var(--red-bg)', border: '1px solid rgba(255,92,92,0.25)', borderRadius: 6, fontSize: 12, color: 'var(--red)', marginBottom: 12 }}>
                    {error}
                </div>
            )}

            {/* AI reasoning hint */}
            {aiHint && (
                <div style={{ padding: '8px 10px', background: 'rgba(130,100,255,0.08)', border: '1px solid rgba(130,100,255,0.2)', borderRadius: 6, fontSize: 11, color: 'var(--accent)', marginBottom: 12, display: 'flex', alignItems: 'flex-start', gap: 6 }}>
                    <span style={{ flexShrink: 0 }}>✨</span> <span>{aiHint}</span>
                </div>
            )}

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                {/* Endpoint selector */}
                <div style={{ gridColumn: '1/-1' }}>
                    <label style={{ fontSize: 11, color: 'var(--text-tertiary)', display: 'block', marginBottom: 4 }}>Endpoint</label>
                    <select
                        value={form.endpoint_id}
                        onChange={handleEndpointChange}
                        style={{ width: '100%', padding: '7px 10px', borderRadius: 6, background: 'var(--bg-card)', border: '1px solid var(--border)', color: 'var(--text-primary)', fontSize: 12 }}
                    >
                        {endpoints.map(ep => (
                            <option key={ep.id} value={ep.id}>{ep.method} {ep.path}</option>
                        ))}
                    </select>
                </div>

                {/* Step name */}
                <div style={{ gridColumn: '1/-1' }}>
                    <label style={{ fontSize: 11, color: 'var(--text-tertiary)', display: 'block', marginBottom: 4 }}>
                        Step name
                        {generating && <span style={{ marginLeft: 6, fontSize: 10, color: 'var(--accent)' }}>✨ filling…</span>}
                    </label>
                    <input
                        type="text"
                        value={form.name}
                        onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                        placeholder="e.g. Convert JSON to CSV"
                        style={{ width: '100%', padding: '7px 10px', borderRadius: 6, background: generating ? 'rgba(130,100,255,0.05)' : 'var(--bg-card)', border: `1px solid ${generating ? 'rgba(130,100,255,0.3)' : 'var(--border)'}`, color: 'var(--text-primary)', fontSize: 12, transition: 'all .2s' }}
                    />
                </div>

                {/* Path params */}
                <div>
                    <label style={{ fontSize: 11, color: 'var(--text-tertiary)', display: 'block', marginBottom: 4 }}>
                        Path params <span style={{ color: 'var(--text-tertiary)', fontWeight: 400 }}>(JSON)</span>
                    </label>
                    <textarea
                        value={form.input_params}
                        onChange={e => setForm(f => ({ ...f, input_params: e.target.value }))}
                        placeholder={'{\n  "from": "json",\n  "to": "csv"\n}'}
                        rows={4}
                        style={{ width: '100%', padding: '7px 10px', borderRadius: 6, background: 'var(--bg-card)', border: '1px solid var(--border)', color: 'var(--text-primary)', fontSize: 11, fontFamily: 'JetBrains Mono, monospace', resize: 'vertical' }}
                    />
                </div>

                {/* Request body */}
                <div>
                    <label style={{ fontSize: 11, color: 'var(--text-tertiary)', display: 'block', marginBottom: 4 }}>
                        Request body <span style={{ color: 'var(--text-tertiary)', fontWeight: 400 }}>(JSON)</span>
                    </label>
                    <textarea
                        value={form.input_payload}
                        onChange={e => setForm(f => ({ ...f, input_payload: e.target.value }))}
                        placeholder={'{\n  "input": "id,name\\n1,Ada"\n}'}
                        rows={4}
                        style={{ width: '100%', padding: '7px 10px', borderRadius: 6, background: 'var(--bg-card)', border: '1px solid var(--border)', color: 'var(--text-primary)', fontSize: 11, fontFamily: 'JetBrains Mono, monospace', resize: 'vertical' }}
                    />
                </div>

                {/* Expected status */}
                <div>
                    <label style={{ fontSize: 11, color: 'var(--text-tertiary)', display: 'block', marginBottom: 4 }}>Expected status</label>
                    <input
                        type="number"
                        value={form.expected_status}
                        onChange={e => setForm(f => ({ ...f, expected_status: e.target.value }))}
                        style={{ width: '100%', padding: '7px 10px', borderRadius: 6, background: 'var(--bg-card)', border: '1px solid var(--border)', color: 'var(--text-primary)', fontSize: 12 }}
                    />
                </div>

                {/* Extract vars */}
                <div>
                    <label style={{ fontSize: 11, color: 'var(--text-tertiary)', display: 'block', marginBottom: 4 }}>
                        Extract vars <span style={{ color: 'var(--text-tertiary)', fontWeight: 400 }}>(JSON array, optional)</span>
                    </label>
                    <textarea
                        value={form.extract_vars}
                        onChange={e => setForm(f => ({ ...f, extract_vars: e.target.value }))}
                        placeholder={'[\n  {"var": "token", "path": "data.token"}\n]'}
                        rows={3}
                        style={{ width: '100%', padding: '7px 10px', borderRadius: 6, background: 'var(--bg-card)', border: '1px solid var(--border)', color: 'var(--text-primary)', fontSize: 11, fontFamily: 'JetBrains Mono, monospace', resize: 'vertical' }}
                    />
                </div>

                {/* Skip if failed */}
                <div style={{ gridColumn: '1/-1', display: 'flex', alignItems: 'center', gap: 8 }}>
                    <input
                        type="checkbox"
                        id="skip_if_failed"
                        checked={form.skip_if_failed}
                        onChange={e => setForm(f => ({ ...f, skip_if_failed: e.target.checked }))}
                        style={{ width: 14, height: 14, cursor: 'pointer' }}
                    />
                    <label htmlFor="skip_if_failed" style={{ fontSize: 12, color: 'var(--text-secondary)', cursor: 'pointer' }}>
                        Skip following steps if this step fails
                    </label>
                </div>
            </div>

            {/* Actions */}
            <div style={{ display: 'flex', gap: 8, marginTop: 14, justifyContent: 'flex-end' }}>
                <button
                    onClick={onCancel}
                    style={{ padding: '7px 16px', borderRadius: 6, fontSize: 12, cursor: 'pointer', background: 'transparent', color: 'var(--text-secondary)', border: '1px solid var(--border)' }}
                >
                    Cancel
                </button>
                <button
                    onClick={handleSave}
                    disabled={saving}
                    style={{ padding: '7px 16px', borderRadius: 6, fontSize: 12, cursor: saving ? 'not-allowed' : 'pointer', background: 'var(--accent)', color: '#fff', border: 'none', opacity: saving ? 0.6 : 1, display: 'flex', alignItems: 'center', gap: 6 }}
                >
                    {saving ? <><div className="spinner" style={{ width: 12, height: 12 }} /> Saving…</> : <><Plus size={12} /> Add Step</>}
                </button>
            </div>
        </div>
    );
}

function StepResult({ result, projectId, suiteId, stepDef, context, onStepSaved, isFirst, isLast, onMoveUp, onMoveDown, onDeleteStep, loadSteps, lastRun, setLastRun, steps }) {
    const [expanded, setExpanded] = useState(false);
    const [editing, setEditing] = useState(false);
    const body = safeJSON(result.actual_body);
    const reqBody = safeJSON(result.request_body);
    const reqHeaders = safeJSON(result.request_headers);
    const extracted = safeJSON(result.extracted_vars);
    const subChecks = safeJSON(result.sub_checks) || [];
    const swaggerExample = stepDef?.request_body
        ? (() => { try { return JSON.parse(stepDef.request_body)?._example || null; } catch { return null; } })()
        : null;

    return (
        <>
            <tr onClick={() => setExpanded(e => !e)} style={{ cursor: 'pointer' }}
                onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,0.02)'}
                onMouseLeave={e => e.currentTarget.style.background = ''}>
                <td style={{ width: 30, paddingLeft: 12 }}>
                    {expanded ? <ChevronDown size={13} color="var(--accent)" /> : <ChevronRight size={13} color="var(--text-tertiary)" />}
                </td>
                <td style={{ width: 28 }}>
                    <div style={{ width: 22, height: 22, borderRadius: '50%', background: 'var(--accent-dim)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, fontWeight: 700, color: 'var(--accent)' }}>
                        {result.step_order}
                    </div>
                </td>
                <td style={{ width: 22 }}><StatusIcon status={result.status} /></td>
                <td style={{ fontSize: 13 }}>{result.step_name}</td>
                <td>{result.request_method && <span className={`method-badge method-${result.request_method}`}>{result.request_method}</span>}</td>
                <td style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 11, color: 'var(--text-secondary)' }}>
                    {result.request_url ? result.request_url.replace(/^https?:\/\/[^/]+/, '') : '—'}
                </td>
                <td style={{
                    fontFamily: 'JetBrains Mono, monospace', fontSize: 11, fontWeight: 600,
                    color: !result.actual_status ? 'var(--text-tertiary)' : result.actual_status < 300 ? 'var(--green)' : result.actual_status < 400 ? 'var(--amber)' : 'var(--red)'
                }}>
                    {result.status === 'skipped' ? 'skipped' : (result.actual_status || '—')}
                </td>
                <td style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>
                    {result.response_time_ms ? `${result.response_time_ms}ms` : '—'}
                </td>
                <td onClick={e => e.stopPropagation()} style={{ whiteSpace: 'nowrap' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                        <button onClick={onMoveUp} disabled={isFirst} title="Move up"
                            style={{ fontSize: 10, padding: '2px 6px', borderRadius: 4, cursor: isFirst ? 'not-allowed' : 'pointer', background: 'rgba(255,255,255,0.04)', color: isFirst ? 'var(--border)' : 'var(--text-tertiary)', border: '1px solid var(--border)' }}>
                            ↑
                        </button>
                        <button onClick={onMoveDown} disabled={isLast} title="Move down"
                            style={{ fontSize: 10, padding: '2px 6px', borderRadius: 4, cursor: isLast ? 'not-allowed' : 'pointer', background: 'rgba(255,255,255,0.04)', color: isLast ? 'var(--border)' : 'var(--text-tertiary)', border: '1px solid var(--border)' }}>
                            ↓
                        </button>
                        <button onClick={() => { setEditing(e => !e); setExpanded(true); }}
                            style={{ fontSize: 10, padding: '3px 8px', borderRadius: 4, cursor: 'pointer', background: editing ? 'var(--accent-dim)' : 'rgba(255,255,255,0.05)', color: editing ? 'var(--accent)' : 'var(--text-tertiary)', border: `1px solid ${editing ? 'rgba(130,100,255,0.3)' : 'var(--border)'}` }}>
                            {editing ? '✕' : '✎'}
                        </button>
                        <button onClick={onDeleteStep} title="Delete step"
                            style={{ fontSize: 10, padding: '3px 6px', borderRadius: 4, cursor: 'pointer', background: 'var(--red-bg)', color: 'var(--red)', border: '1px solid rgba(255,92,92,0.25)' }}>
                            ✕
                        </button>
                    </div>
                </td>
            </tr>

            {editing && (
                <tr>
                    <td colSpan={9} style={{ padding: 0 }}>
                        <StepEditPanel
                            step={stepDef || {
                                id: result.step_id,
                                name: result.step_name,
                                method: result.request_method,
                                endpoint_path: result.request_url?.replace(/^https?:\/\/[^/]+/, ''),
                                input_payload: result.request_body ? JSON.stringify(result.request_body) : null,
                                extract_vars: null,
                                expected_status: null,
                            }}
                            result={result}
                            context={context}
                            projectId={projectId}
                            suiteId={suiteId}
                            swaggerExample={swaggerExample}
                            onClose={() => setEditing(false)}
                            onSaved={async () => {
                                setEditing(false);
                                await loadSteps();
                                const savedStep = steps?.find(s => s.id === result.step_id);
                                if (savedStep && lastRun) {
                                    setLastRun(prev => ({
                                        ...prev,
                                        results: (prev?.results || []).map(r2 =>
                                            r2.step_id === result.step_id
                                                ? { ...r2, request_body: savedStep.input_payload ? JSON.parse(savedStep.input_payload) : r2.request_body }
                                                : r2
                                        )
                                    }));
                                }
                                onStepSaved?.();
                            }}
                            onRunResult={res => {
                                if (res && lastRun) {
                                    setLastRun(prev => ({
                                        ...prev,
                                        results: (prev?.results || []).map(r2 =>
                                            r2.step_id === result.step_id ? { ...r2, ...res, step_id: r2.step_id, step_order: r2.step_order, step_name: r2.step_name } : r2
                                        )
                                    }));
                                }
                            }}
                        />
                    </td>
                </tr>
            )}

            {expanded && (
                <tr>
                    <td colSpan={8} style={{ padding: 0, background: 'rgba(0,0,0,0.2)' }}>
                        <div style={{ padding: '12px 16px', borderTop: '1px solid rgba(255,255,255,0.05)' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10, flexWrap: 'wrap' }}>
                                {result.request_method && (
                                    <span className={`method-badge method-${result.request_method}`} style={{ fontSize: 9 }}>{result.request_method}</span>
                                )}
                                <code style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 10, color: 'var(--blue)', flex: 1, wordBreak: 'break-all' }}>
                                    {result.request_url || '—'}
                                </code>
                                {result.actual_status && (
                                    <span style={{
                                        fontFamily: 'JetBrains Mono, monospace', fontSize: 13, fontWeight: 700, flexShrink: 0, padding: '2px 10px', borderRadius: 6,
                                        background: result.actual_status < 300 ? 'var(--green-bg)' : 'var(--red-bg)',
                                        color: result.actual_status < 300 ? 'var(--green)' : 'var(--red)',
                                        border: `1px solid ${result.actual_status < 300 ? 'rgba(35,209,139,0.25)' : 'rgba(255,92,92,0.25)'}`
                                    }}>{result.actual_status}</span>
                                )}
                                <span style={{ fontSize: 11, fontWeight: 600, flexShrink: 0, color: result.status === 'passed' ? 'var(--green)' : result.status === 'skipped' ? 'var(--amber)' : 'var(--red)' }}>
                                    {result.status === 'passed' ? '✓ Passed' : result.status === 'skipped' ? '⊘ Skipped' : `✗ ${result.failure_reason || 'Failed'}`}
                                </span>
                                {result.response_time_ms && (
                                    <span style={{ fontSize: 10, color: 'var(--text-tertiary)', flexShrink: 0 }}>{result.response_time_ms}ms</span>
                                )}
                                {result.request_url && (
                                    <CurlButton url={result.request_url} method={result.request_method} headers={reqHeaders} body={reqBody} />
                                )}
                            </div>

                            {result.status === 'skipped' ? (
                                <div style={{ padding: '8px 12px', background: 'var(--amber-bg)', borderRadius: 6, fontSize: 11, color: 'var(--amber)', border: '1px solid rgba(255,181,71,0.2)' }}>
                                    ⊘ {result.failure_reason || 'Skipped'}
                                </div>
                            ) : (
                                <div style={{ display: 'grid', gridTemplateColumns: '280px 1fr', gap: 12 }}>
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                                        <div style={{ fontSize: 9, fontWeight: 600, color: 'var(--accent)', textTransform: 'uppercase', letterSpacing: '.06em' }}>Request</div>
                                        {reqHeaders && (
                                            <div style={{ background: 'rgba(0,0,0,0.25)', borderRadius: 5, padding: '5px 8px' }}>
                                                <div style={{ fontSize: 9, color: 'var(--text-tertiary)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '.05em', marginBottom: 3 }}>Headers</div>
                                                {reqHeaders['Authorization'] ? (
                                                    <div style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 9, color: 'var(--text-secondary)', wordBreak: 'break-all', lineHeight: 1.4 }}>
                                                        Authorization: Bearer {String(reqHeaders['Authorization']).replace('Bearer ', '').slice(0, 20)}…
                                                    </div>
                                                ) : (
                                                    <div style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 9, color: 'var(--text-tertiary)' }}>Content-Type: application/json</div>
                                                )}
                                            </div>
                                        )}
                                        {reqBody ? (
                                            <div style={{ background: 'rgba(0,0,0,0.25)', borderRadius: 5, padding: '5px 8px' }}>
                                                <div style={{ fontSize: 9, color: 'var(--amber)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '.05em', marginBottom: 3 }}>Body</div>
                                                <pre style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 9, color: 'var(--text-secondary)', margin: 0, maxHeight: 80, overflow: 'auto', whiteSpace: 'pre-wrap', lineHeight: 1.5 }}>
                                                    {JSON.stringify(reqBody, null, 2)}
                                                </pre>
                                            </div>
                                        ) : (
                                            <div style={{ padding: '5px 8px', background: 'rgba(255,92,92,0.06)', borderRadius: 5, border: '1px solid rgba(255,92,92,0.15)', fontSize: 9, color: 'var(--red)' }}>
                                                ⚠ No body sent
                                            </div>
                                        )}
                                        {extracted && Object.entries(extracted).filter(([k]) => !k.startsWith('__')).length > 0 && (
                                            <div style={{ background: 'var(--accent-dim)', borderRadius: 5, padding: '5px 8px', borderLeft: '2px solid var(--accent)' }}>
                                                <div style={{ fontSize: 9, color: 'var(--accent)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '.05em', marginBottom: 3 }}>Extracted</div>
                                                {Object.entries(extracted).filter(([k]) => !k.startsWith('__')).map(([k, v]) => (
                                                    <div key={k} style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 9, color: 'var(--text-secondary)', lineHeight: 1.5 }}>
                                                        <span style={{ color: 'var(--accent)' }}>{'{{' + k + '}}'}</span> = {String(v).slice(0, 30)}{String(v).length > 30 ? '…' : ''}
                                                    </div>
                                                ))}
                                            </div>
                                        )}
                                    </div>
                                    <div>
                                        <div style={{ fontSize: 9, fontWeight: 600, color: result.status === 'passed' ? 'var(--green)' : 'var(--red)', textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: 6 }}>Response body</div>
                                        {body ? (
                                            <pre style={{
                                                fontFamily: 'JetBrains Mono, monospace', fontSize: 11, lineHeight: 1.7,
                                                background: 'rgba(0,0,0,0.3)', borderRadius: 6, padding: '10px 12px',
                                                color: 'var(--text-secondary)', margin: 0,
                                                maxHeight: 200, overflow: 'auto', whiteSpace: 'pre-wrap', wordBreak: 'break-all',
                                                border: `1px solid ${result.status === 'passed' ? 'rgba(35,209,139,0.15)' : 'rgba(255,92,92,0.15)'}`
                                            }}>
                                                {JSON.stringify(body, null, 2)}
                                            </pre>
                                        ) : (
                                            <div style={{ padding: '10px 12px', background: 'rgba(0,0,0,0.2)', borderRadius: 6, fontSize: 11, color: 'var(--text-tertiary)', fontStyle: 'italic', border: '1px solid var(--border)' }}>
                                                No response body
                                            </div>
                                        )}
                                    </div>
                                </div>
                            )}

                            {subChecks.length > 0 && (
                                <div style={{ marginTop: 10, borderTop: '1px solid rgba(255,255,255,0.05)', paddingTop: 10 }}>
                                    <div style={{ fontSize: 10, fontWeight: 600, color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: 6 }}>
                                        Security & Validation checks — {subChecks.filter(c => c.status === 'passed').length}/{subChecks.length} passed
                                    </div>
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                                        {subChecks.map((c, i) => (
                                            <SubCheckCard key={i} check={c} baseUrl={result.request_url} method={result.request_method} />
                                        ))}
                                    </div>
                                </div>
                            )}
                        </div>
                    </td>
                </tr>
            )}
        </>
    );
}

// ── Steps list (shown even before first run) ──────────────────────────────────
function StepsList({ steps, suiteId, projectId, onAddedStep }) {
    const [showAddForm, setShowAddForm] = useState(false);
    const { addToast } = useStore();

    if (!steps?.length && !showAddForm) return (
        <div style={{ padding: '20px 18px' }}>
            <div style={{ textAlign: 'center', color: 'var(--text-tertiary)', fontSize: 12, marginBottom: 14 }}>
                No steps yet — add your first step below
            </div>
            <button
                onClick={() => setShowAddForm(true)}
                style={{ display: 'flex', alignItems: 'center', gap: 6, margin: '0 auto', padding: '8px 16px', borderRadius: 7, fontSize: 12, cursor: 'pointer', background: 'var(--accent)', color: '#fff', border: 'none' }}
            >
                <Plus size={13} /> Add Step
            </button>
        </div>
    );

    return (
        <div>
            {/* Steps table */}
            {steps?.length > 0 && (
                <table className="table">
                    <thead>
                        <tr>
                            <th style={{ width: 28 }}>#</th>
                            <th style={{ width: 70 }}>Method</th>
                            <th>Path</th>
                            <th style={{ width: 80 }}>Expects</th>
                            <th style={{ width: 100 }} />
                        </tr>
                    </thead>
                    <tbody>
                        {steps.map((step, i) => (
                            <tr key={step.id}>
                                <td>
                                    <div style={{ width: 22, height: 22, borderRadius: '50%', background: 'var(--accent-dim)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, fontWeight: 700, color: 'var(--accent)' }}>
                                        {step.step_order || i + 1}
                                    </div>
                                </td>
                                <td>
                                    <span className={`method-badge method-${step.method}`}>{step.method}</span>
                                </td>
                                <td style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 11, color: 'var(--text-secondary)' }}>
                                    {step.endpoint_path || step.name}
                                </td>
                                <td style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 11, color: 'var(--text-tertiary)' }}>
                                    {step.expected_status || '—'}
                                </td>
                                <td>
                                    <button
                                        onClick={async () => {
                                            if (!window.confirm(`Delete step "${step.name}"?`)) return;
                                            try {
                                                await api.flows.deleteStep(projectId, suiteId, step.id);
                                                addToast('Step deleted', 'success');
                                                onAddedStep();
                                            } catch (e) { addToast(e.message, 'error'); }
                                        }}
                                        style={{ fontSize: 10, padding: '3px 6px', borderRadius: 4, cursor: 'pointer', background: 'var(--red-bg)', color: 'var(--red)', border: '1px solid rgba(255,92,92,0.25)' }}
                                    >
                                        ✕
                                    </button>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            )}

            {/* Add step form or button */}
            {showAddForm ? (
                <AddStepForm
                    projectId={projectId}
                    suiteId={suiteId}
                    onAdded={() => { setShowAddForm(false); onAddedStep(); addToast('✓ Step added', 'success'); }}
                    onCancel={() => setShowAddForm(false)}
                />
            ) : (
                <div style={{ padding: '10px 18px 14px' }}>
                    <button
                        onClick={() => setShowAddForm(true)}
                        style={{
                            display: 'flex', alignItems: 'center', gap: 6,
                            padding: '7px 14px', borderRadius: 7, fontSize: 12,
                            cursor: 'pointer', width: '100%', justifyContent: 'center',
                            background: 'rgba(130,100,255,0.06)',
                            color: 'var(--accent)',
                            border: '1px dashed rgba(130,100,255,0.35)',
                            transition: 'all .15s',
                        }}
                        onMouseEnter={e => e.currentTarget.style.background = 'rgba(130,100,255,0.12)'}
                        onMouseLeave={e => e.currentTarget.style.background = 'rgba(130,100,255,0.06)'}
                    >
                        <Plus size={13} /> Add Step
                    </button>
                </div>
            )}
        </div>
    );
}

function SuiteCard({ suite, projectId, onDelete }) {
    const [running, setRunning] = useState(false);
    const [lastRun, setLastRun] = useState(null);
    const [expanded, setExpanded] = useState(false);
    const [steps, setSteps] = useState(null);
    const [loadingSteps, setLoadingSteps] = useState(false);
    // 'steps' tab shows steps list (always), 'results' shows last run results
    const [activeTab, setActiveTab] = useState('steps');
    const { addToast } = useStore();

    useEffect(() => {
        loadLastRun();
        loadSteps();
    }, [suite.id]);

    async function loadSteps() {
        setLoadingSteps(true);
        try {
            const data = await api.flows.get(projectId, suite.id);
            setSteps(data.steps || []);
        } catch (err) { addToast(err.message, 'error'); }
        finally { setLoadingSteps(false); }
    }

    async function loadLastRun() {
        try {
            const runs = await api.flows.listRuns(projectId, suite.id);
            if (!runs?.length) return;
            const detail = await api.flows.getRun(projectId, suite.id, runs[0].id);
            if (detail) {
                setLastRun({
                    summary: {
                        total: detail.run.total_steps,
                        passed: detail.run.passed,
                        failed: detail.run.failed,
                        pass_rate: detail.run.total_steps
                            ? Math.round((detail.run.passed / detail.run.total_steps) * 100)
                            : 0
                    },
                    context: safeJSON(detail.run.context) || {},
                    results: (detail.stepResults || []).map(r => ({
                        ...r,
                        actual_body: safeJSON(r.actual_body),
                        actual_headers: safeJSON(r.actual_headers),
                        request_body: safeJSON(r.request_body),
                        request_headers: safeJSON(r.request_headers),
                        extracted_vars: safeJSON(r.extracted_vars),
                        sub_checks: safeJSON(r.sub_checks) || [],
                    }))
                });
                if (detail.run.total_steps > 0) setActiveTab('results');
            }
        } catch { /* no previous runs */ }
    }

    async function handleExpand() {
        const next = !expanded;
        setExpanded(next);
        if (next && !steps) loadSteps();
        if (next && !lastRun) loadLastRun();
    }

    const [skipStepIds, setSkipStepIds] = useState(new Set());
    const [showSkipPanel, setShowSkipPanel] = useState(false);

    function toggleSkip(stepId) {
        setSkipStepIds(prev => {
            const next = new Set(prev);
            next.has(stepId) ? next.delete(stepId) : next.add(stepId);
            return next;
        });
    }

    async function handleRun(e) {
        e.stopPropagation();
        setRunning(true);
        setExpanded(true);
        setActiveTab('results');
        setShowSkipPanel(false);
        setLastRun(null);
        if (!steps) await loadSteps();
        try {
            const response = await api.flows.run(projectId, suite.id, { skip_step_ids: [...skipStepIds] });
            if (response.status === 'queued' && response.run_id) {
                addToast('Suite queued — running steps…', 'info');
                await pollForResults(response.run_id);
                return;
            }
            setLastRun(response);
            const { passed, failed, total } = response.summary;
            addToast(`Suite: ${passed}/${total} passed`, failed > 0 ? 'error' : 'success');
        } catch (err) {
            addToast(err.message, 'error');
        } finally {
            setRunning(false);
        }
    }

    async function pollForResults(runId) {
        const MAX_POLLS = 120;
        const INTERVAL = 2000;
        for (let i = 0; i < MAX_POLLS; i++) {
            await new Promise(r => setTimeout(r, INTERVAL));
            try {
                const detail = await api.flows.getRun(projectId, suite.id, runId);
                if (!detail) continue;
                const run = detail.run || detail;
                const status = run.status;
                if (detail.stepResults?.length) {
                    setLastRun({
                        summary: { total: run.total_steps, passed: run.passed || 0, failed: run.failed || 0, pass_rate: run.total_steps ? Math.round(((run.passed || 0) / run.total_steps) * 100) : 0 },
                        context: safeJSON(run.context) || {},
                        results: (detail.stepResults || []).map(r => ({
                            ...r,
                            actual_body: safeJSON(r.actual_body),
                            actual_headers: safeJSON(r.actual_headers),
                            request_body: safeJSON(r.request_body),
                            request_headers: safeJSON(r.request_headers),
                            extracted_vars: safeJSON(r.extracted_vars),
                            sub_checks: safeJSON(r.sub_checks) || [],
                        }))
                    });
                }
                if (status === 'done' || status === 'failed') {
                    addToast(`Suite: ${run.passed || 0}/${run.total_steps || 0} passed`, status === 'done' ? 'success' : 'error');
                    setRunning(false);
                    return;
                }
            } catch { /* keep polling */ }
        }
        addToast('Suite run timed out — check results', 'error');
        setRunning(false);
    }

    const passRate = lastRun?.summary?.pass_rate ?? 0;

    return (
        <div className="card" style={{ marginBottom: 12, overflow: 'hidden' }}>
            {/* Suite header */}
            <div onClick={handleExpand} style={{ padding: '16px 18px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 12 }}>
                <div style={{ width: 36, height: 36, borderRadius: 10, background: 'var(--accent-dim)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                    <GitBranch size={16} color="var(--accent)" />
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 14, fontWeight: 600 }}>{suite.name}</div>
                    <div style={{ fontSize: 11, color: 'var(--text-tertiary)', marginTop: 2 }}>{suite.description}</div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
                    {lastRun && (
                        <div style={{ textAlign: 'right' }}>
                            <div style={{ fontSize: 20, fontWeight: 700, color: passRate === 100 ? 'var(--green)' : passRate > 50 ? 'var(--amber)' : 'var(--red)' }}>
                                {passRate}%
                            </div>
                            <div style={{ fontSize: 10, color: 'var(--text-tertiary)' }}>{lastRun.summary.passed}/{lastRun.summary.total} passed · last run</div>
                        </div>
                    )}
                    <button onClick={handleRun} disabled={running} className="btn btn-primary"
                        style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 12 }}>
                        {running
                            ? <><div className="spinner" style={{ width: 12, height: 12 }} /> {lastRun ? 'Running…' : 'Queued…'}</>
                            : <><Play size={11} fill="currentColor" /> Run</>}
                    </button>
                    {/* ── NEW: Add Step button ── */}
                    <button
                        onClick={e => { e.stopPropagation(); setExpanded(true); setActiveTab('steps'); }}
                        title="Add step to this suite"
                        style={{
                            display: 'flex', alignItems: 'center', gap: 5,
                            padding: '6px 10px', borderRadius: 6, fontSize: 11,
                            cursor: 'pointer', whiteSpace: 'nowrap',
                            background: 'rgba(130,100,255,0.08)',
                            color: 'var(--accent)',
                            border: '1px solid rgba(130,100,255,0.25)',
                        }}
                    >
                        <Plus size={12} /> Add Step
                    </button>
                    {lastRun?.results?.length > 0 && (
                        <button onClick={e => { e.stopPropagation(); setShowSkipPanel(s => !s); if (!steps) loadSteps(); }}
                            style={{
                                display: 'flex', alignItems: 'center', gap: 5, padding: '6px 10px',
                                borderRadius: 6, fontSize: 11, cursor: 'pointer', whiteSpace: 'nowrap',
                                background: skipStepIds.size > 0 ? 'var(--amber-bg)' : 'var(--bg-card)',
                                color: skipStepIds.size > 0 ? 'var(--amber)' : 'var(--text-secondary)',
                                border: `1px solid ${skipStepIds.size > 0 ? 'rgba(255,181,71,0.3)' : 'var(--border)'}`,
                            }}>
                            {skipStepIds.size > 0 ? `⊘ ${skipStepIds.size} skipped` : '⊘ Skip steps'}
                        </button>
                    )}
                    <button onClick={e => { e.stopPropagation(); onDelete(suite.id); }}
                        style={{ padding: '6px 8px', background: 'var(--red-bg)', color: 'var(--red)', border: '1px solid rgba(255,92,92,0.25)', borderRadius: 6, cursor: 'pointer', display: 'flex', alignItems: 'center' }}>
                        <Trash2 size={12} />
                    </button>
                    {expanded ? <ChevronDown size={14} color="var(--text-tertiary)" /> : <ChevronRight size={14} color="var(--text-tertiary)" />}
                </div>
            </div>

            {/* Skip panel */}
            {showSkipPanel && (
                <div onClick={e => e.stopPropagation()} style={{ borderTop: '1px solid var(--border)', padding: '14px 18px', background: 'rgba(255,181,71,0.04)' }}>
                    <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--amber)', marginBottom: 10, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                        <span>⊘ Select steps to skip in next run</span>
                        <div style={{ display: 'flex', gap: 8 }}>
                            <button onClick={() => {
                                const failedIds = new Set((lastRun?.results || []).filter(r => r.status === 'failed' || r.status === 'error').map(r => r.step_id).filter(Boolean));
                                setSkipStepIds(failedIds);
                            }} style={{ fontSize: 10, padding: '3px 8px', borderRadius: 4, cursor: 'pointer', background: 'var(--red-bg)', color: 'var(--red)', border: '1px solid rgba(255,92,92,0.25)' }}>
                                Select all failed
                            </button>
                            <button onClick={() => setSkipStepIds(new Set())}
                                style={{ fontSize: 10, padding: '3px 8px', borderRadius: 4, cursor: 'pointer', background: 'rgba(255,255,255,0.05)', color: 'var(--text-tertiary)', border: '1px solid var(--border)' }}>
                                Clear all
                            </button>
                        </div>
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                        {(steps || lastRun?.results || []).map((step, i) => {
                            const stepId = step.step_id || step.id;
                            const stepName = step.step_name || step.name;
                            const order = step.step_order || (i + 1);
                            const lastResult = lastRun?.results?.find(r => r.step_id === stepId || r.step_order === order);
                            const status = lastResult?.status;
                            const isChecked = skipStepIds.has(stepId);
                            return (
                                <div key={stepId || i} onClick={() => stepId && toggleSkip(stepId)} style={{
                                    display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px', borderRadius: 7, cursor: 'pointer',
                                    background: isChecked ? 'rgba(255,181,71,0.08)' : 'rgba(255,255,255,0.02)',
                                    border: `1px solid ${isChecked ? 'rgba(255,181,71,0.3)' : 'var(--border)'}`,
                                }}>
                                    <div style={{ width: 16, height: 16, borderRadius: 4, flexShrink: 0, border: `2px solid ${isChecked ? 'var(--amber)' : 'var(--border)'}`, background: isChecked ? 'var(--amber)' : 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                        {isChecked && <span style={{ fontSize: 9, color: '#000', fontWeight: 800 }}>✓</span>}
                                    </div>
                                    <div style={{ width: 22, height: 22, borderRadius: '50%', background: 'var(--accent-dim)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, fontWeight: 700, color: 'var(--accent)', flexShrink: 0 }}>{order}</div>
                                    <div style={{ flex: 1, fontSize: 12 }}>{stepName}</div>
                                    {status && (
                                        <span style={{ fontSize: 10, fontWeight: 600, padding: '2px 8px', borderRadius: 10, background: status === 'passed' ? 'var(--green-bg)' : status === 'failed' ? 'var(--red-bg)' : 'var(--amber-bg)', color: status === 'passed' ? 'var(--green)' : status === 'failed' ? 'var(--red)' : 'var(--amber)' }}>
                                            {status === 'passed' ? '✓ Passed' : status === 'failed' ? '✗ Failed' : '— Skipped'}
                                        </span>
                                    )}
                                    {isChecked && <span style={{ fontSize: 10, color: 'var(--amber)', fontStyle: 'italic', flexShrink: 0 }}>will skip</span>}
                                </div>
                            );
                        })}
                    </div>
                    <div style={{ marginTop: 10, fontSize: 11, color: 'var(--text-tertiary)' }}>
                        {skipStepIds.size > 0 ? `${skipStepIds.size} step${skipStepIds.size > 1 ? 's' : ''} will be skipped · click Run to execute` : 'Click steps above to mark them for skipping'}
                    </div>
                </div>
            )}

            {/* Expanded body */}
            {expanded && (
                <div style={{ borderTop: '1px solid var(--border)' }}>

                    {/* ── Tabs: Steps | Results ── */}
                    <div style={{ display: 'flex', borderBottom: '1px solid var(--border)', background: 'rgba(0,0,0,0.1)' }}>
                        {[
                            { key: 'steps', label: `Steps${steps?.length ? ` (${steps.length})` : ''}` },
                            { key: 'results', label: `Last Run${lastRun ? ` · ${lastRun.summary.passed}/${lastRun.summary.total}` : ''}` },
                        ].map(tab => (
                            <button key={tab.key} onClick={() => setActiveTab(tab.key)}
                                style={{
                                    padding: '8px 16px', fontSize: 12, fontWeight: 500, cursor: 'pointer',
                                    background: 'transparent', border: 'none',
                                    borderBottom: activeTab === tab.key ? '2px solid var(--accent)' : '2px solid transparent',
                                    color: activeTab === tab.key ? 'var(--accent)' : 'var(--text-tertiary)',
                                }}>
                                {tab.label}
                            </button>
                        ))}
                    </div>

                    {/* ── Steps tab ── always shows steps + Add Step button ── */}
                    {activeTab === 'steps' && (
                        loadingSteps
                            ? <div style={{ padding: 20, textAlign: 'center' }}><div className="spinner" style={{ width: 20, height: 20, margin: '0 auto' }} /></div>
                            : <StepsList
                                steps={steps}
                                suiteId={suite.id}
                                projectId={projectId}
                                onAddedStep={() => loadSteps()}
                            />
                    )}

                    {/* ── Results tab ── */}
                    {activeTab === 'results' && (
                        <>
                            {running && (
                                <div style={{ padding: '24px', textAlign: 'center' }}>
                                    <div className="spinner" style={{ width: 28, height: 28, margin: '0 auto 12px' }} />
                                    <div style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>Executing steps in sequence…</div>
                                </div>
                            )}

                            {lastRun && !running && (
                                <>
                                    <div style={{ padding: '10px 18px', background: 'rgba(0,0,0,0.15)', display: 'flex', gap: 16, alignItems: 'center', flexWrap: 'wrap' }}>
                                        <span style={{ fontSize: 12, color: 'var(--green)', fontWeight: 600 }}>✓ {lastRun.summary.passed} passed</span>
                                        {lastRun.summary.failed > 0 && <span style={{ fontSize: 12, color: 'var(--red)', fontWeight: 600 }}>✗ {lastRun.summary.failed} failed</span>}
                                        <div style={{ flex: 1, minWidth: 80, height: 4, background: 'rgba(255,255,255,0.06)', borderRadius: 2, overflow: 'hidden' }}>
                                            <div style={{ height: '100%', width: `${passRate}%`, background: passRate === 100 ? 'var(--green)' : passRate > 50 ? 'var(--amber)' : 'var(--red)', transition: 'width .4s' }} />
                                        </div>
                                        {lastRun.context && Object.entries(lastRun.context).filter(([k]) => !k.startsWith('__')).map(([k, v]) => (
                                            <span key={k} style={{ fontSize: 10, padding: '2px 8px', borderRadius: 10, background: 'var(--accent-dim)', color: 'var(--accent)', fontFamily: 'JetBrains Mono, monospace' }}>
                                                {`{{${k}}}`} ✓
                                            </span>
                                        ))}
                                    </div>
                                    <table className="table">
                                        <thead>
                                            <tr>
                                                <th style={{ width: 30 }} />
                                                <th style={{ width: 28 }}>#</th>
                                                <th style={{ width: 22 }} />
                                                <th>Step</th>
                                                <th style={{ width: 70 }}>Method</th>
                                                <th>Path</th>
                                                <th style={{ width: 60 }}>HTTP</th>
                                                <th style={{ width: 70 }}>Time</th>
                                                <th style={{ width: 70 }} />
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {(() => {
                                                const rows = [];
                                                let lastShownGroup = null;
                                                (lastRun.results || []).forEach((r, i) => {
                                                    const group = getStepGroup(r);
                                                    if (group && group !== lastShownGroup && i > 1) {
                                                        lastShownGroup = group;
                                                        rows.push(
                                                            <tr key={`grp-${i}`}>
                                                                <td colSpan={9} style={{ padding: '5px 14px 2px', background: 'rgba(130,100,255,0.04)', borderTop: '1px solid rgba(130,100,255,0.15)' }}>
                                                                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                                                        <div style={{ width: 3, height: 11, borderRadius: 2, background: 'var(--accent)', flexShrink: 0 }} />
                                                                        <span style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 10, color: 'var(--accent)', fontWeight: 600 }}>{group}</span>
                                                                        <span style={{ fontSize: 10, color: 'var(--text-tertiary)', marginLeft: 2 }}>· CRUD group</span>
                                                                    </div>
                                                                </td>
                                                            </tr>
                                                        );
                                                    } else if (!group) {
                                                        lastShownGroup = null;
                                                    }
                                                    rows.push(
                                                        <StepResult
                                                            key={i}
                                                            result={r}
                                                            projectId={projectId}
                                                            suiteId={suite.id}
                                                            stepDef={steps?.find(s => s.id === r.step_id)}
                                                            context={lastRun.context || {}}
                                                            loadSteps={loadSteps}
                                                            lastRun={lastRun}
                                                            setLastRun={setLastRun}
                                                            steps={steps}
                                                            onStepSaved={() => loadSteps()}
                                                            isFirst={i === 0}
                                                            isLast={i === (lastRun?.results?.length || 0) - 1}
                                                            onMoveUp={async () => {
                                                                if (i === 0 || !steps) return;
                                                                const ids = lastRun.results.map(x => x.step_id).filter(Boolean);
                                                                const newOrder = [...ids];
                                                                [newOrder[i - 1], newOrder[i]] = [newOrder[i], newOrder[i - 1]];
                                                                await api.flows.reorderSteps(projectId, suite.id, newOrder);
                                                                loadSteps();
                                                            }}
                                                            onMoveDown={async () => {
                                                                if (i === (lastRun?.results?.length || 0) - 1 || !steps) return;
                                                                const ids = lastRun.results.map(x => x.step_id).filter(Boolean);
                                                                const newOrder = [...ids];
                                                                [newOrder[i], newOrder[i + 1]] = [newOrder[i + 1], newOrder[i]];
                                                                await api.flows.reorderSteps(projectId, suite.id, newOrder);
                                                                loadSteps();
                                                            }}
                                                            onDeleteStep={async () => {
                                                                if (!window.confirm(`Delete step "${r.step_name}"?`)) return;
                                                                await api.flows.deleteStep(projectId, suite.id, r.step_id);
                                                                loadSteps();
                                                            }}
                                                        />
                                                    );
                                                });
                                                return rows;
                                            })()}
                                        </tbody>
                                    </table>
                                </>
                            )}

                            {!lastRun && !running && (
                                <div style={{ padding: '24px', textAlign: 'center', color: 'var(--text-tertiary)', fontSize: 12 }}>
                                    No runs yet — click <strong style={{ color: 'var(--accent)' }}>Run</strong> to execute all steps
                                </div>
                            )}
                        </>
                    )}
                </div>
            )}
        </div>
    );
}

export function FlowSuitesPage() {
    const { projectId } = useParams();
    const { addToast } = useStore();
    const [suites, setSuites] = useState([]);
    const [loading, setLoading] = useState(true);
    const [generating, setGenerating] = useState(false);
    const [showCreator, setShowCreator] = useState(false);
    const [showAutoGenModal, setShowAutoGenModal] = useState(false);

    useEffect(() => { loadSuites(); }, [projectId]);

    async function loadSuites() {
        setLoading(true);
        try {
            const data = await api.flows.list(projectId);
            setSuites(Array.isArray(data) ? data : []);
        } catch (err) { addToast(err.message, 'error'); }
        finally { setLoading(false); }
    }

    function openAutoGenerate() {
        setShowAutoGenModal(true);
    }

    async function confirmAutoGenerate({ auth_type, static_token }) {
        setGenerating(true);
        try {
            const { suite, steps } = await api.flows.autoGenerate(projectId, { auth_type, static_token });
            addToast(`✓ Created "${suite.name}" with ${steps.length} steps`, 'success');
            setShowAutoGenModal(false);
            await loadSuites();
        } catch (err) {
            addToast(err.message, 'error');
        } finally {
            setGenerating(false);
        }
    }

    async function deleteSuite(suiteId) {
        try {
            await api.flows.delete(projectId, suiteId);
            setSuites(s => s.filter(x => x.id !== suiteId));
            addToast('Suite deleted', 'success');
        } catch (err) { addToast(err.message, 'error'); }
    }

    return (
        <div className="page">
            <div className="page-header" style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
                <div>
                    <h1 className="page-title">Flow Suites</h1>
                    <p className="page-subtitle">Sequential flows — sign up → login → test authenticated endpoints in order</p>
                </div>
                <div style={{ display: 'flex', gap: 8 }}>
                    <button className="btn btn-ghost" onClick={loadSuites} style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                        <RefreshCw size={13} /> Refresh
                    </button>
                    <button className="btn btn-ghost" onClick={openAutoGenerate} disabled={generating}
                        style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                        {generating ? <><div className="spinner" style={{ width: 13, height: 13 }} /> Generating…</> : <><Zap size={13} /> Auto-generate</>}
                    </button>
                    <button className="btn btn-primary" onClick={() => setShowCreator(true)}
                        style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                        <Plus size={13} /> Create suite
                    </button>
                </div>
            </div>

            <div style={{ padding: '14px 18px', background: 'var(--accent-dim)', border: '1px solid rgba(130,100,255,0.2)', borderRadius: 10, marginBottom: 20 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                    <GitBranch size={15} color="var(--accent)" />
                    <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--accent)' }}>How flow suites work</span>
                </div>
                <div style={{ fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.7, marginBottom: 10 }}>
                    Steps run in sequence. Values extracted from each response (like <code style={{ fontFamily: 'JetBrains Mono, monospace', color: 'var(--accent)', fontSize: 11 }}>{'{{token}}'}</code>) are automatically injected into all following steps as <code style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 11 }}>Authorization: Bearer {'{{token}}'}</code>.
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                    {[
                        { label: 'Step 1', text: 'Sign up', color: 'var(--green)', bg: 'var(--green-bg)' },
                        { label: '→', text: 'extract {{userId}}', color: 'var(--text-tertiary)', bg: 'transparent' },
                        { label: 'Step 2', text: 'Login', color: 'var(--accent)', bg: 'var(--accent-dim)' },
                        { label: '→', text: 'extract {{token}}', color: 'var(--text-tertiary)', bg: 'transparent' },
                        { label: 'Step 3+', text: 'Auth endpoints', color: 'var(--amber)', bg: 'var(--amber-bg)' },
                        { label: '→', text: 'Bearer {{token}} injected', color: 'var(--text-tertiary)', bg: 'transparent' },
                    ].map(({ label, text, color, bg }, i) => (
                        <span key={i} style={{ fontSize: 11, padding: '3px 8px', borderRadius: 5, background: bg, color, fontWeight: bg !== 'transparent' ? 600 : 400 }}>
                            {label} {text}
                        </span>
                    ))}
                </div>
            </div>

            {loading ? (
                <div className="empty-state"><div className="spinner" style={{ width: 28, height: 28 }} /></div>
            ) : suites.length === 0 ? (
                <div className="card">
                    <div className="empty-state">
                        <GitBranch size={32} color="var(--text-tertiary)" />
                        <h3>No flow suites yet</h3>
                        <p>Click <strong>Auto-generate suite</strong> to create a signup → login → auth endpoints flow from your Swagger spec.</p>
                        <button className="btn btn-primary" onClick={openAutoGenerate} disabled={generating}
                            style={{ marginTop: 8, display: 'flex', alignItems: 'center', gap: 6 }}>
                            <Zap size={14} /> Auto-generate suite
                        </button>
                    </div>
                </div>
            ) : suites.map(suite => (
                <SuiteCard key={suite.id} suite={suite} projectId={projectId} onDelete={deleteSuite} />
            ))}

            {showCreator && (
                <SuiteCreator
                    projectId={projectId}
                    onCreated={suite => {
                        setShowCreator(false);
                        addToast(`✓ Suite "${suite.name}" created`, 'success');
                        loadSuites();
                    }}
                    onClose={() => setShowCreator(false)}
                />
            )}

            {showAutoGenModal && (
                <AutoGenerateModal
                    generating={generating}
                    onConfirm={confirmAutoGenerate}
                    onClose={() => setShowAutoGenModal(false)}
                />
            )}
        </div>
    );
}