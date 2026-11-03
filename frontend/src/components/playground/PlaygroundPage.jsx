/**
 * API Playground — public, no login and no project required.
 * Anyone can compose an HTTP request, send it, and inspect the response.
 *
 * Two send modes:
 *   - "server"  (default) → request runs from the APIForge Worker via
 *                            POST /api/public/request (no CORS problems)
 *   - "browser"            → request runs straight from the user's browser
 *                            (useful for localhost / intranet APIs; target must allow CORS)
 */

import { useEffect, useMemo, useState } from 'react';
import { Send, Plus, Trash2, Copy, Clock, History, Globe2, Monitor, X } from 'lucide-react';
import { api, useStore } from '../../store/index.js';

const METHODS = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS'];
const HISTORY_KEY = 'apiforge.playground.history';
const MAX_HISTORY = 25;

const SAMPLES = [
    { label: 'List posts', method: 'GET', url: 'https://jsonplaceholder.typicode.com/posts?_limit=5' },
    {
        label: 'Create post', method: 'POST', url: 'https://jsonplaceholder.typicode.com/posts',
        body: JSON.stringify({ title: 'Hello', body: 'From APIForge', userId: 1 }, null, 2)
    },
    { label: 'Echo headers', method: 'GET', url: 'https://httpbin.org/headers' },
];

const emptyRow = () => ({ key: '', value: '', enabled: true });

function rowsToObject(rows) {
    const out = {};
    for (const r of rows) if (r.enabled && r.key.trim()) out[r.key.trim()] = r.value;
    return out;
}

function loadHistory() {
    try { return JSON.parse(localStorage.getItem(HISTORY_KEY) || '[]'); } catch { return []; }
}
function saveHistory(items) {
    try { localStorage.setItem(HISTORY_KEY, JSON.stringify(items.slice(0, MAX_HISTORY))); } catch { /* storage unavailable */ }
}

function formatBytes(n) {
    if (n == null) return '—';
    if (n < 1024) return `${n} B`;
    if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
    return `${(n / 1024 / 1024).toFixed(2)} MB`;
}

function statusBadge(status) {
    if (!status) return 'badge-gray';
    if (status < 300) return 'badge-green';
    if (status < 400) return 'badge-blue';
    if (status < 500) return 'badge-amber';
    return 'badge-red';
}

function shellQuote(s) { return `'${String(s).replace(/'/g, `'\\''`)}'`; }

// ─── Small building blocks ───────────────────────────────────────────────────

function Tabs({ tabs, active, onChange }) {
    return (
        <div style={{ display: 'flex', gap: 2, borderBottom: '1px solid var(--border)', marginBottom: 12 }}>
            {tabs.map(t => (
                <button
                    key={t.id}
                    onClick={() => onChange(t.id)}
                    style={{
                        padding: '8px 12px', background: 'transparent', fontSize: 12, fontWeight: 500,
                        color: active === t.id ? 'var(--text-primary)' : 'var(--text-tertiary)',
                        borderBottom: active === t.id ? '2px solid var(--accent)' : '2px solid transparent',
                        marginBottom: -1, borderRadius: 0
                    }}
                >
                    {t.label}{t.count ? <span className="text-accent" style={{ marginLeft: 5 }}>{t.count}</span> : null}
                </button>
            ))}
        </div>
    );
}

function KeyValueEditor({ rows, onChange, keyPlaceholder = 'Key', valuePlaceholder = 'Value' }) {
    const update = (i, patch) => onChange(rows.map((r, idx) => (idx === i ? { ...r, ...patch } : r)));
    const remove = (i) => onChange(rows.length === 1 ? [emptyRow()] : rows.filter((_, idx) => idx !== i));

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {rows.map((r, i) => (
                <div key={i} style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                    <input type="checkbox" checked={r.enabled} onChange={e => update(i, { enabled: e.target.checked })} aria-label="Enabled" />
                    <input className="input font-mono" style={{ flex: 1 }} placeholder={keyPlaceholder}
                        value={r.key} onChange={e => update(i, { key: e.target.value })} />
                    <input className="input font-mono" style={{ flex: 2 }} placeholder={valuePlaceholder}
                        value={r.value} onChange={e => update(i, { value: e.target.value })} />
                    <button className="btn btn-ghost btn-icon" onClick={() => remove(i)} aria-label="Remove row"><Trash2 size={13} /></button>
                </div>
            ))}
            <button className="btn btn-ghost btn-sm" style={{ alignSelf: 'flex-start' }} onClick={() => onChange([...rows, emptyRow()])}>
                <Plus size={12} /> Add
            </button>
        </div>
    );
}

const label = { fontSize: 12, color: 'var(--text-secondary)', display: 'block', marginBottom: 5 };

// ─── Page ────────────────────────────────────────────────────────────────────

export function PlaygroundPage() {
    const { addToast } = useStore();

    const [method, setMethod] = useState('GET');
    const [url, setUrl] = useState(SAMPLES[0].url);
    const [params, setParams] = useState([emptyRow()]);
    const [headers, setHeaders] = useState([emptyRow()]);
    const [bodyType, setBodyType] = useState('json'); // json | text | none
    const [body, setBody] = useState('');
    const [auth, setAuth] = useState({ type: 'none', token: '', username: '', password: '', header: 'X-API-Key', key: '', in: 'header' });
    const [mode, setMode] = useState('server');
    const [reqTab, setReqTab] = useState('params');
    const [resTab, setResTab] = useState('body');

    const [loading, setLoading] = useState(false);
    const [response, setResponse] = useState(null);
    const [errorMsg, setErrorMsg] = useState(null);
    const [history, setHistory] = useState(loadHistory);
    const [showHistory, setShowHistory] = useState(false);

    const canHaveBody = !['GET', 'HEAD'].includes(method);
    const setA = (k, v) => setAuth(a => ({ ...a, [k]: v }));

    // Build the final request (shared by server mode, browser mode and cURL export)
    const built = useMemo(() => {
        const h = rowsToObject(headers);
        let finalUrl = url.trim();
        try {
            const u = new URL(finalUrl);
            for (const [k, v] of Object.entries(rowsToObject(params))) u.searchParams.set(k, v);
            if (auth.type === 'apikey' && auth.in === 'query' && auth.key) u.searchParams.set(auth.header || 'api_key', auth.key);
            finalUrl = u.toString();
        } catch { /* invalid URL — validated on send */ }

        if (auth.type === 'bearer' && auth.token) h['Authorization'] = `Bearer ${auth.token}`;
        if (auth.type === 'basic') h['Authorization'] = `Basic ${btoa(`${auth.username}:${auth.password}`)}`;
        if (auth.type === 'apikey' && auth.in === 'header' && auth.key) h[auth.header || 'X-API-Key'] = auth.key;

        const sendBody = canHaveBody && bodyType !== 'none' && body.trim() ? body : undefined;
        if (sendBody && !Object.keys(h).some(k => k.toLowerCase() === 'content-type')) {
            h['Content-Type'] = bodyType === 'json' ? 'application/json' : 'text/plain';
        }
        return { method, url: finalUrl, headers: h, body: sendBody };
    }, [method, url, params, headers, body, bodyType, auth, canHaveBody]);

    const curl = useMemo(() => {
        const parts = [`curl -X ${built.method} ${shellQuote(built.url)}`];
        for (const [k, v] of Object.entries(built.headers)) parts.push(`  -H ${shellQuote(`${k}: ${v}`)}`);
        if (built.body) parts.push(`  --data ${shellQuote(built.body)}`);
        return parts.join(' \\\n');
    }, [built]);

    async function send() {
        setErrorMsg(null);
        try { new URL(url.trim()); } catch {
            setErrorMsg('Enter a full URL including http:// or https://');
            return;
        }
        if (bodyType === 'json' && built.body) {
            try { JSON.parse(built.body); } catch {
                setErrorMsg('Body is not valid JSON — fix it or switch the body type to Text');
                return;
            }
        }

        setLoading(true);
        setResponse(null);
        try {
            const result = mode === 'server' ? await sendViaServer() : await sendViaBrowser();
            setResponse(result);
            setResTab('body');
            const entry = { id: Date.now(), method, url: url.trim(), params, headers, bodyType, body, auth, status: result.status, time_ms: result.time_ms };
            const next = [entry, ...history.filter(h => !(h.method === method && h.url === entry.url))].slice(0, MAX_HISTORY);
            setHistory(next);
            saveHistory(next);
        } catch (err) {
            setErrorMsg(err.message);
        } finally {
            setLoading(false);
        }
    }

    async function sendViaServer() {
        return api.public.request({
            method: built.method,
            url: built.url,
            headers: built.headers,
            body: built.body
        });
    }

    async function sendViaBrowser() {
        const started = performance.now();
        let res;
        try {
            res = await fetch(built.url, { method: built.method, headers: built.headers, body: built.body });
        } catch (err) {
            throw new Error(`${err.message}. The target API probably doesn't allow CORS from this site — switch to "Via APIForge server".`);
        }
        const text = await res.text();
        const hdrs = {};
        res.headers.forEach((v, k) => { hdrs[k] = v; });
        let json = null;
        try { json = JSON.parse(text); } catch { /* not JSON */ }
        return {
            ok: res.ok, status: res.status, status_text: res.statusText,
            time_ms: Math.round(performance.now() - started),
            size_bytes: new Blob([text]).size, truncated: false,
            headers: hdrs, content_type: res.headers.get('content-type') || '',
            body: text, json, final_url: res.url
        };
    }

    function loadEntry(e) {
        setMethod(e.method); setUrl(e.url);
        setParams(e.params?.length ? e.params : [emptyRow()]);
        setHeaders(e.headers?.length ? e.headers : [emptyRow()]);
        setBodyType(e.bodyType || 'json'); setBody(e.body || '');
        if (e.auth) setAuth(e.auth);
        setShowHistory(false);
    }

    function loadSample(s) {
        setMethod(s.method); setUrl(s.url); setBody(s.body || ''); setBodyType('json');
        setParams([emptyRow()]); setHeaders([emptyRow()]);
        if (s.body) setReqTab('body');
    }

    function copy(text, what) {
        navigator.clipboard?.writeText(text).then(
            () => addToast(`${what} copied`, 'success'),
            () => addToast('Copy failed', 'error')
        );
    }

    function formatJsonBody() {
        try { setBody(JSON.stringify(JSON.parse(body), null, 2)); } catch { addToast('Body is not valid JSON', 'error'); }
    }

    // Ctrl/Cmd + Enter sends
    useEffect(() => {
        const onKey = (e) => { if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') { e.preventDefault(); send(); } };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    });

    const prettyBody = response
        ? (response.json !== null && response.json !== undefined ? JSON.stringify(response.json, null, 2) : response.body)
        : '';

    return (
        <div className="page">
            <div className="page-header" style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16 }}>
                <div>
                    <h1 className="page-title" style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        API Playground <span className="badge badge-green" style={{ fontSize: 10 }}>Public · No login</span>
                    </h1>
                    <p className="page-subtitle">Send a request to any public API and inspect the response. No account or project needed.</p>
                </div>
                <button className="btn btn-ghost btn-sm" onClick={() => setShowHistory(s => !s)}>
                    <History size={13} /> History {history.length ? `(${history.length})` : ''}
                </button>
            </div>

            {/* Samples */}
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 12 }}>
                <span className="text-xs text-tertiary" style={{ alignSelf: 'center', marginRight: 4 }}>Try:</span>
                {SAMPLES.map(s => (
                    <button key={s.label} className="btn btn-ghost btn-sm" onClick={() => loadSample(s)}>
                        <span className={`method-badge method-${s.method}`}>{s.method}</span> {s.label}
                    </button>
                ))}
            </div>

            {/* Request bar */}
            <div className="card" style={{ padding: 14, marginBottom: 16 }}>
                <div style={{ display: 'flex', gap: 8 }}>
                    <select className="input font-mono" style={{ width: 120, flexShrink: 0, fontWeight: 600 }}
                        value={method} onChange={e => setMethod(e.target.value)} aria-label="HTTP method">
                        {METHODS.map(m => <option key={m} value={m}>{m}</option>)}
                    </select>
                    <input className="input font-mono" style={{ flex: 1 }} placeholder="https://api.example.com/v1/users"
                        value={url} onChange={e => setUrl(e.target.value)} aria-label="Request URL" />
                    <button className="btn btn-primary" onClick={send} disabled={loading || !url.trim()} title="Send (Ctrl+Enter)">
                        {loading ? <><div className="spinner" style={{ width: 14, height: 14 }} /> Sending…</> : <><Send size={14} /> Send</>}
                    </button>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 10, flexWrap: 'wrap' }}>
                    <span className="text-xs text-tertiary">Send:</span>
                    <button className={`btn btn-sm ${mode === 'server' ? 'btn-primary' : 'btn-ghost'}`} onClick={() => setMode('server')}>
                        <Globe2 size={12} /> Via APIForge server
                    </button>
                    <button className={`btn btn-sm ${mode === 'browser' ? 'btn-primary' : 'btn-ghost'}`} onClick={() => setMode('browser')}>
                        <Monitor size={12} /> Directly from browser
                    </button>
                    <span className="text-xs text-tertiary" style={{ marginLeft: 6 }}>
                        {mode === 'server'
                            ? 'No CORS issues. Public URLs only, 15s timeout, 60 req/min.'
                            : 'Can reach localhost/intranet APIs, but the target must allow CORS.'}
                    </span>
                </div>
            </div>

            <div className="grid-2" style={{ alignItems: 'start' }}>
                {/* ── Request config ── */}
                <div className="card" style={{ padding: 16 }}>
                    <Tabs
                        active={reqTab}
                        onChange={setReqTab}
                        tabs={[
                            { id: 'params', label: 'Params', count: Object.keys(rowsToObject(params)).length },
                            { id: 'headers', label: 'Headers', count: Object.keys(rowsToObject(headers)).length },
                            { id: 'body', label: 'Body' },
                            { id: 'auth', label: 'Auth' },
                            { id: 'curl', label: 'cURL' }
                        ]}
                    />

                    {reqTab === 'params' && <KeyValueEditor rows={params} onChange={setParams} keyPlaceholder="query param" />}
                    {reqTab === 'headers' && <KeyValueEditor rows={headers} onChange={setHeaders} keyPlaceholder="Header-Name" />}

                    {reqTab === 'body' && (
                        !canHaveBody ? (
                            <p className="text-sm text-tertiary">{method} requests don't send a body.</p>
                        ) : (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                                <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                                    {['json', 'text', 'none'].map(t => (
                                        <button key={t} className={`btn btn-sm ${bodyType === t ? 'btn-primary' : 'btn-ghost'}`} onClick={() => setBodyType(t)}>
                                            {t === 'json' ? 'JSON' : t === 'text' ? 'Text' : 'None'}
                                        </button>
                                    ))}
                                    {bodyType === 'json' && <button className="btn btn-ghost btn-sm" style={{ marginLeft: 'auto' }} onClick={formatJsonBody}>Format</button>}
                                </div>
                                {bodyType !== 'none' && (
                                    <textarea className="input font-mono" style={{ height: 220, resize: 'vertical' }}
                                        placeholder={bodyType === 'json' ? '{\n  "name": "value"\n}' : 'Raw text body'}
                                        value={body} onChange={e => setBody(e.target.value)} />
                                )}
                            </div>
                        )
                    )}

                    {reqTab === 'auth' && (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                            <div>
                                <label style={label}>Type</label>
                                <select className="input" value={auth.type} onChange={e => setA('type', e.target.value)}>
                                    <option value="none">No auth</option>
                                    <option value="bearer">Bearer token</option>
                                    <option value="basic">Basic auth</option>
                                    <option value="apikey">API key</option>
                                </select>
                            </div>
                            {auth.type === 'bearer' && (
                                <div><label style={label}>Token</label>
                                    <input className="input font-mono" value={auth.token} onChange={e => setA('token', e.target.value)} placeholder="eyJhbGciOi…" /></div>
                            )}
                            {auth.type === 'basic' && (
                                <div className="grid-2">
                                    <div><label style={label}>Username</label><input className="input" value={auth.username} onChange={e => setA('username', e.target.value)} /></div>
                                    <div><label style={label}>Password</label><input className="input" type="password" value={auth.password} onChange={e => setA('password', e.target.value)} /></div>
                                </div>
                            )}
                            {auth.type === 'apikey' && (
                                <>
                                    <div className="grid-2">
                                        <div><label style={label}>Key name</label><input className="input font-mono" value={auth.header} onChange={e => setA('header', e.target.value)} /></div>
                                        <div><label style={label}>Add to</label>
                                            <select className="input" value={auth.in} onChange={e => setA('in', e.target.value)}>
                                                <option value="header">Header</option><option value="query">Query params</option>
                                            </select></div>
                                    </div>
                                    <div><label style={label}>Value</label><input className="input font-mono" value={auth.key} onChange={e => setA('key', e.target.value)} /></div>
                                </>
                            )}
                            <p className="text-xs text-tertiary">Credentials are sent with this request only and are never stored on the server.</p>
                        </div>
                    )}

                    {reqTab === 'curl' && (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                            <div className="code-block" style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-all' }}>{curl}</div>
                            <button className="btn btn-ghost btn-sm" style={{ alignSelf: 'flex-start' }} onClick={() => copy(curl, 'cURL command')}>
                                <Copy size={12} /> Copy cURL
                            </button>
                        </div>
                    )}
                </div>

                {/* ── Response ── */}
                <div className="card" style={{ padding: 16, minHeight: 300 }}>
                    {errorMsg && (
                        <div style={{ padding: 12, borderRadius: 'var(--radius-sm)', background: 'var(--red-bg)', border: '1px solid var(--red-border)', color: 'var(--red)', fontSize: 13, marginBottom: 12 }}>
                            {errorMsg}
                        </div>
                    )}

                    {!response && !errorMsg && !loading && (
                        <div className="empty-state">
                            <Send size={28} />
                            <h3>No response yet</h3>
                            <p>Enter a URL and hit Send. Press Ctrl+Enter to send from anywhere on the page.</p>
                        </div>
                    )}

                    {loading && (
                        <div className="empty-state"><div className="spinner" style={{ width: 22, height: 22 }} /><p>Waiting for response…</p></div>
                    )}

                    {response && (
                        <>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12, flexWrap: 'wrap' }}>
                                <span className={`badge ${statusBadge(response.status)}`} style={{ fontSize: 12 }}>
                                    {response.status} {response.status_text}
                                </span>
                                <span className="text-sm text-secondary" style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                                    <Clock size={12} /> {response.time_ms} ms
                                </span>
                                <span className="text-sm text-secondary">{formatBytes(response.size_bytes)}</span>
                                {response.truncated && <span className="badge badge-amber">Truncated at 2 MB</span>}
                                {response.redirected && <span className="badge badge-blue">Redirected</span>}
                                <button className="btn btn-ghost btn-sm" style={{ marginLeft: 'auto' }} onClick={() => copy(prettyBody, 'Response body')}>
                                    <Copy size={12} /> Copy
                                </button>
                            </div>

                            <Tabs
                                active={resTab}
                                onChange={setResTab}
                                tabs={[
                                    { id: 'body', label: 'Body' },
                                    { id: 'headers', label: 'Headers', count: Object.keys(response.headers || {}).length },
                                    ...(response.request ? [{ id: 'sent', label: 'Request sent' }] : [])
                                ]}
                            />

                            {resTab === 'body' && (
                                <div className="code-block" style={{ maxHeight: 480, overflow: 'auto', whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
                                    {prettyBody || <span className="text-tertiary">(empty body)</span>}
                                </div>
                            )}

                            {resTab === 'headers' && (
                                <table className="table">
                                    <tbody>
                                        {Object.entries(response.headers || {}).map(([k, v]) => (
                                            <tr key={k}>
                                                <td className="font-mono text-sm" style={{ color: 'var(--text-secondary)', width: '38%', verticalAlign: 'top' }}>{k}</td>
                                                <td className="font-mono text-sm" style={{ wordBreak: 'break-all' }}>{v}</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            )}

                            {resTab === 'sent' && response.request && (
                                <div className="code-block" style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-all' }}>
                                    {`${response.request.method} ${response.request.url}\n\n`}
                                    {Object.entries(response.request.headers || {}).map(([k, v]) => `${k}: ${v}\n`).join('')}
                                    {response.request.body ? `\n${response.request.body}` : ''}
                                </div>
                            )}
                        </>
                    )}
                </div>
            </div>

            {/* History drawer */}
            {showHistory && (
                <div className="modal-backdrop" onClick={() => setShowHistory(false)} style={{ justifyContent: 'flex-end', alignItems: 'stretch' }}>
                    <div onClick={e => e.stopPropagation()} style={{ width: 380, maxWidth: '90vw', background: 'var(--bg-surface)', borderLeft: '1px solid var(--border)', padding: 18, overflowY: 'auto' }}>
                        <div style={{ display: 'flex', alignItems: 'center', marginBottom: 14 }}>
                            <div style={{ fontWeight: 600, flex: 1 }}>Recent requests</div>
                            {history.length > 0 && (
                                <button className="btn btn-ghost btn-sm" onClick={() => { setHistory([]); saveHistory([]); }}>Clear</button>
                            )}
                            <button className="btn btn-ghost btn-icon" onClick={() => setShowHistory(false)} aria-label="Close"><X size={14} /></button>
                        </div>
                        {history.length === 0 && <p className="text-sm text-tertiary">Requests you send are saved here, in this browser only.</p>}
                        {history.map(h => (
                            <button key={h.id} className="card card-hover" onClick={() => loadEntry(h)}
                                style={{ width: '100%', textAlign: 'left', padding: '10px 12px', marginBottom: 6, display: 'flex', alignItems: 'center', gap: 8 }}>
                                <span className={`method-badge method-${h.method}`}>{h.method}</span>
                                <span className="font-mono text-sm truncate" style={{ flex: 1, color: 'var(--text-secondary)' }}>{h.url}</span>
                                <span className={`badge ${statusBadge(h.status)}`} style={{ fontSize: 10 }}>{h.status}</span>
                            </button>
                        ))}
                    </div>
                </div>
            )}
        </div>
    );
}