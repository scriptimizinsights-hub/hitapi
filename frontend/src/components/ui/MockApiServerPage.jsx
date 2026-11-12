import { useState } from 'react';
import { ArrowRight, Send, Check, Minus, Sparkles, FileCode2, Server, Link2 } from 'lucide-react';
import { LogoMark } from './Logo.jsx';
import { PublicFooter } from './PublicFooter.jsx';
import { MOCK_FAQS } from '../../seo/mockApiContent.js';

/**
 * /mock-api-server — public, prerendered page about HitAPI's mock servers.
 * Everything a search engine needs is plain HTML at build time (see
 * scripts/prerender.mjs); the "Try it" box is the only part that needs JS,
 * and without JS the demo URLs still open as links.
 * The live demo is the worker's built-in mock: /mock/demo (services/mock/demo.js).
 */

const API_BASE = import.meta.env.VITE_API_URL ?? 'https://services.hitapi.dev/api';
const DEMO = `${API_BASE.replace(/\/api\/?$/, '')}/mock/demo`;

const DEMO_ROUTES = [
    { method: 'GET', path: '/products', call: '/products', summary: 'List products', source: 'Spec example' },
    { method: 'GET', path: '/products/{id}', call: '/products/42', summary: 'One product', source: 'Schema' },
    { method: 'GET', path: '/users/{id}', call: '/users/42', summary: 'A user', source: 'Schema' },
    { method: 'GET', path: '/orders', call: '/orders', summary: 'List orders', source: 'Schema' },
    { method: 'POST', path: '/orders', call: '/orders', summary: 'Create an order (201)', source: 'Schema' },
    { method: 'DELETE', path: '/orders/{id}', call: '/orders/42', summary: 'Cancel an order (204)', source: 'Schema' },
    { method: 'GET', path: '/categories', call: '/categories', summary: 'No response in the spec', source: 'Generic' },
];

// What the demo returns for GET /users/42 (shown before anyone presses Send)
const USER_SCHEMA = `"User": {
  "type": "object",
  "properties": {
    "id":          { "type": "integer" },
    "name":        { "type": "string" },
    "email":       { "type": "string", "format": "email" },
    "phone":       { "type": "string" },
    "city":        { "type": "string" },
    "country":     { "type": "string" },
    "avatar_url":  { "type": "string", "format": "uri" },
    "is_verified": { "type": "boolean" },
    "created_at":  { "type": "string", "format": "date-time" }
  }
}`;
const USER_SAMPLE = `{
  "id": 42,
  "name": "Omar Sharma",
  "email": "kenji.kim@example.com",
  "phone": "+1-555-217-5335",
  "city": "Lisbon",
  "country": "PT",
  "avatar_url": "https://picsum.photos/seed/466/400/300",
  "is_verified": true,
  "created_at": "2026-09-22T13:06:41Z"
}`;

const STEPS = [
    [FileCode2, 'Bring your API', 'Import an OpenAPI 3 or Swagger 2 spec from its URL, capture calls with the HitAPI Chrome extension, or add endpoints by hand.'],
    [Server, 'Generate the mock', 'One click creates a mock route for every endpoint, with a status code and a realistic JSON body for each.'],
    [Link2, 'Call your mock URL', 'Point your frontend, mobile app or tests at https://services.hitapi.dev/mock/<id>. No login, no API key, CORS open.'],
];

const SOURCES = [
    ['Spec example', 'If your spec has an example response, the mock returns it exactly as written.'],
    ['Schema', 'Otherwise HitAPI builds data from the response schema. Field names drive the values: email gets an email address, created_at a date, price an amount, avatar_url an image link. Formats, enums, min/max limits and nested objects and arrays are respected.'],
    ['Generic', 'Endpoints with no response described (for example, ones captured by the extension) get a sensible body from the method and path: a list for GET /orders, one object for GET /orders/{id}, 204 for DELETE.'],
    ['AI (optional)', 'Press Improve with AI and Workers AI rewrites the sample with realistic, consistent values in the same shape. If anything fails, the schema data stays, so a mock is never empty.'],
];

const FEATURES = [
    ['Path parameters filled in', 'GET /products/42 returns "id": 42. Any field named like a path parameter gets its value.'],
    ['Force any error', 'Send X-Mock-Status: 500 or add ?__status=404 to test error handling without changing the mock.'],
    ['Delays', 'Add up to 10 seconds of latency per route to test spinners and timeouts.'],
    ['Edit any response', 'Change the status code or body; use {{params.id}} or {{query.page}} to echo request values.'],
    ['Any method, any client', 'GET, POST, PUT, PATCH, DELETE and HEAD, with CORS open for browser apps.'],
    ['On/off switch', 'Turn a mock off (calls get 503) or regenerate it when the spec changes; your edits are kept.'],
    ['Code to call it', 'Copy-ready cURL, Python, Go and Node.js snippets for every route.'],
    ['Test against it', 'Export your HitAPI test cases to Playwright, Pytest, Jest or k6 with the mock URL as the base URL.'],
];

const USE_CASES = [
    ['Frontend before the backend', 'Build screens against real-looking responses while the API is still being written.'],
    ['Mobile apps', 'Give iOS and Android developers a stable URL that always answers.'],
    ['CI and automated tests', 'Run UI and integration tests without a staging server or seeded database.'],
    ['Error and edge cases', 'Check how the app handles 401, 404, 500 and slow responses, on demand.'],
    ['Demos and prototypes', 'Show a working product to stakeholders before anything is deployed.'],
    ['When a third-party API is down', 'Keep working against a mock of the parts of the API you use.'],
];

// Facts from each product's public pages (November 2026). Keep it fair: say what others do well.
const COMPARE = {
    cols: ['HitAPI', 'Postman mock servers', 'Mockoon', 'Beeceptor'],
    rows: [
        ['Create a mock from an OpenAPI / Swagger spec', [true, 'Via an imported collection', true, true]],
        ['Realistic data without writing examples', ['From the schema and field names, plus optional AI', 'Returns saved examples you write; dynamic variables help', 'Templating with fake-data helpers; AI assistant', 'Templates; AI spec-to-mock on paid plans']],
        ['Hosted public URL', [true, true, 'Local app; cloud hosting on paid Pro', true]],
        ['Runs offline on your machine', [false, false, true, false]],
        ['Free option', ['Free', 'Free plan (1 user)', 'Open-source app is free', 'Free tier, 50 requests/day per endpoint']],
        ['Also tests your real API', ['AI-written tests, runs and bug reports', 'Test scripts you write', false, false]],
    ],
};

const METHOD_COLOR = { GET: 'var(--method-get)', POST: 'var(--method-post)', PUT: 'var(--method-put)', PATCH: 'var(--method-patch)', DELETE: 'var(--method-delete)' };

function Method({ m }) {
    return <span className="mp-method" style={{ color: METHOD_COLOR[m] }}>{m}</span>;
}

function Cell({ v }) {
    if (v === true) return <><Check size={16} color="var(--green)" aria-hidden="true" /><span className="sr-only">Yes</span></>;
    if (v === false) return <><Minus size={16} color="var(--text-tertiary)" aria-hidden="true" /><span className="sr-only">No</span></>;
    return <span>{v}</span>;
}

/** Live "Try it" box. Before Send it shows a real response, so the prerendered HTML has one too. */
function TryIt() {
    const [i, setI] = useState(2); // GET /users/42, matching the example response shown before Send
    const [force, setForce] = useState('');
    const [res, setRes] = useState(null);
    const [busy, setBusy] = useState(false);
    const route = DEMO_ROUTES[i];
    const url = `${DEMO}${route.call}`;
    const curl = `curl -X ${route.method} '${url}'${force ? ` \\\n  -H 'X-Mock-Status: ${force}'` : ''}`;

    async function send() {
        setBusy(true);
        const started = performance.now();
        try {
            const r = await fetch(url, { method: route.method, headers: force ? { 'X-Mock-Status': force } : {} });
            const text = await r.text();
            let body = text;
            try { body = JSON.stringify(JSON.parse(text), null, 2); } catch { /* not JSON */ }
            setRes({ status: r.status, ms: Math.round(performance.now() - started), source: r.headers.get('X-Mock-Source'), body: body || '(no body)' });
        } catch (e) {
            setRes({ status: 0, ms: 0, source: null, body: `Request failed: ${e.message}` });
        } finally {
            setBusy(false);
        }
    }

    return (
        <div className="mp-card mp-try">
            <div className="mp-try-bar">
                <label className="sr-only" htmlFor="mp-route">Route</label>
                <select id="mp-route" className="input" value={i} onChange={e => { setI(Number(e.target.value)); setRes(null); }}>
                    {DEMO_ROUTES.map((r, n) => <option key={n} value={n}>{r.method} {r.call}</option>)}
                </select>
                <label className="sr-only" htmlFor="mp-force">Force a status</label>
                <select id="mp-force" className="input" value={force} onChange={e => { setForce(e.target.value); setRes(null); }}>
                    <option value="">Normal response</option>
                    <option value="404">Force 404</option>
                    <option value="401">Force 401</option>
                    <option value="500">Force 500</option>
                </select>
                <button className="btn btn-primary" onClick={send} disabled={busy}>
                    <Send size={14} /> {busy ? 'Sending…' : 'Send'}
                </button>
            </div>
            <pre className="mp-code" aria-label="Request">{curl}</pre>
            <div className="mp-try-status" aria-live="polite">
                {res ? (
                    <>
                        <strong style={{ color: res.status >= 400 || res.status === 0 ? 'var(--red)' : 'var(--green)' }}>{res.status || 'Error'}</strong>
                        <span>{res.ms} ms</span>
                        {res.source && <span>X-Mock-Source: <code>{res.source}</code></span>}
                    </>
                ) : (
                    <span>Example response for <code>GET /users/42</code>. Press Send to call the live mock.</span>
                )}
            </div>
            <pre className="mp-code mp-response" aria-label="Response">{res ? res.body : USER_SAMPLE}</pre>
        </div>
    );
}

export function MockApiServerPage() {
    return (
        <div style={{ minHeight: '100vh', background: 'var(--bg-app)' }}>
            <style>{CSS}</style>
            <nav className="mp-nav">
                <a href="/" style={{ display: 'flex', alignItems: 'center', gap: 8, color: 'var(--text-primary)' }}>
                    <LogoMark size={26} />
                    <span style={{ fontSize: 'var(--fs-md)', fontWeight: 600 }}>HitAPI</span>
                </a>
                <div style={{ display: 'flex', alignItems: 'center', gap: 18 }}>
                    <a href="/how-it-works" className="mp-nav-link">How it works</a>
                    <a href="/playground" className="mp-nav-link">API Playground</a>
                    <a href="/login" className="btn btn-primary btn-sm">Get started free</a>
                </div>
            </nav>

            <main className="mp-main">
                <nav aria-label="Breadcrumb" className="mp-crumbs">
                    <a href="/">HitAPI</a> <span aria-hidden="true">/</span> <span>Mock API server</span>
                </nav>

                <header className="mp-hero">
                    <h1>Free mock API server, generated from your OpenAPI spec</h1>
                    <p>
                        Turn a Swagger or OpenAPI spec into a live mock REST API in one click. Every endpoint gets a public URL
                        that returns realistic JSON, so frontend, mobile and test work can start before the backend is ready.
                    </p>
                    <div className="mp-cta">
                        <a href="/login" className="btn btn-primary mp-btn-lg">Create your mock server <ArrowRight size={15} /></a>
                        <a href="#live-demo" className="btn btn-ghost mp-btn-lg">Try the live demo</a>
                    </div>
                </header>

                <figure className="mp-figure">
                    <img
                        src="/media/mock-server-routes.webp"
                        width="1600" height="800"
                        alt="HitAPI Mock Server tab for a Pet Store API: the public mock URL on services.hitapi.dev, an Improve with AI button, and six routes with their method, path, status code and data source (Schema, Spec example or Generic)."
                        fetchpriority="high"
                    />
                    <figcaption>The Mock Server tab: one public URL and a route for every endpoint in the spec.</figcaption>
                </figure>

                <section aria-labelledby="live-demo">
                    <h2 id="live-demo">Live demo: call a mock API right now</h2>
                    <p>
                        This demo mock server was generated by HitAPI from a small Store API spec. It is public: call it from this page,
                        your terminal or your own app. No sign-up needed.
                    </p>
                    <p className="mp-base">Base URL: <code>{DEMO}</code></p>
                    <div className="mp-demo-grid">
                        <div className="mp-card">
                            <table className="mp-routes">
                                <caption className="sr-only">Routes on the demo mock server</caption>
                                <thead><tr><th scope="col">Route</th><th scope="col">Data from</th></tr></thead>
                                <tbody>
                                    {DEMO_ROUTES.map(r => (
                                        <tr key={r.method + r.path}>
                                            <td>
                                                <Method m={r.method} />{' '}
                                                {r.method === 'GET'
                                                    ? <a href={`${DEMO}${r.call}`} rel="nofollow" target="_blank"><code>{r.path}</code></a>
                                                    : <code>{r.path}</code>}
                                                <div className="mp-muted">{r.summary}</div>
                                            </td>
                                            <td className="mp-muted">{r.source}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                        <TryIt />
                    </div>
                </section>

                <section aria-labelledby="how">
                    <h2 id="how">How to create a mock API in 3 steps</h2>
                    <ol className="mp-steps">
                        {STEPS.map(([Icon, title, text], n) => (
                            <li key={title} className="mp-card">
                                <span className="mp-step-n">{n + 1}</span>
                                <Icon size={20} color="var(--accent)" aria-hidden="true" />
                                <h3>{title}</h3>
                                <p>{text}</p>
                            </li>
                        ))}
                    </ol>
                </section>

                <section aria-labelledby="data">
                    <h2 id="data">How HitAPI generates mock data</h2>
                    <p>For every route, HitAPI picks the best data it can find, in this order:</p>
                    <dl className="mp-sources">
                        {SOURCES.map(([k, v]) => (
                            <div key={k} className="mp-card">
                                <dt>{k === 'AI (optional)' && <Sparkles size={15} color="var(--accent)" aria-hidden="true" style={{ marginRight: 6, verticalAlign: '-2px' }} />}{k}</dt>
                                <dd>{v}</dd>
                            </div>
                        ))}
                    </dl>
                    <h3 className="mp-h3">Example: a schema and the mock response it produces</h3>
                    <p>No example in the spec, only a schema. This is what the demo returns for <code>GET /users/42</code>:</p>
                    <div className="mp-two">
                        <pre className="mp-code" aria-label="OpenAPI schema">{USER_SCHEMA}</pre>
                        <pre className="mp-code" aria-label="Generated mock response">{USER_SAMPLE}</pre>
                    </div>
                    <p className="mp-muted">
                        The data is stable: the same spec gives the same response every time, so screenshots and tests don't change
                        on each call. The <code>id</code> comes from the URL.
                    </p>
                    <figure className="mp-figure">
                        <img
                            src="/media/mock-server-try.webp"
                            width="1400" height="619"
                            loading="lazy"
                            alt="Trying GET /pets/{petId} on a HitAPI mock server: a cURL command for the services.hitapi.dev mock URL and the 200 response with realistic pet data generated from the schema, including name, species, owner email, price and tags."
                        />
                        <figcaption>Try any route from HitAPI and copy the request as cURL, Python, Go or Node.js.</figcaption>
                    </figure>
                </section>

                <section aria-labelledby="features">
                    <h2 id="features">Mock server features</h2>
                    <ul className="mp-features">
                        {FEATURES.map(([k, v]) => (
                            <li key={k}><strong>{k}.</strong> {v}</li>
                        ))}
                    </ul>
                </section>

                <section aria-labelledby="uses">
                    <h2 id="uses">What teams use a mock API for</h2>
                    <div className="mp-uses">
                        {USE_CASES.map(([k, v]) => (
                            <div key={k} className="mp-card"><h3>{k}</h3><p>{v}</p></div>
                        ))}
                    </div>
                </section>

                <section aria-labelledby="compare">
                    <h2 id="compare">HitAPI vs Postman, Mockoon and Beeceptor</h2>
                    <p>
                        All four are good ways to mock an API. HitAPI is the one to pick when you want a hosted mock straight from your
                        spec with realistic data and no examples to write, and you also want to test the real API in the same place.
                        If you need mocks that run offline on your laptop, Mockoon is a strong choice.
                    </p>
                    <div className="mp-table-wrap" tabIndex={0} role="region" aria-label="Comparison table">
                        <table className="mp-compare">
                            <thead>
                                <tr><th scope="col"><span className="sr-only">Feature</span></th>{COMPARE.cols.map(c => <th key={c} scope="col">{c}</th>)}</tr>
                            </thead>
                            <tbody>
                                {COMPARE.rows.map(([label, vals]) => (
                                    <tr key={label}>
                                        <th scope="row">{label}</th>
                                        {vals.map((v, n) => <td key={n} className={n === 0 ? 'mp-us' : ''}><Cell v={v} /></td>)}
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                    <p className="mp-muted">Based on each product's public website in November 2026. Plans and limits change; check their sites for current details.</p>
                </section>

                <section aria-labelledby="faq">
                    <h2 id="faq">Frequently asked questions</h2>
                    <div className="mp-faq">
                        {MOCK_FAQS.map(f => (
                            <div key={f.q}>
                                <h3>{f.q}</h3>
                                <p>{f.a}</p>
                            </div>
                        ))}
                    </div>
                </section>

                <section className="mp-card mp-final">
                    <h2>Create your mock API server in a minute</h2>
                    <p>Import your spec, press Create mock server, and share the URL with your team. Free.</p>
                    <div className="mp-cta" style={{ justifyContent: 'center' }}>
                        <a href="/login" className="btn btn-primary mp-btn-lg">Get started free <ArrowRight size={15} /></a>
                        <a href="/how-it-works" className="btn btn-ghost mp-btn-lg">How HitAPI works</a>
                    </div>
                </section>
            </main>

            <PublicFooter />
        </div>
    );
}

const CSS = `
.sr-only { position: absolute; width: 1px; height: 1px; padding: 0; margin: -1px; overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap; border: 0; }
.mp-nav { position: sticky; top: 0; z-index: 50; background: rgba(10,10,15,0.9); backdrop-filter: blur(12px);
  border-bottom: 1px solid var(--border); display: flex; align-items: center; justify-content: space-between; gap: 16px; padding: 14px 40px; }
.mp-nav-link { font-size: var(--fs-base); color: var(--text-secondary); }
.mp-main { max-width: 1080px; margin: 0 auto; padding: 28px 24px 72px; }
.mp-main section { margin-top: 64px; }
.mp-main h2 { font-size: clamp(22px, 2.6vw, 28px); font-weight: 700; letter-spacing: -0.02em; margin: 0 0 12px; }
.mp-main h3 { font-size: var(--fs-lg); font-weight: 600; margin: 0 0 6px; }
.mp-main p { font-size: var(--fs-md); color: var(--text-secondary); line-height: 1.7; margin: 0 0 14px; }
.mp-main code { font-family: var(--font-mono, ui-monospace, monospace); font-size: 0.92em; color: var(--text-mono); overflow-wrap: anywhere; }
.mp-crumbs { font-size: var(--fs-sm); color: var(--text-tertiary); display: flex; gap: 6px; }
.mp-crumbs a { color: var(--text-secondary); }
.mp-hero { text-align: center; padding: 36px 0 8px; }
.mp-hero h1 { font-size: clamp(30px, 4.6vw, 48px); font-weight: 750; letter-spacing: -0.035em; line-height: 1.12; margin: 0 auto 16px; max-width: 820px; }
.mp-hero p { font-size: var(--fs-xl); max-width: 720px; margin: 0 auto 26px; }
.mp-cta { display: flex; gap: 12px; flex-wrap: wrap; justify-content: center; }
.mp-btn-lg { padding: 11px 22px; font-size: var(--fs-md); }
.mp-figure { margin: 40px 0 0; }
.mp-figure img { width: 100%; height: auto; display: block; border-radius: var(--radius-lg); border: 1px solid var(--border-hover); box-shadow: 0 24px 60px rgba(0,0,0,0.45); }
.mp-figure figcaption { font-size: var(--fs-sm); color: var(--text-tertiary); text-align: center; margin-top: 12px; }
.mp-card { background: var(--bg-card); border: 1px solid var(--border); border-radius: var(--radius-lg); padding: 18px 20px; }
.mp-base { font-size: var(--fs-md); }
.mp-base code { background: var(--bg-input); padding: 3px 8px; border-radius: 6px; }
.mp-demo-grid { display: grid; grid-template-columns: minmax(0, 0.9fr) minmax(0, 1.1fr); gap: 16px; align-items: start; }
.mp-routes { width: 100%; border-collapse: collapse; }
.mp-routes th { text-align: left; font-size: var(--fs-xs); text-transform: uppercase; letter-spacing: .07em; color: var(--text-tertiary); padding: 0 0 10px; font-weight: 600; }
.mp-routes td { padding: 9px 0; border-top: 1px solid var(--border); vertical-align: top; font-size: var(--fs-base); }
.mp-routes td:last-child { text-align: right; white-space: nowrap; padding-left: 10px; }
.mp-routes a code { color: var(--accent); }
.mp-method { font-family: var(--font-mono, ui-monospace, monospace); font-size: var(--fs-xs); font-weight: 700; display: inline-block; min-width: 52px; }
.mp-muted { color: var(--text-tertiary) !important; font-size: var(--fs-sm) !important; }
.mp-routes .mp-muted { margin: 2px 0 0 56px; }
.mp-try { display: grid; grid-template-columns: minmax(0, 1fr); gap: 12px; }
.mp-faq, .mp-demo-grid > * { min-width: 0; }
.mp-try-bar { display: flex; gap: 8px; flex-wrap: wrap; }
.mp-try-bar select { flex: 1 1 160px; min-width: 0; }
.mp-try-status { display: flex; gap: 14px; flex-wrap: wrap; align-items: center; font-size: var(--fs-sm); color: var(--text-secondary); }
.mp-code { margin: 0; background: #0c0c12; border: 1px solid var(--border); border-radius: var(--radius-md); padding: 14px 16px;
  font-family: var(--font-mono, ui-monospace, monospace); font-size: 13px; line-height: 1.6; color: var(--text-mono); overflow-x: auto; white-space: pre; }
.mp-response { max-height: 360px; overflow: auto; }
.mp-steps { list-style: none; padding: 0; margin: 20px 0 0; display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 16px; }
.mp-steps li { position: relative; }
.mp-steps h3 { margin-top: 10px; }
.mp-steps p { margin: 0; font-size: var(--fs-base); }
.mp-step-n { position: absolute; top: 16px; right: 18px; font-size: 28px; font-weight: 800; color: var(--accent-dim); line-height: 1; }
.mp-sources { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 12px; margin: 16px 0 28px; }
.mp-sources dt { font-weight: 650; font-size: var(--fs-md); margin-bottom: 6px; }
.mp-sources dd { margin: 0; font-size: var(--fs-base); color: var(--text-secondary); line-height: 1.65; }
.mp-h3 { margin-top: 8px !important; }
.mp-two { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 12px; margin-bottom: 12px; }
.mp-features { list-style: none; padding: 0; margin: 16px 0 0; display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 12px 28px; }
.mp-features li { font-size: var(--fs-md); color: var(--text-secondary); line-height: 1.65; padding-left: 16px; border-left: 2px solid var(--accent-dim); }
.mp-features strong { color: var(--text-primary); font-weight: 600; }
.mp-uses { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 12px; margin-top: 16px; }
.mp-uses p { margin: 0; font-size: var(--fs-base); }
.mp-table-wrap { position: relative; overflow-x: auto; border: 1px solid var(--border); border-radius: var(--radius-lg); margin: 18px 0 12px; }
.mp-compare { width: 100%; min-width: 760px; border-collapse: collapse; font-size: var(--fs-base); }
.mp-compare th, .mp-compare td { padding: 12px 14px; border-top: 1px solid var(--border); text-align: left; vertical-align: top; line-height: 1.5; color: var(--text-secondary); }
.mp-compare thead th { border-top: 0; color: var(--text-primary); font-weight: 650; background: var(--bg-surface); }
.mp-compare tbody th { color: var(--text-primary); font-weight: 500; width: 26%; }
.mp-compare .mp-us { background: rgba(130, 100, 255, 0.06); color: var(--text-primary); }
.mp-faq { display: grid; gap: 22px; margin-top: 18px; }
.mp-faq p { margin: 0; }
.mp-final { text-align: center; padding: 40px 24px; }
.mp-final p { margin-bottom: 22px; }
@media (max-width: 860px) {
  .mp-demo-grid, .mp-two, .mp-sources, .mp-features { grid-template-columns: minmax(0, 1fr); }
  .mp-steps, .mp-uses { grid-template-columns: minmax(0, 1fr); }
}
@media (max-width: 640px) {
  .mp-nav { padding: 12px 16px; }
  .mp-nav-link { display: none; }
  .mp-main { padding: 20px 16px 56px; }
  .mp-main section { margin-top: 48px; }
}
`;
