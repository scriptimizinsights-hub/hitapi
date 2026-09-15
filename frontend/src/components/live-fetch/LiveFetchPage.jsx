import { useState } from 'react';
import { useParams } from 'react-router-dom';
import { Send, Terminal, PenLine, Play, Copy, Check, Save, Clock } from 'lucide-react';
import { api, useStore } from '../../store/index.js';
import parseCurlToJson from '@bany/curl-to-json';

const METHODS = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'];

function CopyBtn({ text }) {
    const [copied, setCopied] = useState(false);
    return (
        <button onClick={() => { navigator.clipboard.writeText(text); setCopied(true); setTimeout(() => setCopied(false), 1500); }}
            style={{
                display: 'flex', alignItems: 'center', gap: 4, padding: '3px 8px', borderRadius: 5, fontSize: 10, cursor: 'pointer',
                background: copied ? 'var(--green-bg)' : 'rgba(255,255,255,0.06)',
                color: copied ? 'var(--green)' : 'var(--text-tertiary)',
                border: `1px solid ${copied ? 'var(--green-border)' : 'var(--border)'}`
            }}>
            {copied ? <Check size={10} /> : <Copy size={10} />} {copied ? 'Copied' : 'Copy'}
        </button>
    );
}

export function LiveFetchPage() {
    const { projectId } = useParams();
    const { addToast, currentProject } = useStore();

    const [mode, setMode] = useState('manual'); // 'manual' | 'curl'
    const [curlText, setCurlText] = useState('');
    const [curlError, setCurlError] = useState('');

    const [method, setMethod] = useState('GET');
    const [url, setUrl] = useState('');
    const [headersText, setHeadersText] = useState('{\n  "Content-Type": "application/json"\n}');
    const [bodyText, setBodyText] = useState('');

    const [sending, setSending] = useState(false);
    const [result, setResult] = useState(null);
    const [error, setError] = useState('');
    const [saving, setSaving] = useState(false);

    function handleParseCurl() {
        setCurlError('');
        try {
            const normalized = curlText.trim().replace(/\\\r?\n\s*/g, ' ');
            const parsed = parseCurlToJson(normalized);
            if (!parsed?.url) throw new Error('Could not find a URL in that curl command');

            setMethod((parsed.method || 'GET').toUpperCase());
            setUrl(parsed.url);
            setHeadersText(parsed.header ? JSON.stringify(parsed.header, null, 2) : '{}');
            setBodyText(parsed.data ? JSON.stringify(parsed.data, null, 2) : '');
            setMode('manual');
        } catch (err) {
            setCurlError(err.message);
        }
    }

    async function handleSend() {
        setError('');
        setResult(null);
        if (!url.trim()) { setError('URL is required'); return; }

        let headers = {};
        try { headers = headersText.trim() ? JSON.parse(headersText) : {}; }
        catch { setError('Headers must be valid JSON'); return; }

        let bodyPayload;
        if (['POST', 'PUT', 'PATCH'].includes(method) && bodyText.trim()) {
            try { bodyPayload = JSON.stringify(JSON.parse(bodyText)); }
            catch { setError('Body must be valid JSON'); return; }
        }

        setSending(true);
        const start = Date.now();
        try {
            const response = await fetch(url.trim(), {
                method,
                headers,
                body: bodyPayload,
            });
            const ms = Date.now() - start;
            const ct = response.headers.get('content-type') || '';
            const respHeaders = {};
            for (const [k, v] of response.headers.entries()) respHeaders[k] = v;

            let respBody;
            let isJson = ct.includes('application/json');
            if (isJson) {
                try { respBody = await response.json(); }
                catch { respBody = await response.text(); isJson = false; }
            } else {
                respBody = await response.text();
            }

            setResult({
                status: response.status,
                ok: response.ok,
                ms,
                headers: respHeaders,
                body: respBody,
                isJson,
            });
        } catch (err) {
            setResult({
                status: null,
                ok: false,
                ms: Date.now() - start,
                error: err.message || 'Request failed — check the URL and CORS settings on the target server',
            });
        } finally {
            setSending(false);
        }
    }

    async function handleSaveAsEndpoint() {
        if (!url.trim()) return;

        let path = url.trim();
        try {
            const u = new URL(url.trim());
            path = u.pathname + (u.search || '');
            if (currentProject?.base_url && u.origin !== new URL(currentProject.base_url).origin) {
                addToast('⚠ URL host differs from project base URL — saved with path only', 'info');
            }
        } catch { /* relative URL — used as-is */ }

        let requestBody = null;
        if (bodyText.trim()) {
            try { requestBody = JSON.parse(bodyText); } catch { /* leave null */ }
        }

        setSaving(true);
        try {
            await api.endpoints.create(projectId, {
                method,
                path,
                request_body: requestBody,
            });
            addToast('✓ Saved to Endpoints', 'success');
        } catch (err) {
            addToast(err.message || 'Failed to save endpoint', 'error');
        } finally {
            setSaving(false);
        }
    }

    return (
        <div className="page">
            <div className="page-header">
                <h1 className="page-title">Live Fetch</h1>
                <p className="page-subtitle">Send a real request and inspect the response — like Postman, right in the browser</p>
            </div>

            {/* Mode tabs */}
            <div style={{ display: 'flex', gap: 6, marginBottom: 14 }}>
                <button onClick={() => setMode('manual')} style={{
                    padding: '8px 14px', borderRadius: 7, fontSize: 12, fontWeight: 600, cursor: 'pointer',
                    display: 'flex', alignItems: 'center', gap: 6,
                    background: mode === 'manual' ? 'var(--accent-dim)' : 'var(--bg-card)',
                    color: mode === 'manual' ? 'var(--accent)' : 'var(--text-secondary)',
                    border: `1px solid ${mode === 'manual' ? 'rgba(130,100,255,0.35)' : 'var(--border)'}`,
                }}>
                    <PenLine size={13} /> Manual
                </button>
                <button onClick={() => setMode('curl')} style={{
                    padding: '8px 14px', borderRadius: 7, fontSize: 12, fontWeight: 600, cursor: 'pointer',
                    display: 'flex', alignItems: 'center', gap: 6,
                    background: mode === 'curl' ? 'var(--accent-dim)' : 'var(--bg-card)',
                    color: mode === 'curl' ? 'var(--accent)' : 'var(--text-secondary)',
                    border: `1px solid ${mode === 'curl' ? 'rgba(130,100,255,0.35)' : 'var(--border)'}`,
                }}>
                    <Terminal size={13} /> Paste cURL
                </button>
            </div>

            {mode === 'curl' && (
                <div className="card" style={{ padding: 16, marginBottom: 16 }}>
                    <textarea
                        value={curlText}
                        onChange={e => setCurlText(e.target.value)}
                        rows={6}
                        placeholder={`curl -X POST 'https://api.example.com/goals' \\\n  -H 'Content-Type: application/json' \\\n  -d '{"name":"Emergency Fund"}'`}
                        style={{
                            width: '100%', boxSizing: 'border-box', padding: '10px 12px', borderRadius: 7,
                            background: 'var(--bg-input)', border: `1px solid ${curlError ? 'var(--red)' : 'var(--border)'}`,
                            color: 'var(--text-primary)', fontFamily: 'JetBrains Mono, monospace', fontSize: 11.5,
                            lineHeight: 1.6, resize: 'vertical', outline: 'none',
                        }}
                    />
                    {curlError && <div style={{ fontSize: 11, color: 'var(--red)', marginTop: 6 }}>⚠ {curlError}</div>}
                    <button onClick={handleParseCurl} disabled={!curlText.trim()} style={{
                        marginTop: 10, display: 'flex', alignItems: 'center', gap: 6,
                        padding: '8px 14px', borderRadius: 7, fontSize: 12, fontWeight: 600,
                        cursor: curlText.trim() ? 'pointer' : 'not-allowed',
                        background: 'var(--accent)', color: '#fff', border: 'none',
                        opacity: curlText.trim() ? 1 : 0.5,
                    }}>
                        <Terminal size={13} /> Parse curl → fill request
                    </button>
                </div>
            )}

            {/* Request builder */}
            <div className="card" style={{ padding: 16, marginBottom: 16 }}>
                <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
                    <select value={method} onChange={e => setMethod(e.target.value)} style={{
                        padding: '9px 10px', borderRadius: 7, background: 'var(--bg-card)',
                        border: '1px solid var(--border)', color: 'var(--text-primary)', fontSize: 13, fontWeight: 600,
                    }}>
                        {METHODS.map(m => <option key={m} value={m}>{m}</option>)}
                    </select>
                    <input
                        value={url}
                        onChange={e => setUrl(e.target.value)}
                        placeholder="https://api.example.com/goals"
                        style={{
                            flex: 1, padding: '9px 12px', borderRadius: 7, background: 'var(--bg-input)',
                            border: '1px solid var(--border)', color: 'var(--text-primary)',
                            fontFamily: 'JetBrains Mono, monospace', fontSize: 12.5,
                        }}
                    />
                    <button onClick={handleSend} disabled={sending} style={{
                        display: 'flex', alignItems: 'center', gap: 6, padding: '9px 18px', borderRadius: 7,
                        fontSize: 13, fontWeight: 600, cursor: sending ? 'not-allowed' : 'pointer',
                        background: 'var(--accent)', color: '#fff', border: 'none', opacity: sending ? 0.7 : 1,
                    }}>
                        {sending ? <div className="spinner" style={{ width: 13, height: 13 }} /> : <Send size={14} />}
                        {sending ? 'Sending…' : 'Send'}
                    </button>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                    <div>
                        <label style={{ fontSize: 11, color: 'var(--text-tertiary)', display: 'block', marginBottom: 4 }}>Headers (JSON)</label>
                        <textarea value={headersText} onChange={e => setHeadersText(e.target.value)} rows={4}
                            style={{ width: '100%', boxSizing: 'border-box', padding: '8px 10px', borderRadius: 6, background: 'var(--bg-card)', border: '1px solid var(--border)', color: 'var(--text-primary)', fontSize: 11, fontFamily: 'JetBrains Mono, monospace', resize: 'vertical' }} />
                    </div>
                    {['POST', 'PUT', 'PATCH'].includes(method) && (
                        <div>
                            <label style={{ fontSize: 11, color: 'var(--text-tertiary)', display: 'block', marginBottom: 4 }}>Body (JSON)</label>
                            <textarea value={bodyText} onChange={e => setBodyText(e.target.value)} rows={4}
                                placeholder={'{\n  "name": "value"\n}'}
                                style={{ width: '100%', boxSizing: 'border-box', padding: '8px 10px', borderRadius: 6, background: 'var(--bg-card)', border: '1px solid var(--border)', color: 'var(--text-primary)', fontSize: 11, fontFamily: 'JetBrains Mono, monospace', resize: 'vertical' }} />
                        </div>
                    )}
                </div>

                {error && (
                    <div style={{ marginTop: 10, padding: '8px 12px', background: 'var(--red-bg)', borderRadius: 6, fontSize: 12, color: 'var(--red)', border: '1px solid rgba(255,92,92,0.25)' }}>
                        ⚠ {error}
                    </div>
                )}
            </div>

            {/* Response */}
            {result && (
                <div className="card" style={{ padding: 16 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12, flexWrap: 'wrap' }}>
                        {result.status ? (
                            <span style={{
                                fontFamily: 'JetBrains Mono, monospace', fontSize: 14, fontWeight: 700, padding: '3px 10px', borderRadius: 6,
                                background: result.ok ? 'var(--green-bg)' : 'var(--red-bg)',
                                color: result.ok ? 'var(--green)' : 'var(--red)',
                            }}>{result.status}</span>
                        ) : (
                            <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--red)' }}>Request failed</span>
                        )}
                        <span style={{ fontSize: 11, color: 'var(--text-tertiary)', display: 'flex', alignItems: 'center', gap: 4 }}>
                            <Clock size={11} /> {result.ms}ms
                        </span>
                        <div style={{ flex: 1 }} />
                        <button onClick={handleSaveAsEndpoint} disabled={saving} style={{
                            display: 'flex', alignItems: 'center', gap: 6, padding: '6px 12px', borderRadius: 6,
                            fontSize: 11, fontWeight: 600, cursor: saving ? 'not-allowed' : 'pointer',
                            background: 'var(--accent-dim)', color: 'var(--accent)', border: '1px solid rgba(130,100,255,0.3)',
                            opacity: saving ? 0.7 : 1,
                        }}>
                            {saving ? <div className="spinner" style={{ width: 11, height: 11 }} /> : <Save size={12} />}
                            {saving ? 'Saving…' : 'Save as Endpoint'}
                        </button>
                    </div>

                    {result.error ? (
                        <div style={{ padding: '10px 12px', background: 'var(--red-bg)', borderRadius: 6, fontSize: 12, color: 'var(--red)', border: '1px solid rgba(255,92,92,0.25)' }}>
                            ⚠ {result.error}
                        </div>
                    ) : (
                        <>
                            <details style={{ marginBottom: 10 }}>
                                <summary style={{ cursor: 'pointer', fontSize: 11, fontWeight: 600, color: 'var(--text-tertiary)' }}>
                                    Response headers ({Object.keys(result.headers).length})
                                </summary>
                                <pre style={{ margin: '8px 0 0', padding: 10, background: 'rgba(0,0,0,0.2)', borderRadius: 6, fontSize: 10.5, color: 'var(--text-secondary)', fontFamily: 'JetBrains Mono, monospace', maxHeight: 140, overflow: 'auto' }}>
                                    {Object.entries(result.headers).map(([k, v]) => `${k}: ${v}`).join('\n')}
                                </pre>
                            </details>

                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
                                <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-tertiary)' }}>Response body</div>
                                <CopyBtn text={result.isJson ? JSON.stringify(result.body, null, 2) : String(result.body)} />
                            </div>
                            <pre style={{
                                margin: 0, padding: 12, background: 'rgba(0,0,0,0.3)', borderRadius: 7,
                                fontFamily: 'JetBrains Mono, monospace', fontSize: 12, lineHeight: 1.6,
                                color: 'var(--text-secondary)', maxHeight: 400, overflow: 'auto',
                                whiteSpace: 'pre-wrap', wordBreak: 'break-word',
                                border: `1px solid ${result.ok ? 'rgba(35,209,139,0.15)' : 'rgba(255,92,92,0.15)'}`
                            }}>
                                {result.isJson ? JSON.stringify(result.body, null, 2) : String(result.body)}
                            </pre>
                        </>
                    )}
                </div>
            )}
        </div>
    );
}