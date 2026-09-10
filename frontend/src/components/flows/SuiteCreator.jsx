import { useState, useEffect } from 'react';
import { api } from '../../store/index.js';
import {
    X, ChevronRight, Trash2,
    Wand2, PenLine, GitBranch, ChevronDown
} from 'lucide-react';

import { Label, Input, Textarea, EndpointPicker } from './wizard/Helpers.jsx'

import { SmartWizard } from './wizard/SmartWizard.jsx'
import { ManualBuilder } from './wizard/ManualBuilder.jsx'

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
            if (result.input_payload || result.request_body) onUpdate('input_payload', JSON.stringify(result.input_payload || result.request_body));
            if (result.input_params) onUpdate('input_params', JSON.stringify(result.input_params));
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