import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Server, Copy, Check, RefreshCw, Sparkles, Trash2, Pencil, Play, X, Power } from 'lucide-react';
import { api, useStore } from '../../store/index.js';
import { CodeSnippet } from '../ui/CodeSnippet.jsx';

const METHOD_CLASS = { GET: 'green', POST: 'blue', PUT: 'amber', PATCH: 'pink', DELETE: 'red' };

const SOURCE = {
    example: { label: 'Spec example', title: 'Taken from the example in your OpenAPI spec' },
    schema: { label: 'Schema', title: 'Generated from the response schema in your spec' },
    fallback: { label: 'Generic', title: 'Your spec has no response schema; generic data was used' },
    ai: { label: 'AI', title: 'Rewritten by AI with realistic values' },
    manual: { label: 'Edited', title: 'Edited by you; regenerating keeps it' },
};

/** Fill {params} with sample values so the route can be called as-is. */
const samplePath = (path) => path.replace(/\{([^}]+)\}/g, (_, name) => (/id$/i.test(name) ? '1' : name.toLowerCase()));

function MethodBadge({ method }) {
    return (
        <span className={`badge badge-${METHOD_CLASS[method] || 'blue'}`} style={{ fontFamily: 'var(--font-mono, monospace)', minWidth: 58, justifyContent: 'center' }}>
            {method}
        </span>
    );
}

function CopyButton({ text, label = 'Copy' }) {
    const [done, setDone] = useState(false);
    return (
        <button className="btn btn-ghost btn-sm" onClick={async () => {
            try { await navigator.clipboard.writeText(text); } catch { /* blocked */ }
            setDone(true); setTimeout(() => setDone(false), 1500);
        }}>
            {done ? <Check size={12} /> : <Copy size={12} />} {done ? 'Copied' : label}
        </button>
    );
}

function prettyBody(body) {
    if (body === null || body === undefined || body === '') return '';
    try { return JSON.stringify(JSON.parse(body), null, 2); } catch { return String(body); }
}

/** Edit status, delay and body of one route. */
function RouteEditor({ projectId, route, onSaved, onClose }) {
    const { addToast } = useStore();
    const [status, setStatus] = useState(route.status);
    const [delay, setDelay] = useState(route.delay_ms || 0);
    const [body, setBody] = useState(prettyBody(route.body));
    const [busy, setBusy] = useState(null);
    const [err, setErr] = useState('');

    async function save() {
        setErr('');
        if (body.trim()) { try { JSON.parse(body); } catch (e) { setErr(`Body is not valid JSON: ${e.message}`); return; } }
        setBusy('save');
        try {
            const updated = await api.mock.updateRoute(projectId, route.id, { status: Number(status), delay_ms: Number(delay), body: body.trim() || null });
            onSaved(updated); addToast('Mock response saved', 'success'); onClose();
        } catch (e) { setErr(e.message); } finally { setBusy(null); }
    }

    async function regenerate() {
        setErr(''); setBusy('ai');
        try {
            const updated = await api.mock.aiRoute(projectId, route.id);
            setBody(prettyBody(updated.body)); onSaved(updated); addToast('AI wrote a new response', 'success');
        } catch (e) { setErr(e.message); } finally { setBusy(null); }
    }

    return (
        <div style={{ padding: 16, background: 'var(--bg-surface)', borderTop: '1px solid var(--border)', display: 'flex', flexDirection: 'column', gap: 10 }}>
            <div style={{ display: 'flex', gap: 10, alignItems: 'flex-end', flexWrap: 'wrap' }}>
                <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 'var(--fs-sm)', color: 'var(--text-secondary)' }}>
                    Status
                    <input className="input" type="number" min="100" max="599" value={status} onChange={e => setStatus(e.target.value)} style={{ width: 100 }} />
                </label>
                <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 'var(--fs-sm)', color: 'var(--text-secondary)' }}>
                    Delay (ms)
                    <input className="input" type="number" min="0" max="10000" step="100" value={delay} onChange={e => setDelay(e.target.value)} style={{ width: 120 }} />
                </label>
                <div style={{ flex: 1 }} />
                <button className="btn btn-ghost btn-sm" onClick={regenerate} disabled={!!busy || !route.body}>
                    {busy === 'ai' ? <div className="spinner" style={{ width: 12, height: 12 }} /> : <Sparkles size={12} />} Regenerate with AI
                </button>
            </div>
            <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 'var(--fs-sm)', color: 'var(--text-secondary)' }}>
                Response body (JSON). Use <code>{'{{params.id}}'}</code> or <code>{'{{query.page}}'}</code> to echo the request.
                <textarea className="input font-mono" rows={12} value={body} onChange={e => setBody(e.target.value)} spellCheck={false}
                    style={{ fontSize: 'var(--fs-sm)', resize: 'vertical' }} />
            </label>
            {err && <div style={{ color: 'var(--red)', fontSize: 'var(--fs-sm)' }}>{err}</div>}
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                <button className="btn btn-ghost btn-sm" onClick={onClose}>Cancel</button>
                <button className="btn btn-primary btn-sm" onClick={save} disabled={!!busy}>
                    {busy === 'save' ? <div className="spinner" style={{ width: 12, height: 12 }} /> : <Check size={12} />} Save
                </button>
            </div>
        </div>
    );
}

/** Call one route from the browser and show the reply, plus code to call it. */
function RouteTry({ baseUrl, route }) {
    const url = baseUrl + samplePath(route.path);
    const request = useMemo(() => ({
        method: route.method, url,
        headers: ['POST', 'PUT', 'PATCH'].includes(route.method) ? { 'Content-Type': 'application/json' } : {},
        body: ['POST', 'PUT', 'PATCH'].includes(route.method) ? '{}' : undefined,
    }), [route.method, url]);
    const [res, setRes] = useState(null);
    const [busy, setBusy] = useState(false);

    async function send() {
        setBusy(true);
        const t0 = performance.now();
        try {
            const r = await fetch(url, { method: request.method, headers: request.headers, body: request.body });
            const text = await r.text();
            setRes({ status: r.status, ms: Math.round(performance.now() - t0), text: prettyBody(text) || '(empty body)' });
        } catch (e) { setRes({ status: 'ERR', ms: 0, text: e.message }); }
        finally { setBusy(false); }
    }

    return (
        <div style={{ padding: 16, background: 'var(--bg-surface)', borderTop: '1px solid var(--border)', display: 'grid', gridTemplateColumns: 'minmax(0,1fr) minmax(0,1fr)', gap: 14 }}>
            <div style={{ minWidth: 0 }}>
                <CodeSnippet request={request} />
            </div>
            <div style={{ minWidth: 0, display: 'flex', flexDirection: 'column', gap: 8 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <button className="btn btn-primary btn-sm" onClick={send} disabled={busy}>
                        {busy ? <div className="spinner" style={{ width: 12, height: 12 }} /> : <Play size={12} />} Send
                    </button>
                    {res && <span style={{ fontSize: 'var(--fs-sm)', color: res.status >= 200 && res.status < 300 ? 'var(--green)' : 'var(--red)' }}>{res.status} · {res.ms} ms</span>}
                </div>
                <pre className="code-block" style={{ margin: 0, maxHeight: 360, overflow: 'auto', whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
                    {res ? res.text : 'Press Send to call the mock from your browser.'}
                </pre>
            </div>
        </div>
    );
}

export function MockServerPage() {
    const { projectId } = useParams();
    const navigate = useNavigate();
    const { addToast, endpoints } = useStore();
    const [data, setData] = useState(null);
    const [loading, setLoading] = useState(true);
    const [busy, setBusy] = useState(null);
    const [open, setOpen] = useState({ id: null, mode: null });
    const [ai, setAi] = useState(null); // { done, total }
    const stopAi = useRef(false);

    const load = useCallback(async () => {
        try { setData(await api.mock.get(projectId)); }
        catch (e) { addToast(e.message, 'error'); }
        finally { setLoading(false); }
    }, [projectId, addToast]);

    useEffect(() => { setLoading(true); load(); return () => { stopAi.current = true; }; }, [load]);

    async function generate() {
        setBusy('generate');
        try {
            const d = await api.mock.generate(projectId, { keepEdited: true });
            setData(d);
            addToast(`Mock server ready: ${d.routes.length} routes${d.kept_edited ? ` (${d.kept_edited} edited kept)` : ''}`, 'success');
        } catch (e) { addToast(e.message, 'error'); }
        finally { setBusy(null); }
    }

    async function improveWithAi() {
        const total = data.ai_remaining;
        if (!total) return;
        stopAi.current = false;
        setAi({ done: 0, total });
        let done = 0; let improved = 0;
        try {
            while (!stopAi.current) {
                const r = await api.mock.aiBatch(projectId, 3);
                done += r.processed; improved += r.improved;
                setAi({ done, total });
                if (!r.processed || !r.remaining) break;
            }
            addToast(improved ? `AI made ${improved} response${improved === 1 ? '' : 's'} more realistic` : 'AI could not improve the responses this time', improved ? 'success' : 'error');
        } catch (e) { addToast(e.message, 'error'); }
        finally { setAi(null); load(); }
    }

    async function toggle() {
        setBusy('toggle');
        try { await api.mock.setEnabled(projectId, !data.mock.enabled); await load(); }
        catch (e) { addToast(e.message, 'error'); } finally { setBusy(null); }
    }

    async function remove() {
        if (!window.confirm('Delete this mock server? Its URL stops working and edited responses are lost.')) return;
        setBusy('delete');
        try { await api.mock.remove(projectId); setData({ mock: null, routes: [] }); addToast('Mock server deleted', 'success'); }
        catch (e) { addToast(e.message, 'error'); } finally { setBusy(null); }
    }

    const onSaved = (updated) => setData(d => ({ ...d, routes: d.routes.map(r => (r.id === updated.id ? updated : r)) }));
    const toggleRow = (id, mode) => setOpen(o => (o.id === id && o.mode === mode ? { id: null, mode: null } : { id, mode }));

    if (loading) return <div className="page"><div className="spinner" /></div>;

    const mock = data?.mock;
    const routes = data?.routes || [];

    return (
        <div className="page">
            <div className="page-header" style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16 }}>
                <div>
                    <h1 className="page-title" style={{ display: 'flex', alignItems: 'center', gap: 8 }}><Server size={20} /> Mock Server</h1>
                    <p className="page-subtitle">A public fake version of this API, built from your spec. Frontend and mobile apps can use it before the backend is ready.</p>
                </div>
                {mock && (
                    <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
                        <button className="btn btn-ghost" onClick={generate} disabled={!!busy || !!ai} title="Rebuild responses from the current spec; your edited responses are kept">
                            {busy === 'generate' ? <div className="spinner" style={{ width: 13, height: 13 }} /> : <RefreshCw size={13} />} Regenerate
                        </button>
                        <button className="btn btn-ghost" onClick={remove} disabled={!!busy || !!ai} aria-label="Delete mock server" title="Delete mock server">
                            <Trash2 size={13} color="var(--red)" />
                        </button>
                    </div>
                )}
            </div>

            {!mock ? (
                <div className="card empty-state" style={{ padding: 40 }}>
                    <Server size={30} color="var(--accent)" />
                    <h3>Create a mock server for this project</h3>
                    <p style={{ maxWidth: 520 }}>
                        HitAPI answers every endpoint in your spec with realistic JSON at a public URL: examples from your spec first,
                        then data generated from the schemas. AI can then make the data more realistic, and you can edit any response.
                    </p>
                    {endpoints?.length === 0 ? (
                        <button className="btn btn-primary" onClick={() => navigate(`/projects/${projectId}/endpoints`)}>Import endpoints first</button>
                    ) : (
                        <button className="btn btn-primary" onClick={generate} disabled={busy === 'generate'}>
                            {busy === 'generate' ? <div className="spinner" style={{ width: 13, height: 13 }} /> : <Server size={13} />} Create mock server
                        </button>
                    )}
                </div>
            ) : (
                <>
                    <div className="card" style={{ padding: 16, marginBottom: 14, display: 'flex', flexDirection: 'column', gap: 12 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                            <span style={{ fontSize: 'var(--fs-sm)', fontWeight: 700, color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '.06em' }}>Mock URL</span>
                            <code style={{ flex: 1, minWidth: 260, fontSize: 'var(--fs-base)', padding: '8px 10px', background: 'var(--bg-input)', borderRadius: 6, overflowX: 'auto', whiteSpace: 'nowrap', opacity: mock.enabled ? 1 : 0.5 }}>
                                {mock.url}
                            </code>
                            <CopyButton text={mock.url} label="Copy URL" />
                            <button className={`btn btn-sm ${mock.enabled ? 'btn-ghost' : 'btn-primary'}`} onClick={toggle} disabled={busy === 'toggle'}>
                                <Power size={12} /> {mock.enabled ? 'Turn off' : 'Turn on'}
                            </button>
                        </div>
                        <div style={{ fontSize: 'var(--fs-sm)', color: 'var(--text-secondary)', lineHeight: 1.6 }}>
                            {mock.enabled ? '● Live' : '○ Off (calls get 503)'} · {routes.length} routes · CORS open · no login needed ·
                            path values fill matching fields (<code>/users/42</code> → <code>"id": 42</code>) · force an error with header <code>X-Mock-Status: 500</code>
                        </div>
                    </div>

                    {(data.ai_remaining > 0 || ai) && (
                        <div className="card" style={{ padding: 14, marginBottom: 14, display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
                            <Sparkles size={16} color="var(--accent)" />
                            <div style={{ flex: 1, minWidth: 240 }}>
                                <div style={{ fontWeight: 600 }}>Make responses realistic with AI</div>
                                <div style={{ fontSize: 'var(--fs-sm)', color: 'var(--text-secondary)' }}>
                                    {ai ? `Rewriting ${ai.done} of ${ai.total}…` : `${data.ai_remaining} response${data.ai_remaining === 1 ? '' : 's'} still use schema-generated data. Spec examples and your edits are not changed.`}
                                </div>
                                {ai && (
                                    <div style={{ height: 4, background: 'var(--border)', borderRadius: 2, marginTop: 8, overflow: 'hidden' }}>
                                        <div style={{ width: `${Math.round((ai.done / Math.max(ai.total, 1)) * 100)}%`, height: '100%', background: 'var(--accent)', transition: 'width .3s' }} />
                                    </div>
                                )}
                            </div>
                            {ai
                                ? <button className="btn btn-ghost btn-sm" onClick={() => { stopAi.current = true; }}>Stop</button>
                                : <button className="btn btn-primary btn-sm" onClick={improveWithAi} disabled={!!busy}><Sparkles size={12} /> Improve with AI</button>}
                        </div>
                    )}

                    <div className="card" style={{ overflow: 'hidden' }}>
                        <table className="table">
                            <thead>
                                <tr>
                                    <th style={{ width: 80 }}>Method</th>
                                    <th>Path</th>
                                    <th style={{ width: 70 }}>Status</th>
                                    <th style={{ width: 110 }}>Data</th>
                                    <th style={{ width: 80 }}>Delay</th>
                                    <th style={{ width: 150 }} />
                                </tr>
                            </thead>
                            <tbody>
                                {routes.map(r => (
                                    <RouteRows key={r.id} r={r} open={open} toggleRow={toggleRow} projectId={projectId} baseUrl={mock.url} onSaved={onSaved} />
                                ))}
                            </tbody>
                        </table>
                    </div>
                </>
            )}
        </div>
    );
}

function RouteRows({ r, open, toggleRow, projectId, baseUrl, onSaved }) {
    const isOpen = open.id === r.id;
    const src = SOURCE[r.source] || SOURCE.schema;
    return (
        <>
            <tr>
                <td><MethodBadge method={r.method} /></td>
                <td className="font-mono" style={{ fontSize: 'var(--fs-base)' }}>{r.path}</td>
                <td className="font-mono" style={{ color: r.status < 300 ? 'var(--green)' : r.status < 400 ? 'var(--amber)' : 'var(--red)' }}>{r.status}</td>
                <td><span className={`badge ${r.source === 'ai' ? 'badge-blue' : r.source === 'manual' ? 'badge-amber' : r.source === 'example' ? 'badge-green' : ''}`} title={src.title}>{src.label}</span></td>
                <td style={{ color: 'var(--text-secondary)' }}>{r.delay_ms ? `${r.delay_ms} ms` : '—'}</td>
                <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                    <button className={`btn btn-sm ${isOpen && open.mode === 'try' ? 'btn-primary' : 'btn-ghost'}`} onClick={() => toggleRow(r.id, 'try')} aria-label={`Try ${r.method} ${r.path}`}>
                        <Play size={12} /> Try
                    </button>{' '}
                    <button className={`btn btn-sm ${isOpen && open.mode === 'edit' ? 'btn-primary' : 'btn-ghost'}`} onClick={() => toggleRow(r.id, 'edit')} aria-label={`Edit ${r.method} ${r.path}`}>
                        {isOpen && open.mode === 'edit' ? <X size={12} /> : <Pencil size={12} />} Edit
                    </button>
                </td>
            </tr>
            {isOpen && (
                <tr>
                    <td colSpan={6} style={{ padding: 0 }}>
                        {open.mode === 'edit'
                            ? <RouteEditor projectId={projectId} route={r} onSaved={onSaved} onClose={() => toggleRow(r.id, 'edit')} />
                            : <RouteTry baseUrl={baseUrl} route={r} />}
                    </td>
                </tr>
            )}
        </>
    );
}
