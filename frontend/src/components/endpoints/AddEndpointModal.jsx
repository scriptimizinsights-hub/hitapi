import { useState } from 'react';
import { Terminal, PenLine, Check } from 'lucide-react';
import { api } from '../../store/index.js';
import parseCurlToJson from '@bany/curl-to-json';



const METHODS = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'];

export function AddEndpointModal({ projectId, onClose, onAdded }) {
    const [mode, setMode] = useState('manual'); // 'manual' | 'curl'
    const [curlText, setCurlText] = useState('');
    const [curlError, setCurlError] = useState('');
    const [parsed, setParsed] = useState(false);

    const [method, setMethod] = useState('GET');
    const [path, setPath] = useState('');
    const [summary, setSummary] = useState('');
    const [tags, setTags] = useState('');
    const [parameters, setParameters] = useState('[]');
    const [requestBody, setRequestBody] = useState('');

    const [saving, setSaving] = useState(false);
    const [error, setError] = useState('');

    function handleParseCurl() {
        setCurlError('');
        try {
            const normalized = curlText.trim().replace(/\\\r?\n\s*/g, ' ');
            const result = parseCurlToJson(normalized);

            if (!result?.url) throw new Error('Could not find a URL in that curl command');

            let path = result.url;
            try {
                const u = new URL(result.url);
                path = u.pathname + (u.search || '');
            } catch {
                path = result.url; // relative/partial URL — use as-is
            }

            setMethod((result.method || 'GET').toUpperCase());
            setPath(path);
            setRequestBody(result.data ? JSON.stringify(result.data, null, 2) : '');
            setParsed(true);
            setMode('manual');
        } catch (err) {
            setCurlError(err.message);
        }
    }

    async function handleSave() {
        if (!path.trim()) { setError('Path is required'); return; }

        let parsedParams = [];
        let parsedBody = null;
        try {
            parsedParams = parameters.trim() ? JSON.parse(parameters) : [];
        } catch { setError('Parameters must be valid JSON'); return; }
        try {
            parsedBody = requestBody.trim() ? JSON.parse(requestBody) : null;
        } catch { setError('Request body must be valid JSON'); return; }

        setSaving(true);
        setError('');
        try {
            const result = await api.endpoints.create(projectId, {
                method,
                path: path.trim(),
                summary: summary.trim() || null,
                tags: tags.trim() ? tags.split(',').map(t => t.trim()) : [],
                parameters: parsedParams,
                request_body: parsedBody,
            });
            onAdded(result);
        } catch (err) {
            setError(err.message);
        } finally {
            setSaving(false);
        }
    }

    return (
        <div className="modal-backdrop" onClick={onClose}>
            <div className="modal" onClick={e => e.stopPropagation()} style={{ width: 620, maxWidth: '92vw', maxHeight: '88vh', padding: 0, display: 'flex', flexDirection: 'column' }}>

                {/* Header */}
                <div style={{ padding: '18px 22px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <div style={{ fontSize: 15, fontWeight: 600 }}>Add Endpoint</div>
                    <button onClick={onClose} style={{ width: 30, height: 30, border: '1px solid var(--border)', borderRadius: 7, background: 'var(--bg-input)', color: 'var(--text-secondary)', cursor: 'pointer', fontSize: 16 }}>×</button>
                </div>

                {/* Mode tabs */}
                <div style={{ display: 'flex', gap: 6, padding: '14px 22px 0' }}>
                    <button onClick={() => setMode('manual')} style={{
                        flex: 1, padding: '9px 12px', borderRadius: 7, fontSize: 12, fontWeight: 600, cursor: 'pointer',
                        display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                        background: mode === 'manual' ? 'var(--accent-dim)' : 'var(--bg-card)',
                        color: mode === 'manual' ? 'var(--accent)' : 'var(--text-secondary)',
                        border: `1px solid ${mode === 'manual' ? 'rgba(130,100,255,0.35)' : 'var(--border)'}`,
                    }}>
                        <PenLine size={13} /> Manual entry
                    </button>
                    <button onClick={() => setMode('curl')} style={{
                        flex: 1, padding: '9px 12px', borderRadius: 7, fontSize: 12, fontWeight: 600, cursor: 'pointer',
                        display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                        background: mode === 'curl' ? 'var(--accent-dim)' : 'var(--bg-card)',
                        color: mode === 'curl' ? 'var(--accent)' : 'var(--text-secondary)',
                        border: `1px solid ${mode === 'curl' ? 'rgba(130,100,255,0.35)' : 'var(--border)'}`,
                    }}>
                        <Terminal size={13} /> Paste cURL
                    </button>
                </div>

                {/* Body */}
                <div style={{ padding: '16px 22px 22px', overflowY: 'auto', flex: 1 }}>

                    {mode === 'curl' && (
                        <div>
                            <label style={{ fontSize: 11, color: 'var(--text-tertiary)', display: 'block', marginBottom: 6 }}>
                                Paste a curl command
                            </label>
                            <textarea
                                value={curlText}
                                onChange={e => setCurlText(e.target.value)}
                                rows={8}
                                placeholder={`curl -X POST 'https://api.example.com/goals' \\\n  -H 'Content-Type: application/json' \\\n  -d '{"name":"Emergency Fund","targetAmount":10000}'`}
                                style={{
                                    width: '100%', boxSizing: 'border-box', padding: '10px 12px', borderRadius: 7,
                                    background: 'var(--bg-input)', border: `1px solid ${curlError ? 'var(--red)' : 'var(--border)'}`,
                                    color: 'var(--text-primary)', fontFamily: 'JetBrains Mono, monospace', fontSize: 11.5,
                                    lineHeight: 1.6, resize: 'vertical', outline: 'none',
                                }}
                            />
                            {curlError && <div style={{ fontSize: 11, color: 'var(--red)', marginTop: 6 }}>⚠ {curlError}</div>}
                            <button
                                onClick={handleParseCurl}
                                disabled={!curlText.trim()}
                                style={{
                                    marginTop: 12, display: 'flex', alignItems: 'center', gap: 6,
                                    padding: '8px 14px', borderRadius: 7, fontSize: 12, fontWeight: 600,
                                    cursor: curlText.trim() ? 'pointer' : 'not-allowed',
                                    background: 'var(--accent)', color: '#fff', border: 'none',
                                    opacity: curlText.trim() ? 1 : 0.5,
                                }}
                            >
                                <Terminal size={13} /> Parse curl → fill fields
                            </button>
                            <div style={{ fontSize: 10.5, color: 'var(--text-tertiary)', marginTop: 8, lineHeight: 1.5 }}>
                                Parses <code>-X</code>/<code>--request</code>, <code>-H</code>/<code>--header</code>, <code>-d</code>/<code>--data(-raw|-binary)</code>, and the URL. After parsing you'll review the fields on the Manual entry tab before saving.
                            </div>
                        </div>
                    )}

                    {mode === 'manual' && (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                            {parsed && (
                                <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '7px 10px', background: 'var(--green-bg)', borderRadius: 6, fontSize: 11, color: 'var(--green)', border: '1px solid var(--green-border)' }}>
                                    <Check size={12} /> Parsed from curl — review before saving
                                </div>
                            )}

                            <div style={{ display: 'grid', gridTemplateColumns: '110px 1fr', gap: 10 }}>
                                <div>
                                    <label style={{ fontSize: 11, color: 'var(--text-tertiary)', display: 'block', marginBottom: 4 }}>Method</label>
                                    <select value={method} onChange={e => setMethod(e.target.value)}
                                        style={{ width: '100%', padding: '8px 10px', borderRadius: 6, background: 'var(--bg-card)', border: '1px solid var(--border)', color: 'var(--text-primary)', fontSize: 12 }}>
                                        {METHODS.map(m => <option key={m} value={m}>{m}</option>)}
                                    </select>
                                </div>
                                <div>
                                    <label style={{ fontSize: 11, color: 'var(--text-tertiary)', display: 'block', marginBottom: 4 }}>Path</label>
                                    <input value={path} onChange={e => setPath(e.target.value)} placeholder="/api/goals/{id}"
                                        style={{ width: '100%', boxSizing: 'border-box', padding: '8px 10px', borderRadius: 6, background: 'var(--bg-card)', border: '1px solid var(--border)', color: 'var(--text-primary)', fontSize: 12, fontFamily: 'JetBrains Mono, monospace' }} />
                                </div>
                            </div>

                            <div>
                                <label style={{ fontSize: 11, color: 'var(--text-tertiary)', display: 'block', marginBottom: 4 }}>Summary <span style={{ fontWeight: 400 }}>(optional)</span></label>
                                <input value={summary} onChange={e => setSummary(e.target.value)} placeholder="Create a savings goal"
                                    style={{ width: '100%', boxSizing: 'border-box', padding: '8px 10px', borderRadius: 6, background: 'var(--bg-card)', border: '1px solid var(--border)', color: 'var(--text-primary)', fontSize: 12 }} />
                            </div>

                            <div>
                                <label style={{ fontSize: 11, color: 'var(--text-tertiary)', display: 'block', marginBottom: 4 }}>Tags <span style={{ fontWeight: 400 }}>(comma-separated, optional)</span></label>
                                <input value={tags} onChange={e => setTags(e.target.value)} placeholder="goals, finance"
                                    style={{ width: '100%', boxSizing: 'border-box', padding: '8px 10px', borderRadius: 6, background: 'var(--bg-card)', border: '1px solid var(--border)', color: 'var(--text-primary)', fontSize: 12 }} />
                            </div>

                            <div>
                                <label style={{ fontSize: 11, color: 'var(--text-tertiary)', display: 'block', marginBottom: 4 }}>Parameters <span style={{ fontWeight: 400 }}>(JSON array, optional)</span></label>
                                <textarea value={parameters} onChange={e => setParameters(e.target.value)} rows={3}
                                    style={{ width: '100%', boxSizing: 'border-box', padding: '8px 10px', borderRadius: 6, background: 'var(--bg-card)', border: '1px solid var(--border)', color: 'var(--text-primary)', fontSize: 11, fontFamily: 'JetBrains Mono, monospace', resize: 'vertical' }} />
                            </div>

                            {['POST', 'PUT', 'PATCH'].includes(method) && (
                                <div>
                                    <label style={{ fontSize: 11, color: 'var(--text-tertiary)', display: 'block', marginBottom: 4 }}>Request body <span style={{ fontWeight: 400 }}>(JSON, optional)</span></label>
                                    <textarea value={requestBody} onChange={e => setRequestBody(e.target.value)} rows={5}
                                        placeholder={'{\n  "name": "Emergency Fund"\n}'}
                                        style={{ width: '100%', boxSizing: 'border-box', padding: '8px 10px', borderRadius: 6, background: 'var(--bg-card)', border: '1px solid var(--border)', color: 'var(--text-primary)', fontSize: 11, fontFamily: 'JetBrains Mono, monospace', resize: 'vertical' }} />
                                </div>
                            )}

                            {error && (
                                <div style={{ padding: '8px 10px', background: 'var(--red-bg)', borderRadius: 6, fontSize: 12, color: 'var(--red)', border: '1px solid rgba(255,92,92,0.25)' }}>
                                    ⚠ {error}
                                </div>
                            )}
                        </div>
                    )}
                </div>

                {/* Footer */}
                <div style={{ padding: '14px 22px', borderTop: '1px solid var(--border)', display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
                    <button onClick={onClose} style={{ padding: '8px 16px', borderRadius: 7, fontSize: 12, cursor: 'pointer', background: 'transparent', color: 'var(--text-secondary)', border: '1px solid var(--border)' }}>
                        Cancel
                    </button>
                    {mode === 'manual' && (
                        <button onClick={handleSave} disabled={saving} style={{
                            display: 'flex', alignItems: 'center', gap: 6, padding: '8px 16px', borderRadius: 7,
                            fontSize: 12, fontWeight: 600, cursor: saving ? 'not-allowed' : 'pointer',
                            background: 'var(--accent)', color: '#fff', border: 'none', opacity: saving ? 0.7 : 1,
                        }}>
                            {saving ? <><div className="spinner" style={{ width: 12, height: 12 }} /> Saving…</> : <>Add endpoint</>}
                        </button>
                    )}
                </div>
            </div>
        </div>
    );
}