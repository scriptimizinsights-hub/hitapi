/**
 * /mock-playground — public Mock API Playground (no login).
 *
 * Visitors build routes (method, path, status, headers, delay, body), press Save
 * and get a real temporary mock at services.hitapi.dev/mock/t/<id>/..., then
 * test it right here. Bodies can be generated from a JSON Schema or a sample,
 * and routes can be imported from an OpenAPI spec or from cURL commands (optionally with the real
 * response). The cURL panel shows how to create, update and call the mock from a terminal.
 *
 * The page is prerendered for search engines (scripts/prerender.mjs) with the
 * example routes; saved state (routes, mock id, edit token) lives in this
 * browser's localStorage only.
 * Worker side: routes/mockPlayground.js and services/mock/tempMock.js.
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import {
    Plus, Trash2, Copy, Check, Send, Save, Upload, Sparkles, Shuffle, Wand2, RotateCcw, X, Clock, ArrowRight, Link2, AlignLeft, Terminal,
} from 'lucide-react';
import { parseCurl } from '@hitapi/shared/curl.js';
import { isDailyLimitResponse } from '../../utils/dailyLimit.js';
import { LogoMark } from '../ui/Logo.jsx';
import { PublicFooter } from '../ui/PublicFooter.jsx';
import { CodeSnippet } from '../ui/CodeSnippet.jsx';
import { PLAYGROUND_FAQS } from '../../seo/mockApiContent.js';

const API_BASE = import.meta.env.VITE_API_URL ?? 'https://services.hitapi.dev/api';
const MOCK_HOST = API_BASE.replace(/\/api\/?$/, '');
const STORE_KEY = 'hitapi.mockPlayground.v1';
const METHODS = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'];
const MAX_ROUTES = 25;
const CONTENT_TYPES = ['application/json', 'text/plain', 'application/xml', 'text/csv'];

let nextKey = 1;
const newKey = () => `r${Date.now().toString(36)}${nextKey++}`;

const route = (method, path, status, body, extra = {}) => ({
    key: `ex-${method}-${path}`, method, path, status, delay_ms: 0, headers: [], body, ...extra,
});

const EXAMPLE = [
    route('GET', '/users', 200, JSON.stringify([
        { id: 1, name: 'Asha Rao', email: 'asha@example.com', role: 'admin' },
        { id: 2, name: 'Ben Carter', email: 'ben@example.com', role: 'editor' },
        { id: 3, name: 'Chen Wei', email: 'chen@example.com', role: 'viewer' },
    ], null, 2)),
    route('GET', '/users/{id}', 200, JSON.stringify({
        id: 1, name: 'User {{params.id}}', email: 'user{{params.id}}@example.com', role: 'viewer', created_at: '2026-10-01T09:30:00Z',
    }, null, 2)),
    route('POST', '/users', 201, JSON.stringify({ id: 4, name: 'New user', created: true }, null, 2), {
        headers: [{ name: 'X-Request-Id', value: 'req_7f3a91' }],
    }),
    route('DELETE', '/users/{id}', 204, ''),
    route('GET', '/reports/slow', 503, JSON.stringify({ error: 'Service unavailable', retry_after: 30 }, null, 2), {
        delay_ms: 1500, headers: [{ name: 'Retry-After', value: '30' }],
    }),
];

const METHOD_COLOR = { GET: 'var(--method-get)', POST: 'var(--method-post)', PUT: 'var(--method-put)', PATCH: 'var(--method-patch)', DELETE: 'var(--method-delete)' };

function statusClass(s) {
    if (!s) return 'badge-gray';
    if (s < 300) return 'badge-green';
    if (s < 400) return 'badge-blue';
    if (s < 500) return 'badge-amber';
    return 'badge-red';
}

/** What the worker stores for a route (no UI-only fields). */
const toApi = (r) => ({
    method: r.method,
    path: r.path,
    status: Number(r.status) || 200,
    delay_ms: Number(r.delay_ms) || 0,
    headers: Object.fromEntries(r.headers.filter(h => h.name.trim()).map(h => [h.name.trim(), h.value])),
    body: r.body,
});

/** A request path for testing a route: {id} → 1 */
const samplePath = (path) => path.replace(/\{[^}]+\}/g, '1');

async function post(path, body, method = 'POST') {
    let res;
    try {
        res = await fetch(`${API_BASE}${path}`, {
            method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
        });
    } catch {
        throw new Error('Couldn\'t reach HitAPI. Check your connection and try again; if it keeps failing, HitAPI may be having a problem right now.');
    }
    let data = null;
    try { data = await res.json(); } catch { /* no body */ }
    isDailyLimitResponse(res, data);   // the site-wide "daily limit reached" banner
    if (!res.ok) {
        const err = new Error(data?.error || `Request failed (HTTP ${res.status})`);
        err.status = res.status;
        throw err;
    }
    return data?.data;
}

function load() {
    try {
        const s = JSON.parse(localStorage.getItem(STORE_KEY) || 'null');
        if (s && Array.isArray(s.routes) && s.routes.length) return s;
    } catch { /* storage blocked or bad JSON */ }
    return null;
}

function persist(state) {
    try { localStorage.setItem(STORE_KEY, JSON.stringify(state)); } catch { /* storage blocked */ }
}

function Tabs({ tabs, active, onChange }) {
    return (
        <div className="mpg-tabs" role="tablist">
            {tabs.map(t => (
                <button key={t.id} role="tab" aria-selected={active === t.id} className={active === t.id ? 'on' : ''} onClick={() => onChange(t.id)}>
                    {t.label}{t.count ? <span className="text-accent" style={{ marginLeft: 5 }}>{t.count}</span> : null}
                </button>
            ))}
        </div>
    );
}

export function MockPlaygroundPage() {
    const [routes, setRoutes] = useState(EXAMPLE);
    const [selected, setSelected] = useState(EXAMPLE[1].key);
    const [saved, setSaved] = useState(null); // { id, url, token, expires_at, json }
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState(null);
    const [notice, setNotice] = useState(null);
    const [copied, setCopied] = useState(false);
    const [editTab, setEditTab] = useState('body');
    const [panel, setPanel] = useState(null); // 'import' | 'curl' | 'curlout' | null
    const loaded = useRef(false);

    // Restore this browser's playground (after first render, so the prerendered HTML matches)
    useEffect(() => {
        const s = load();
        if (s) {
            setRoutes(s.routes);
            setSelected(s.selected && s.routes.some(r => r.key === s.selected) ? s.selected : s.routes[0].key);
            if (s.saved && s.saved.expires_at > Date.now()) setSaved(s.saved);
        }
        loaded.current = true;
    }, []);

    useEffect(() => {
        if (loaded.current) persist({ routes, selected, saved });
    }, [routes, selected, saved]);

    const current = routes.find(r => r.key === selected) || routes[0];
    const apiJson = useMemo(() => JSON.stringify(routes.map(toApi)), [routes]);
    const dirty = !saved || saved.json !== apiJson;

    const update = (patch) => setRoutes(rs => rs.map(r => (r.key === current.key ? { ...r, ...patch } : r)));

    function addRoute() {
        if (routes.length >= MAX_ROUTES) { setError(`A playground mock can have up to ${MAX_ROUTES} routes.`); return; }
        let path = '/items';
        for (let n = 2; routes.some(r => r.method === 'GET' && r.path === path); n++) path = `/items${n}`;
        const r = { key: newKey(), method: 'GET', path, status: 200, delay_ms: 0, headers: [], body: '{\n  "ok": true\n}' };
        setRoutes(rs => [...rs, r]);
        setSelected(r.key);
    }

    /** Routes made from cURL commands: an existing route with the same method and path is replaced. */
    function addFromCurl(list, note) {
        let next = [...routes];
        let last = null;
        for (const r of list) {
            const i = next.findIndex(x => x.method === r.method && x.path === r.path);
            const route = { key: i >= 0 ? next[i].key : newKey(), delay_ms: 0, ...r };
            if (i >= 0) next[i] = route;
            else if (next.length < MAX_ROUTES) next.push(route);
            else { setError(`A playground mock can have up to ${MAX_ROUTES} routes.`); break; }
            last = route.key;
        }
        setRoutes(next);
        if (last) setSelected(last);
        setPanel(null);
        setNotice(note);
    }

    function removeRoute(key) {
        if (routes.length === 1) return;
        const i = routes.findIndex(r => r.key === key);
        const rest = routes.filter(r => r.key !== key);
        setRoutes(rest);
        if (key === selected) setSelected(rest[Math.max(0, i - 1)].key);
    }

    function resetExample() {
        if (!window.confirm('Replace your routes with the example? Your mock URL stays the same until you save.')) return;
        setRoutes(EXAMPLE.map(r => ({ ...r, key: newKey() })));
        setSelected(null);
        setError(null);
    }
    useEffect(() => { if (!routes.some(r => r.key === selected)) setSelected(routes[0]?.key); }, [routes, selected]);

    /** Create or update the hosted mock. Returns the saved record. */
    async function save() {
        setSaving(true); setError(null);
        try {
            const body = { routes: routes.map(toApi) };
            let out;
            if (saved?.id) {
                try {
                    out = await post(`/public/mocks/${saved.id}`, { ...body, token: saved.token }, 'PUT');
                    out = { ...out, token: saved.token };
                } catch (e) {
                    if (e.status !== 404 && e.status !== 403) throw e;
                    out = await post('/public/mocks', body); // expired or not ours: new URL
                    setNotice('Your previous mock had expired, so this one has a new URL.');
                }
            } else {
                out = await post('/public/mocks', body);
            }
            // keep the editor in step with what the server stored (e.g. "users" → "/users")
            const normalized = routes.map((r, i) => (out.routes[i] ? { ...r, method: out.routes[i].method, path: out.routes[i].path } : r));
            const rec = { id: out.id, url: out.url, token: out.token, expires_at: out.expires_at, json: JSON.stringify(normalized.map(toApi)) };
            setRoutes(normalized);
            setSaved(rec);
            return rec;
        } catch (e) {
            setError(e.message);
            return null;
        } finally {
            setSaving(false);
        }
    }

    async function copyUrl() {
        try { await navigator.clipboard.writeText(saved.url); } catch { /* clipboard blocked */ }
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
    }

    const expires = saved ? new Date(saved.expires_at).toLocaleDateString(undefined, { day: 'numeric', month: 'short' }) : null;

    return (
        <div style={{ minHeight: '100vh', background: 'var(--bg-app)' }}>
            <style>{CSS}</style>
            <nav className="mpg-nav">
                <a href="/" className="mpg-brand">
                    <LogoMark size={26} />
                    <span>HitAPI</span>
                    <span className="mpg-brand-sub">· Mock Playground</span>
                </a>
                <a href="/mock-api-server" className="mpg-nav-link">Mock API server</a>
                <a href="/playground" className="mpg-nav-link">API Playground</a>
                <a href="/login" className="btn btn-primary btn-sm">Sign up free</a>
            </nav>

            <main className="mpg-main">
                <header className="mpg-head">
                    <div>
                        <h1>Mock API Playground <span className="badge badge-green">Free · No login</span></h1>
                        <p>
                            Create a mock REST API online in seconds: add routes, set the status, headers, delay and JSON body,
                            press Save and call your mock URL from anywhere.
                        </p>
                    </div>
                </header>

                {/* ── Mock URL + actions ── */}
                <div className="card mpg-urlbar">
                    <div className="mpg-url">
                        <span className="mpg-label">Mock URL</span>
                        {saved ? (
                            <code title={saved.url}>{saved.url}</code>
                        ) : (
                            <span className="mpg-muted">Press Save to get a public URL for these routes</span>
                        )}
                    </div>
                    <div className="mpg-actions">
                        {saved && (
                            <>
                                <span className="mpg-muted mpg-expiry"><Clock size={12} /> Live until {expires}</span>
                                <button className="btn btn-ghost btn-sm" onClick={copyUrl}>{copied ? <Check size={13} /> : <Copy size={13} />} {copied ? 'Copied' : 'Copy URL'}</button>
                                <CopyButton className="btn btn-ghost btn-sm mpg-copycurl" label="Copy cURL" title={`cURL for ${current.method} ${current.path}`} text={callCurl(saved.url, current)} />
                            </>
                        )}
                        <button className="btn btn-ghost btn-sm mpg-curlout-btn" onClick={() => setPanel(p => (p === 'curlout' ? null : 'curlout'))} title="Create, update and call this mock from a terminal"><Terminal size={13} /> cURL</button>
                        <button className="btn btn-ghost btn-sm" onClick={() => setPanel(p => (p === 'import' ? null : 'import'))}><Upload size={13} /> Import OpenAPI</button>
                        <button className="btn btn-ghost btn-sm" onClick={resetExample} title="Load the example routes"><RotateCcw size={13} /> Example</button>
                        <button className="btn btn-primary btn-sm" onClick={save} disabled={saving || (!dirty && !!saved)}>
                            <Save size={13} /> {saving ? 'Saving…' : saved ? (dirty ? 'Save changes' : 'Saved') : 'Save & get URL'}
                        </button>
                    </div>
                </div>

                {error && <div className="mpg-alert mpg-alert-red" role="alert"><span>{error}</span><button className="btn btn-ghost btn-icon" onClick={() => setError(null)} aria-label="Dismiss"><X size={12} /></button></div>}
                {notice && <div className="mpg-alert mpg-alert-amber"><span>{notice}</span><button className="btn btn-ghost btn-icon" onClick={() => setNotice(null)} aria-label="Dismiss"><X size={12} /></button></div>}

                {panel === 'curl' && <CurlImportPanel onClose={() => setPanel(null)} onAdd={addFromCurl} />}
                {panel === 'curlout' && <CurlOutPanel routes={routes} saved={saved} dirty={dirty} onClose={() => setPanel(null)} />}
                {panel === 'import' && (
                    <ImportPanel
                        onClose={() => setPanel(null)}
                        onImport={(list, note) => {
                            const rs = list.map(r => ({
                                key: newKey(), method: r.method, path: r.path, status: r.status, delay_ms: 0,
                                headers: [], body: r.body,
                            }));
                            setRoutes(rs); setSelected(rs[0].key); setPanel(null); setNotice(note);
                        }}
                    />
                )}

                <div className="mpg-grid">
                    {/* ── Routes ── */}
                    <section className="card mpg-routes" aria-label="Routes">
                        <div className="mpg-section-title">
                            <span>Routes <span className="mpg-muted">({routes.length}/{MAX_ROUTES})</span></span>
                            <span className="mpg-route-adds">
                                <button className="btn btn-ghost btn-sm mpg-fromcurl" onClick={() => setPanel(p => (p === 'curl' ? null : 'curl'))} title="Make routes from cURL commands"><Terminal size={13} /> From cURL</button>
                                <button className="btn btn-ghost btn-sm" onClick={addRoute}><Plus size={13} /> Add</button>
                            </span>
                        </div>
                        <ul>
                            {routes.map(r => (
                                <li key={r.key} className={r.key === current.key ? 'on' : ''}>
                                    <button className="mpg-route-btn" onClick={() => setSelected(r.key)}>
                                        <span className="mpg-method" style={{ color: METHOD_COLOR[r.method] }}>{r.method}</span>
                                        <span className="mpg-path">{r.path || '/'}</span>
                                        <span className={`badge ${statusClass(Number(r.status))}`}>{r.status}</span>
                                    </button>
                                    {routes.length > 1 && (
                                        <button className="btn btn-ghost btn-icon mpg-del" onClick={() => removeRoute(r.key)} aria-label={`Delete ${r.method} ${r.path}`}><Trash2 size={12} /></button>
                                    )}
                                </li>
                            ))}
                        </ul>
                    </section>

                    {/* ── Route editor ── */}
                    <section className="card mpg-editor" aria-label="Response">
                        <div className="mpg-row">
                            <label className="sr-only" htmlFor="mpg-method">Method</label>
                            <select id="mpg-method" className="input font-mono" style={{ width: 112, fontWeight: 600, color: METHOD_COLOR[current.method] }}
                                value={current.method} onChange={e => update({ method: e.target.value })}>
                                {METHODS.map(m => <option key={m} value={m}>{m}</option>)}
                            </select>
                            <label className="sr-only" htmlFor="mpg-path">Path</label>
                            <input id="mpg-path" className="input font-mono" value={current.path} placeholder="/users/{id}"
                                onChange={e => update({ path: e.target.value })} spellCheck={false} />
                        </div>
                        <div className="mpg-row mpg-small">
                            <label>Status
                                <input className="input font-mono" type="number" min="200" max="599" value={current.status}
                                    onChange={e => update({ status: e.target.value })} />
                            </label>
                            <label>Delay (ms)
                                <input className="input font-mono" type="number" min="0" max="10000" step="100" value={current.delay_ms}
                                    onChange={e => update({ delay_ms: e.target.value })} />
                            </label>
                            <label>Content-Type
                                <select className="input" value={contentTypeOf(current)} onChange={e => setContentType(current, e.target.value, update)}>
                                    {CONTENT_TYPES.map(c => <option key={c} value={c}>{c}</option>)}
                                </select>
                            </label>
                        </div>

                        <Tabs active={editTab} onChange={setEditTab} tabs={[
                            { id: 'body', label: 'Response body' },
                            { id: 'headers', label: 'Response headers', count: current.headers.filter(h => h.name.trim() && h.name.toLowerCase() !== 'content-type').length },
                        ]} />

                        {editTab === 'body' ? (
                            <>
                                <div className="mpg-row mpg-tools">
                                    <button className="btn btn-ghost btn-sm" onClick={() => setPanel(p => (p === 'generate' ? null : 'generate'))}><Sparkles size={13} /> Generate data</button>
                                    <button className="btn btn-ghost btn-sm" onClick={() => {
                                        try { update({ body: JSON.stringify(JSON.parse(current.body), null, 2) }); setError(null); }
                                        catch { setError('The body is not valid JSON, so it cannot be formatted.'); }
                                    }}><AlignLeft size={13} /> Format JSON</button>
                                    <span className="mpg-muted mpg-hint">Use <code>{'{{params.id}}'}</code> or <code>{'{{query.page}}'}</code> to echo the request</span>
                                </div>
                                {panel === 'generate' && (
                                    <GeneratePanel current={current} onUse={(text) => update({ body: text })} onClose={() => setPanel(null)} />
                                )}
                                <label className="sr-only" htmlFor="mpg-body">Response body</label>
                                <textarea id="mpg-body" className="input font-mono mpg-body" spellCheck={false}
                                    value={current.body} onChange={e => update({ body: e.target.value })}
                                    placeholder={Number(current.status) === 204 ? '204 responses have no body' : '{ "id": 1 }'} />
                                <JsonCheck body={current.body} type={contentTypeOf(current)} />
                            </>
                        ) : (
                            <HeaderEditor rows={current.headers} onChange={headers => update({ headers })} />
                        )}
                    </section>

                    {/* ── Tester ── */}
                    <Tester current={current} saved={saved} dirty={dirty} save={save} saving={saving} />
                </div>

                <section className="mpg-content" aria-labelledby="how">
                    <h2 id="how">How the mock playground works</h2>
                    <ol className="mpg-steps">
                        <li><strong>Add routes.</strong> Pick a method and a path such as <code>/users/{'{id}'}</code>, or import them from an OpenAPI or Swagger spec.</li>
                        <li><strong>Shape each response.</strong> Set the status code, headers, a delay and the body. Paste a JSON Schema or a sample and press Generate to fill it with realistic data.</li>
                        <li><strong>Save and call it.</strong> You get a public URL on <code>services.hitapi.dev</code>. Call it from this page, cURL, Postman or your app. It stays live for 7 days after your last save.</li>
                    </ol>
                    <p>
                        Need a mock that never expires, built from your whole API spec and kept in a team project? See the{' '}
                        <a href="/mock-api-server">HitAPI mock API server</a>. To call real APIs instead, use the <a href="/playground">API Playground</a>.
                    </p>
                    <h2 id="faq">Mock playground FAQ</h2>
                    <div className="mpg-faq">
                        {PLAYGROUND_FAQS.map(f => (
                            <div key={f.q}><h3>{f.q}</h3><p>{f.a}</p></div>
                        ))}
                    </div>
                    <div className="card mpg-cta">
                        <div>
                            <h2>Keep your mocks and test your real API</h2>
                            <p>With a free account, mocks are generated from your spec, never expire, and sit next to AI-written tests for the real API.</p>
                        </div>
                        <a href="/login" className="btn btn-primary">Sign up free <ArrowRight size={14} /></a>
                    </div>
                </section>
            </main>
            <PublicFooter />
        </div>
    );
}

// ── Content-Type lives in the headers list ──────────────────────────────────

function contentTypeOf(r) {
    const h = r.headers.find(x => x.name.trim().toLowerCase() === 'content-type');
    return h ? h.value.split(';')[0].trim() : 'application/json';
}

function setContentType(r, value, update) {
    const rest = r.headers.filter(x => x.name.trim().toLowerCase() !== 'content-type');
    update({ headers: value === 'application/json' ? rest : [{ name: 'Content-Type', value }, ...rest] });
}

function JsonCheck({ body, type }) {
    if (type !== 'application/json' || !body.trim()) return null;
    // Templates like {{params.id}} inside strings are fine; outside strings they're not JSON.
    try { JSON.parse(body); return null; } catch (e) {
        return <p className="mpg-warn">Not valid JSON ({e.message.replace(/^JSON\.parse: /, '')}). It will be sent exactly as written.</p>;
    }
}

function HeaderEditor({ rows, onChange }) {
    const visible = rows.map((r, i) => ({ ...r, i })).filter(r => r.name.trim().toLowerCase() !== 'content-type');
    const set = (i, patch) => onChange(rows.map((r, idx) => (idx === i ? { ...r, ...patch } : r)));
    return (
        <div className="mpg-headers">
            {visible.length === 0 && <p className="mpg-muted">No custom headers. Content-Type is set above.</p>}
            {visible.map(r => (
                <div key={r.i} className="mpg-row">
                    <input className="input font-mono" placeholder="X-Header-Name" value={r.name} onChange={e => set(r.i, { name: e.target.value })} aria-label="Header name" />
                    <input className="input font-mono" placeholder="value" value={r.value} onChange={e => set(r.i, { value: e.target.value })} aria-label="Header value" />
                    <button className="btn btn-ghost btn-icon" onClick={() => onChange(rows.filter((_, idx) => idx !== r.i))} aria-label="Remove header"><Trash2 size={12} /></button>
                </div>
            ))}
            <button className="btn btn-ghost btn-sm" onClick={() => onChange([...rows, { name: '', value: '' }])}><Plus size={13} /> Add header</button>
            <p className="mpg-muted">Cookies, redirects, CORS and security headers can't be set in the playground.</p>
        </div>
    );
}

const GENERATE_PLACEHOLDER = `{
  "type": "object",
  "properties": {
    "id": { "type": "integer" },
    "name": { "type": "string" },
    "email": { "type": "string", "format": "email" },
    "plan": { "type": "string", "enum": ["free", "pro"] }
  }
}`;

function GeneratePanel({ current, onUse, onClose }) {
    const [input, setInput] = useState(() => {
        try { JSON.parse(current.body); return current.body; } catch { return GENERATE_PLACEHOLDER; }
    });
    const [seed, setSeed] = useState(1);
    const [busy, setBusy] = useState(false);
    const [err, setErr] = useState(null);

    async function run(nextSeed) {
        setBusy(true); setErr(null);
        try {
            const out = await post('/public/mock-tools/generate', { input, seed: nextSeed });
            onUse(JSON.stringify(out.data, null, 2));
            setSeed(nextSeed);
        } catch (e) { setErr(e.message); } finally { setBusy(false); }
    }

    return (
        <div className="mpg-panel">
            <div className="mpg-section-title">
                <span><Wand2 size={13} /> Generate realistic data</span>
                <button className="btn btn-ghost btn-icon" onClick={onClose} aria-label="Close"><X size={12} /></button>
            </div>
            <p className="mpg-muted">Paste a JSON Schema, or a sample JSON object or array. Field names drive the values: <code>email</code>, <code>created_at</code>, <code>price</code>, <code>avatar_url</code> and so on.</p>
            <textarea className="input font-mono" rows={8} value={input} onChange={e => setInput(e.target.value)} spellCheck={false} aria-label="JSON Schema or sample" />
            {err && <p className="mpg-warn">{err}</p>}
            <div className="mpg-row">
                <button className="btn btn-primary btn-sm" onClick={() => run(seed)} disabled={busy}><Sparkles size={13} /> {busy ? 'Generating…' : 'Generate into body'}</button>
                <button className="btn btn-ghost btn-sm" onClick={() => run(seed + 1)} disabled={busy}><Shuffle size={13} /> New values</button>
            </div>
        </div>
    );
}

function ImportPanel({ onImport, onClose }) {
    const [url, setUrl] = useState('');
    const [text, setText] = useState('');
    const [busy, setBusy] = useState(false);
    const [err, setErr] = useState(null);

    async function run() {
        setBusy(true); setErr(null);
        try {
            const out = await post('/public/mock-tools/import', text.trim() ? { spec: text } : { url: url.trim() });
            const name = out.title ? `"${out.title}"` : 'the spec';
            onImport(out.routes, out.total > out.routes.length
                ? `Imported the first ${out.routes.length} of ${out.total} endpoints from ${name} (the playground allows ${MAX_ROUTES}). Press Save to publish.`
                : `Imported ${out.routes.length} routes from ${name}. Press Save to publish.`);
        } catch (e) { setErr(e.message); } finally { setBusy(false); }
    }

    return (
        <div className="card mpg-panel mpg-import">
            <div className="mpg-section-title">
                <span><Upload size={13} /> Import routes from an OpenAPI / Swagger spec</span>
                <button className="btn btn-ghost btn-icon" onClick={onClose} aria-label="Close"><X size={12} /></button>
            </div>
            <div className="mpg-row">
                <label className="sr-only" htmlFor="mpg-spec-url">Spec URL</label>
                <input id="mpg-spec-url" className="input font-mono" placeholder="https://petstore3.swagger.io/api/v3/openapi.json" value={url}
                    onChange={e => setUrl(e.target.value)} disabled={!!text.trim()} />
            </div>
            <textarea className="input font-mono" rows={5} placeholder="…or paste the spec JSON here" value={text} onChange={e => setText(e.target.value)} spellCheck={false} aria-label="Spec JSON" />
            {err && <p className="mpg-warn">{err}</p>}
            <div className="mpg-row">
                <button className="btn btn-primary btn-sm" onClick={run} disabled={busy || (!url.trim() && !text.trim())}>{busy ? 'Importing…' : 'Import'}</button>
                <span className="mpg-muted">Replaces the current routes. Responses come from the spec's examples, or are generated from its schemas.</span>
            </div>
        </div>
    );
}

// ── cURL ────────────────────────────────────────────────────────────────────

/** Quote for a POSIX shell: 'it'\''s' */
const sq = (s) => `'${String(s).replace(/'/g, `'\\''`)}'`;
/** curl that calls one route of a saved mock */
const callCurl = (url, r) => {
    const path = samplePath(r.path || '/');
    const hasBody = ['POST', 'PUT', 'PATCH'].includes(r.method);
    return `curl -X ${r.method} ${sq(`${url}${path.startsWith('/') ? path : `/${path}`}`)}${hasBody ? ` -H 'Content-Type: application/json' -d ${sq('{"name": "Test"}')}` : ''}`;
};
/** A route as the API takes it, with a JSON body as an object so the command reads well */
const forCurl = (r) => {
    const a = toApi(r);
    try { if (a.body.trim()) a.body = JSON.parse(a.body); } catch { /* keep text */ }
    if (!Object.keys(a.headers).length) delete a.headers;
    if (!a.delay_ms) delete a.delay_ms;
    return a;
};

function CopyButton({ text, label = 'Copy', className = 'btn btn-ghost btn-sm', title }) {
    const [done, setDone] = useState(false);
    return (
        <button className={className} title={title} onClick={async () => { try { await navigator.clipboard.writeText(text); } catch { /* blocked */ } setDone(true); setTimeout(() => setDone(false), 1500); }}>
            {done ? <Check size={13} /> : <Copy size={13} />} {done ? 'Copied' : label}
        </button>
    );
}

/** Paste cURL commands → routes. With "real response", each is sent once from HitAPI cloud and its answer kept. */
function CurlImportPanel({ onAdd, onClose }) {
    const [text, setText] = useState('');
    const [real, setReal] = useState(true);
    const [busy, setBusy] = useState(false);
    const [err, setErr] = useState(null);

    async function run() {
        setBusy(true); setErr(null);
        try {
            const cmds = text.split(/\n\s*(?=(?:\$\s+)?curl\s)/i).map(x => x.trim()).filter(Boolean);
            if (!cmds.length) throw new Error('Paste a cURL command (it starts with "curl").');
            const out = [];
            for (const cmd of cmds) {
                let c;
                try { c = parseCurl(cmd); } catch (e) { throw new Error(cmds.length > 1 ? `Command ${out.length + 1}: ${e.message}` : e.message); }
                let u;
                try { u = new URL(/^[a-z][\w+.-]*:\/\//i.test(c.url) ? c.url : `https://${c.url}`); } catch { throw new Error(`Can't read the URL "${c.url}".`); }
                const method = METHODS.includes(String(c.method).toUpperCase()) ? String(c.method).toUpperCase() : 'GET';
                const path = decodeURIComponent(u.pathname) || '/';
                let route = { method, path, status: method === 'POST' ? 201 : method === 'DELETE' ? 204 : 200, headers: [], body: '' };
                if (real) {
                    const headers = Object.fromEntries((c.headers || []).map(h => [h.key, h.value]));
                    const r = await post('/public/request', { method: c.method, url: u.href, headers, ...(c.body ? { body: c.body } : {}) });
                    let body = r.body || '';
                    if (/json/i.test(r.content_type || '')) { try { body = JSON.stringify(JSON.parse(body), null, 2); } catch { /* as is */ } }
                    const type = (r.content_type || '').split(';')[0].trim();
                    route = { ...route, status: r.status, body, headers: type && type !== 'application/json' ? [{ name: 'Content-Type', value: type }] : [] };
                } else if (method !== 'DELETE') {
                    let echo = null;
                    try { echo = c.body ? JSON.stringify(JSON.parse(c.body), null, 2) : null; } catch { /* not JSON */ }
                    route.body = echo && method !== 'GET' ? echo : '{\n  "ok": true\n}';
                }
                out.push(route);
            }
            const what = out.map(r => `${r.method} ${r.path}${real ? ` (${r.status})` : ''}`).join(', ');
            onAdd(out, `Added from cURL: ${what}.${real ? ' Responses are the real ones, captured just now.' : ''} Press Save to publish.`);
        } catch (e) { setErr(e.message); } finally { setBusy(false); }
    }

    return (
        <div className="card mpg-panel mpg-curlin">
            <div className="mpg-section-title">
                <span><Terminal size={13} /> Make routes from cURL</span>
                <button className="btn btn-ghost btn-icon" onClick={onClose} aria-label="Close"><X size={12} /></button>
            </div>
            <textarea className="input font-mono" rows={5} spellCheck={false} aria-label="cURL commands" value={text} onChange={e => setText(e.target.value)}
                placeholder={"curl https://api.example.com/v1/users\ncurl -X POST https://api.example.com/v1/users -H 'Content-Type: application/json' -d '{\"name\": \"Asha\"}'"} />
            <label className="mpg-check"><input type="checkbox" checked={real} onChange={e => setReal(e.target.checked)} />
                <span>Use the real response: send each command once from HitAPI cloud and keep its status, body and Content-Type <span className="mpg-muted">(public URLs only)</span></span></label>
            {err && <p className="mpg-warn" role="alert">{err}</p>}
            <div className="mpg-row">
                <button className="btn btn-primary btn-sm mpg-curlin-go" onClick={run} disabled={busy || !text.trim()}>{busy ? (real ? 'Sending…' : 'Adding…') : 'Add routes'}</button>
                <span className="mpg-muted">One route per command (method and path; the host and query are dropped). A route with the same method and path is replaced.</span>
            </div>
        </div>
    );
}

/** Create, update and call the mock from a terminal. */
function CurlOutPanel({ routes, saved, dirty, onClose }) {
    const payload = JSON.stringify({ routes: routes.map(forCurl) }, null, 2);
    const create = `curl -X POST ${sq(`${API_BASE}/public/mocks`)} \\\n  -H 'Content-Type: application/json' \\\n  -d ${sq(payload)}`;
    const update = saved && `curl -X PUT ${sq(`${API_BASE}/public/mocks/${saved.id}`)} \\\n  -H 'Content-Type: application/json' \\\n  -d ${sq(JSON.stringify({ token: saved.token, routes: routes.map(forCurl) }, null, 2))}`;
    const calls = saved ? routes.map(r => callCurl(saved.url, r)).join('\n') : '';
    const Block = ({ title, note, text, cls }) => (
        <div className={`mpg-curlblock ${cls || ''}`}>
            <div className="mpg-curlblock-head"><strong>{title}</strong><CopyButton text={text} /></div>
            {note && <p className="mpg-muted">{note}</p>}
            <pre className="font-mono">{text}</pre>
        </div>
    );
    return (
        <div className="card mpg-panel mpg-curlout">
            <div className="mpg-section-title">
                <span><Terminal size={13} /> This mock with cURL</span>
                <button className="btn btn-ghost btn-icon" onClick={onClose} aria-label="Close"><X size={12} /></button>
            </div>
            <Block cls="mpg-curl-create" title="Create it (a new mock URL)" note="No account needed. The answer has the mock's url, and a token that lets you update it. It stays live for 7 days after the last save." text={create} />
            {saved && <Block cls="mpg-curl-update" title="Update this mock (same URL)" note={`Keep the token private: anyone with it can change this mock.${dirty ? ' This has your unsaved changes.' : ''}`} text={update} />}
            {saved ? <Block cls="mpg-curl-calls" title="Call it" text={calls} /> : <p className="mpg-muted">Save first to get the commands that call your mock.</p>}
        </div>
    );
}

function Tester({ current, saved, dirty, save, saving }) {
    const [path, setPath] = useState(samplePath(current.path));
    const [force, setForce] = useState('');
    const [reqBody, setReqBody] = useState('{\n  "name": "Test"\n}');
    const [res, setRes] = useState(null);
    const [busy, setBusy] = useState(false);
    const [tab, setTab] = useState('body');

    useEffect(() => { setPath(samplePath(current.path)); setRes(null); }, [current.key, current.path]);

    const hasBody = ['POST', 'PUT', 'PATCH'].includes(current.method);
    const base = saved?.url || `${MOCK_HOST}/mock/t/<save first>`;
    const fullUrl = `${base}${path.startsWith('/') ? path : '/' + path}`;
    const reqHeaders = { ...(hasBody ? { 'Content-Type': 'application/json' } : {}), ...(force ? { 'X-Mock-Status': force } : {}) };
    const snippetReq = useMemo(() => ({ method: current.method, url: fullUrl, headers: reqHeaders, body: hasBody ? reqBody : '' }),
        [current.method, fullUrl, force, hasBody, reqBody]); // eslint-disable-line react-hooks/exhaustive-deps

    async function send() {
        setBusy(true);
        try {
            const rec = dirty ? await save() : saved;
            if (!rec) return;
            const url = `${rec.url}${path.startsWith('/') ? path : '/' + path}`;
            const started = performance.now();
            const r = await fetch(url, { method: current.method, headers: reqHeaders, body: hasBody ? reqBody : undefined });
            const text = await r.text();
            let body = text;
            if (/json/i.test(r.headers.get('content-type') || '')) { try { body = JSON.stringify(JSON.parse(text), null, 2); } catch { /* as is */ } }
            const headers = [];
            r.headers.forEach((v, k) => headers.push([k, v]));
            setRes({ status: r.status, ms: Math.round(performance.now() - started), body, headers, size: new Blob([text]).size });
        } catch (e) {
            setRes({ status: 0, ms: 0, body: `Request failed: ${e.message}`, headers: [], size: 0 });
        } finally {
            setBusy(false);
        }
    }

    return (
        <section className="card mpg-tester" aria-label="Test the mock">
            <div className="mpg-section-title"><span><Send size={13} /> Test your mock</span></div>
            <div className="mpg-row">
                <span className="mpg-method mpg-method-box" style={{ color: METHOD_COLOR[current.method] }}>{current.method}</span>
                <label className="sr-only" htmlFor="mpg-test-path">Request path</label>
                <input id="mpg-test-path" className="input font-mono" value={path} onChange={e => setPath(e.target.value)} spellCheck={false} />
            </div>
            <div className="mpg-row">
                <label className="sr-only" htmlFor="mpg-force">Force a status</label>
                <select id="mpg-force" className="input" value={force} onChange={e => setForce(e.target.value)}>
                    <option value="">Route's response</option>
                    <option value="400">Force 400 Bad Request</option>
                    <option value="401">Force 401 Unauthorized</option>
                    <option value="404">Force 404 Not Found</option>
                    <option value="429">Force 429 Too Many Requests</option>
                    <option value="500">Force 500 Server Error</option>
                </select>
                <button className="btn btn-primary" onClick={send} disabled={busy || saving} style={{ flexShrink: 0 }}>
                    <Send size={14} /> {busy ? 'Sending…' : dirty ? 'Save & send' : 'Send'}
                </button>
            </div>
            {hasBody && (
                <>
                    <label className="mpg-muted" htmlFor="mpg-req-body">Request body (the mock answers the same whatever you send)</label>
                    <textarea id="mpg-req-body" className="input font-mono" rows={3} value={reqBody} onChange={e => setReqBody(e.target.value)} spellCheck={false} />
                </>
            )}

            <Tabs active={tab} onChange={setTab} tabs={[
                { id: 'body', label: 'Response' },
                { id: 'headers', label: 'Headers', count: res?.headers.length },
                { id: 'code', label: 'Code' },
            ]} />
            {tab === 'code' ? (
                <>
                    {!saved && <p className="mpg-muted">Save first to get your mock URL; the code updates with it.</p>}
                    <CodeSnippet request={snippetReq} />
                </>
            ) : !res ? (
                <p className="mpg-muted mpg-empty">
                    {saved ? 'Press Send to call your mock.' : 'Press Save & send: your routes get a public URL and this request is sent to it.'}
                </p>
            ) : (
                <>
                    <div className="mpg-status" aria-live="polite">
                        <span className={`badge ${statusClass(res.status)}`}>{res.status || 'Error'}</span>
                        <span><Clock size={12} /> {res.ms} ms</span>
                        <span>{res.size} B</span>
                        {saved && <a href={fullUrl} target="_blank" rel="nofollow noopener" className="mpg-open"><Link2 size={12} /> Open</a>}
                    </div>
                    {tab === 'body' ? (
                        <pre className="mpg-pre">{res.body || '(no body)'}</pre>
                    ) : (
                        <table className="mpg-htable"><tbody>
                            {res.headers.map(([k, v]) => <tr key={k}><th>{k}</th><td>{v}</td></tr>)}
                        </tbody></table>
                    )}
                </>
            )}
        </section>
    );
}

const CSS = `
.sr-only { position: absolute; width: 1px; height: 1px; padding: 0; margin: -1px; overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap; border: 0; }
.mpg-nav { position: sticky; top: 0; z-index: 50; background: rgba(10,10,15,0.9); backdrop-filter: blur(12px); border-bottom: 1px solid var(--border);
  display: flex; align-items: center; gap: 18px; padding: 12px 32px; }
.mpg-brand { display: flex; align-items: center; gap: 8px; color: var(--text-primary); font-weight: 600; font-size: var(--fs-lg); flex: 1; min-width: 0; }
.mpg-brand-sub { font-size: var(--fs-sm); color: var(--text-tertiary); font-weight: 400; white-space: nowrap; }
.mpg-nav-link { font-size: var(--fs-base); color: var(--text-secondary); white-space: nowrap; }
.mpg-main { max-width: 1440px; margin: 0 auto; padding: 24px 24px 64px; }
.mpg-head h1 { font-size: clamp(24px, 3vw, 32px); font-weight: 700; letter-spacing: -0.02em; margin: 0 0 6px; display: flex; align-items: center; gap: 12px; flex-wrap: wrap; }
.mpg-head h1 .badge { font-size: var(--fs-xs); }
.mpg-head p { color: var(--text-secondary); font-size: var(--fs-md); margin: 0 0 18px; max-width: 760px; line-height: 1.6; }
.mpg-muted { color: var(--text-tertiary); font-size: var(--fs-sm); }
.mpg-urlbar { display: flex; align-items: center; justify-content: space-between; gap: 12px; padding: 12px 14px; margin-bottom: 12px; flex-wrap: wrap; }
.mpg-url { display: flex; align-items: center; gap: 10px; min-width: 0; flex: 1 1 320px; }
.mpg-url code { font-family: var(--font-mono, ui-monospace, monospace); font-size: var(--fs-base); color: var(--text-mono); background: var(--bg-input); padding: 6px 10px; border-radius: 6px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; min-width: 0; }
.mpg-label { font-size: var(--fs-xs); font-weight: 600; letter-spacing: .08em; text-transform: uppercase; color: var(--text-tertiary); white-space: nowrap; }
.mpg-actions { display: flex; gap: 6px; align-items: center; flex-wrap: wrap; }
.mpg-expiry { display: inline-flex; align-items: center; gap: 4px; margin-right: 4px; }
.mpg-alert { display: flex; align-items: center; gap: 8px; justify-content: space-between; padding: 8px 12px; border-radius: var(--radius-sm); font-size: var(--fs-base); margin-bottom: 12px; }
.mpg-alert-red { background: var(--red-bg); border: 1px solid var(--red-border); color: var(--red); }
.mpg-alert-amber { background: var(--amber-bg); border: 1px solid var(--amber-border); color: var(--amber); }
.mpg-grid { display: grid; grid-template-columns: 260px minmax(0, 1.15fr) minmax(0, 1fr); gap: 12px; align-items: start; }
.mpg-grid > .card { padding: 14px; min-width: 0; }
.mpg-section-title { display: flex; align-items: center; justify-content: space-between; gap: 8px; font-size: var(--fs-base); font-weight: 600; margin-bottom: 10px; }
.mpg-section-title > span { display: inline-flex; align-items: center; gap: 6px; }
.mpg-routes ul { list-style: none; margin: 0; padding: 0; display: grid; gap: 2px; }
.mpg-routes li { display: flex; align-items: center; border-radius: 8px; }
.mpg-routes li.on { background: var(--accent-dim); }
.mpg-routes li:not(.on):hover { background: var(--bg-card-hover); }
.mpg-route-btn { flex: 1; min-width: 0; display: flex; align-items: center; gap: 8px; padding: 8px 8px; background: none; border: 0; cursor: pointer; color: var(--text-primary); text-align: left; }
.mpg-method { font-family: var(--font-mono, ui-monospace, monospace); font-size: 11px; font-weight: 700; width: 46px; flex-shrink: 0; }
.mpg-path { font-family: var(--font-mono, ui-monospace, monospace); font-size: var(--fs-sm); flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.mpg-routes .badge { font-size: 11px; padding: 1px 6px; }
.mpg-del { opacity: 0; }
.mpg-routes li:hover .mpg-del, .mpg-routes li.on .mpg-del, .mpg-del:focus-visible { opacity: 1; }
.mpg-row { display: flex; gap: 8px; align-items: center; margin-bottom: 10px; min-width: 0; }
.mpg-row > .input { min-width: 0; }
.mpg-small label { display: grid; gap: 4px; font-size: var(--fs-xs); color: var(--text-tertiary); flex: 1; min-width: 0; }
.mpg-tools { flex-wrap: wrap; margin-bottom: 8px; }
.mpg-hint { margin-left: auto; }
.mpg-hint code, .mpg-panel code, .mpg-content code { font-family: var(--font-mono, ui-monospace, monospace); color: var(--text-mono); font-size: 0.92em; }
.mpg-body { width: 100%; min-height: 340px; resize: vertical; font-size: 13px; line-height: 1.55; tab-size: 2; }
.mpg-warn { color: var(--amber); font-size: var(--fs-sm); margin: 6px 0 0; }
.mpg-route-adds { display: inline-flex; gap: 4px; }
.mpg-check { display: flex; gap: 8px; align-items: flex-start; font-size: var(--fs-sm); color: var(--text-secondary); }
.mpg-check input { margin-top: 3px; }
.mpg-curlblock { display: grid; gap: 6px; min-width: 0; }
.mpg-curlblock-head { display: flex; justify-content: space-between; align-items: center; gap: 8px; }
.mpg-curlblock pre { margin: 0; padding: 10px; background: var(--bg-input); border: 1px solid var(--border); border-radius: var(--radius-sm); font-size: 12px; white-space: pre-wrap; word-break: break-all; max-height: 260px; overflow: auto; }
.mpg-panel { border: 1px solid var(--border-hover); border-radius: var(--radius-md); padding: 12px; margin-bottom: 10px; background: var(--bg-surface); display: grid; gap: 8px; }
.mpg-panel p { margin: 0; }
.mpg-panel .mpg-row { margin: 0; flex-wrap: wrap; }
.mpg-import { margin-bottom: 12px; }
.mpg-headers { display: grid; gap: 0; }
.mpg-headers p { margin: 0 0 10px; }
.mpg-tabs { display: flex; gap: 2px; border-bottom: 1px solid var(--border); margin: 4px 0 12px; }
.mpg-tabs button { padding: 8px 12px; background: transparent; border: 0; border-bottom: 2px solid transparent; margin-bottom: -1px; color: var(--text-tertiary); font-size: var(--fs-base); font-weight: 500; cursor: pointer; }
.mpg-tabs button.on { color: var(--text-primary); border-bottom-color: var(--accent); }
.mpg-method-box { display: inline-flex; align-items: center; justify-content: center; width: auto; padding: 0 10px; height: 36px; border: 1px solid var(--border); border-radius: var(--radius-sm); background: var(--bg-input); }
.mpg-tester textarea { width: 100%; margin: 4px 0 10px; resize: vertical; }
.mpg-empty { padding: 28px 8px; text-align: center; }
.mpg-status { display: flex; align-items: center; gap: 12px; font-size: var(--fs-sm); color: var(--text-secondary); margin-bottom: 8px; flex-wrap: wrap; }
.mpg-status span { display: inline-flex; align-items: center; gap: 4px; }
.mpg-open { margin-left: auto; display: inline-flex; align-items: center; gap: 4px; font-size: var(--fs-sm); }
.mpg-pre { margin: 0; background: #0c0c12; border: 1px solid var(--border); border-radius: var(--radius-md); padding: 12px 14px; font-family: var(--font-mono, ui-monospace, monospace);
  font-size: 13px; line-height: 1.55; color: var(--text-mono); max-height: 420px; overflow: auto; white-space: pre; }
.mpg-htable { width: 100%; border-collapse: collapse; font-size: var(--fs-sm); }
.mpg-htable th, .mpg-htable td { text-align: left; padding: 6px 8px; border-top: 1px solid var(--border); vertical-align: top; overflow-wrap: anywhere; }
.mpg-htable th { color: var(--text-secondary); font-weight: 500; font-family: var(--font-mono, ui-monospace, monospace); width: 42%; }
.mpg-htable td { color: var(--text-mono); font-family: var(--font-mono, ui-monospace, monospace); }
.mpg-content { max-width: 880px; margin: 56px auto 0; }
.mpg-content h2 { font-size: 24px; font-weight: 700; letter-spacing: -0.02em; margin: 40px 0 12px; }
.mpg-content h3 { font-size: var(--fs-lg); font-weight: 600; margin: 0 0 6px; }
.mpg-content p, .mpg-steps li { color: var(--text-secondary); font-size: var(--fs-md); line-height: 1.7; }
.mpg-steps { padding-left: 22px; display: grid; gap: 10px; margin: 0 0 16px; }
.mpg-steps strong { color: var(--text-primary); }
.mpg-faq { display: grid; gap: 18px; }
.mpg-faq p { margin: 0; }
.mpg-cta { display: flex; align-items: center; justify-content: space-between; gap: 20px; padding: 22px 24px; margin-top: 40px; flex-wrap: wrap; }
.mpg-cta h2 { margin: 0 0 6px; font-size: 20px; }
.mpg-cta p { margin: 0; }
@media (max-width: 1180px) {
  .mpg-grid { grid-template-columns: 240px minmax(0, 1fr); }
  .mpg-tester { grid-column: 1 / -1; }
}
@media (max-width: 760px) {
  .mpg-nav { padding: 10px 16px; gap: 10px; }
  .mpg-nav-link, .mpg-brand-sub { display: none; }
  .mpg-main { padding: 18px 16px 48px; }
  .mpg-grid { grid-template-columns: minmax(0, 1fr); }
  .mpg-hint { margin-left: 0; }
  .mpg-body { min-height: 260px; }
}
`;
