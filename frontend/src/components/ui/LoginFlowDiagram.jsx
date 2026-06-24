import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Lock } from 'lucide-react';

export function LoginFlowDiagram() {
    const navigate = useNavigate();

    return (
        <div className="page">
            <div className="page-header" style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
                <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                        <Lock size={18} color="var(--accent)" />
                        <h1 className="page-title" style={{ margin: 0 }}>Login flow — how auth works</h1>
                    </div>
                    <p className="page-subtitle">How APIForge handles login-first authentication before running tests</p>
                </div>
                <button className="btn btn-ghost" onClick={() => navigate(-1)} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <ArrowLeft size={14} /> Back
                </button>
            </div>

            {/* ── Config box ── */}
            <div style={{
                background: 'rgba(130,100,255,0.06)', border: '1px solid rgba(130,100,255,0.2)',
                borderRadius: 12, padding: '18px 22px', marginBottom: 20,
                display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 20
            }}>
                <div>
                    <div style={{ fontSize: 11, color: 'var(--accent)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 6 }}>Login URL</div>
                    <div style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 12, color: 'var(--text-secondary)', background: 'rgba(0,0,0,0.2)', padding: '6px 10px', borderRadius: 6 }}>
                        POST /api/v1/auth/login
                    </div>
                </div>
                <div>
                    <div style={{ fontSize: 11, color: 'var(--accent)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 6 }}>Login body</div>
                    <div style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 12, color: 'var(--text-secondary)', background: 'rgba(0,0,0,0.2)', padding: '6px 10px', borderRadius: 6 }}>
                        {'{"email":"test@x.com","password":"secret"}'}
                    </div>
                </div>
                <div>
                    <div style={{ fontSize: 11, color: 'var(--accent)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 6 }}>Token path</div>
                    <div style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 12, color: 'var(--text-secondary)', background: 'rgba(0,0,0,0.2)', padding: '6px 10px', borderRadius: 6 }}>
                        data.token
                    </div>
                </div>
            </div>

            {/* ── Main diagram ── */}
            <div className="card" style={{ padding: '28px 20px', marginBottom: 20 }}>
                <svg width="100%" viewBox="0 0 680 860" role="img" xmlns="http://www.w3.org/2000/svg">
                    <title>Login flow authentication diagram</title>
                    <desc>How APIForge performs login-first auth and injects the token into all test requests</desc>
                    <defs>
                        <marker id="lf-arrow" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
                            <path d="M2 1L8 5L2 9" fill="none" stroke="context-stroke" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                        </marker>
                        <marker id="lf-arrow-red" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
                            <path d="M2 1L8 5L2 9" fill="none" stroke="#ff5c5c" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                        </marker>
                    </defs>

                    {/* ══════════════════════════════════════
              PHASE 1 — Project config
              ══════════════════════════════════════ */}

                    {/* Phase label */}
                    <rect x="56" y="20" width="568" height="24" rx="4" fill="rgba(130,100,255,0.08)" stroke="rgba(130,100,255,0.15)" strokeWidth="0.5" />
                    <text x="340" y="32" textAnchor="middle" dominantBaseline="central" style={{ fontSize: 11, fontWeight: 600, fill: '#8264ff', fontFamily: 'inherit', letterSpacing: '0.06em' }}>
                        PHASE 1 — CONFIGURE PROJECT
                    </text>

                    {/* Auth type selector box */}
                    <g>
                        <rect x="180" y="60" width="320" height="72" rx="8" fill="rgba(130,100,255,0.1)" stroke="rgba(130,100,255,0.35)" strokeWidth="0.5" />
                        <text x="340" y="82" textAnchor="middle" dominantBaseline="central" style={{ fontSize: 13, fontWeight: 600, fill: '#c4b8ff', fontFamily: 'inherit' }}>Project settings</text>
                        <text x="340" y="100" textAnchor="middle" dominantBaseline="central" style={{ fontSize: 11, fill: '#9882ee', fontFamily: 'inherit' }}>Auth type: Login flow (auto token)</text>
                        <text x="340" y="117" textAnchor="middle" dominantBaseline="central" style={{ fontSize: 10, fill: '#6a5fc0', fontFamily: 'inherit' }}>login_url · login_body · token_path</text>
                    </g>

                    {/* Arrow down */}
                    <line x1="340" y1="132" x2="340" y2="158" stroke="rgba(255,255,255,0.15)" strokeWidth="1.2" markerEnd="url(#lf-arrow)" />

                    {/* ══════════════════════════════════════
              PHASE 2 — Login step
              ══════════════════════════════════════ */}

                    <rect x="56" y="162" width="568" height="24" rx="4" fill="rgba(255,181,71,0.08)" stroke="rgba(255,181,71,0.15)" strokeWidth="0.5" />
                    <text x="340" y="174" textAnchor="middle" dominantBaseline="central" style={{ fontSize: 11, fontWeight: 600, fill: '#ffb547', fontFamily: 'inherit', letterSpacing: '0.06em' }}>
                        PHASE 2 — LOGIN REQUEST (runs once before any tests)
                    </text>

                    {/* APIForge → your API */}
                    <g>
                        <rect x="56" y="202" width="140" height="56" rx="8" fill="rgba(130,100,255,0.1)" stroke="rgba(130,100,255,0.3)" strokeWidth="0.5" />
                        <text x="126" y="224" textAnchor="middle" dominantBaseline="central" style={{ fontSize: 12, fontWeight: 600, fill: '#c4b8ff', fontFamily: 'inherit' }}>APIForge</text>
                        <text x="126" y="242" textAnchor="middle" dominantBaseline="central" style={{ fontSize: 10, fill: '#9882ee', fontFamily: 'inherit' }}>Worker (edge)</text>
                    </g>

                    {/* POST arrow with body */}
                    <line x1="196" y1="230" x2="340" y2="230" stroke="#ffb547" strokeWidth="1.5" markerEnd="url(#lf-arrow)" opacity="0.8" />
                    <rect x="204" y="212" width="130" height="34" rx="4" fill="rgba(255,181,71,0.08)" stroke="none" />
                    <text x="269" y="224" textAnchor="middle" dominantBaseline="central" style={{ fontSize: 10, fontWeight: 600, fill: '#ffd080', fontFamily: 'JetBrains Mono, monospace' }}>POST /auth/login</text>
                    <text x="269" y="238" textAnchor="middle" dominantBaseline="central" style={{ fontSize: 9, fill: '#c89240', fontFamily: 'JetBrains Mono, monospace' }}>{'{"email":"…","password":"…"}'}</text>

                    {/* Your API box */}
                    <g>
                        <rect x="344" y="202" width="140" height="56" rx="8" fill="rgba(35,209,139,0.08)" stroke="rgba(35,209,139,0.3)" strokeWidth="0.5" />
                        <text x="414" y="224" textAnchor="middle" dominantBaseline="central" style={{ fontSize: 12, fontWeight: 600, fill: '#6ee7bf', fontFamily: 'inherit' }}>Your API</text>
                        <text x="414" y="242" textAnchor="middle" dominantBaseline="central" style={{ fontSize: 10, fill: '#3db88a', fontFamily: 'inherit' }}>auth endpoint</text>
                    </g>

                    {/* Response arrow */}
                    <line x1="484" y1="230" x2="560" y2="230" stroke="#23d18b" strokeWidth="1.5" markerEnd="url(#lf-arrow)" opacity="0.7" />

                    {/* Response box */}
                    <g>
                        <rect x="564" y="202" width="108" height="56" rx="8" fill="rgba(35,209,139,0.08)" stroke="rgba(35,209,139,0.25)" strokeWidth="0.5" />
                        <text x="618" y="220" textAnchor="middle" dominantBaseline="central" style={{ fontSize: 10, fontWeight: 600, fill: '#6ee7bf', fontFamily: 'JetBrains Mono, monospace' }}>200 OK</text>
                        <text x="618" y="236" textAnchor="middle" dominantBaseline="central" style={{ fontSize: 9, fill: '#3db88a', fontFamily: 'JetBrains Mono, monospace' }}>{'{"data":'}</text>
                        <text x="618" y="250" textAnchor="middle" dominantBaseline="central" style={{ fontSize: 9, fill: '#3db88a', fontFamily: 'JetBrains Mono, monospace' }}>{' {"token":"…"}}'}</text>
                    </g>

                    {/* Arrow down to token extraction */}
                    <line x1="340" y1="258" x2="340" y2="288" stroke="rgba(255,255,255,0.15)" strokeWidth="1.2" markerEnd="url(#lf-arrow)" />

                    {/* Token extraction */}
                    <g>
                        <rect x="180" y="292" width="320" height="64" rx="8" fill="rgba(255,181,71,0.1)" stroke="rgba(255,181,71,0.35)" strokeWidth="0.5" />
                        <text x="340" y="314" textAnchor="middle" dominantBaseline="central" style={{ fontSize: 13, fontWeight: 600, fill: '#ffd080', fontFamily: 'inherit' }}>Extract token</text>
                        <text x="340" y="332" textAnchor="middle" dominantBaseline="central" style={{ fontSize: 11, fill: '#c89240', fontFamily: 'inherit' }}>Navigate dot-path "data.token" in response JSON</text>
                        <text x="340" y="348" textAnchor="middle" dominantBaseline="central" style={{ fontSize: 10, fill: '#9a6e28', fontFamily: 'JetBrains Mono, monospace' }}>token = response.data.token  ✓</text>
                    </g>

                    {/* Decision diamond — login success? */}
                    <line x1="340" y1="356" x2="340" y2="386" stroke="rgba(255,255,255,0.15)" strokeWidth="1.2" markerEnd="url(#lf-arrow)" />

                    {/* Diamond shape */}
                    <polygon points="340,390 390,420 340,450 290,420" fill="rgba(255,255,255,0.04)" stroke="rgba(255,255,255,0.15)" strokeWidth="0.8" />
                    <text x="340" y="415" textAnchor="middle" dominantBaseline="central" style={{ fontSize: 11, fontWeight: 600, fill: 'var(--text-secondary)', fontFamily: 'inherit' }}>Login</text>
                    <text x="340" y="428" textAnchor="middle" dominantBaseline="central" style={{ fontSize: 11, fontWeight: 600, fill: 'var(--text-secondary)', fontFamily: 'inherit' }}>OK?</text>

                    {/* YES path */}
                    <line x1="340" y1="450" x2="340" y2="478" stroke="#23d18b" strokeWidth="1.5" markerEnd="url(#lf-arrow)" opacity="0.8" />
                    <text x="352" y="465" style={{ fontSize: 10, fill: '#23d18b', fontFamily: 'inherit', fontWeight: 600 }}>YES</text>

                    {/* NO path — right branch */}
                    <line x1="390" y1="420" x2="560" y2="420" stroke="#ff5c5c" strokeWidth="1.2" strokeDasharray="4 3" markerEnd="url(#lf-arrow-red)" opacity="0.7" />
                    <text x="475" y="413" textAnchor="middle" style={{ fontSize: 10, fill: '#ff5c5c', fontFamily: 'inherit', fontWeight: 600 }}>NO</text>
                    <g>
                        <rect x="564" y="394" width="108" height="52" rx="8" fill="rgba(255,92,92,0.1)" stroke="rgba(255,92,92,0.35)" strokeWidth="0.5" />
                        <text x="618" y="412" textAnchor="middle" dominantBaseline="central" style={{ fontSize: 11, fontWeight: 600, fill: '#ff8a8a', fontFamily: 'inherit' }}>⚠ Login failed</text>
                        <text x="618" y="428" textAnchor="middle" dominantBaseline="central" style={{ fontSize: 10, fill: '#cc4040', fontFamily: 'inherit' }}>Run tests anyway</text>
                        <text x="618" y="443" textAnchor="middle" dominantBaseline="central" style={{ fontSize: 10, fill: '#cc4040', fontFamily: 'inherit' }}>without token</text>
                    </g>

                    {/* ══════════════════════════════════════
              PHASE 3 — Test execution with token
              ══════════════════════════════════════ */}

                    <rect x="56" y="482" width="568" height="24" rx="4" fill="rgba(92,168,255,0.08)" stroke="rgba(92,168,255,0.15)" strokeWidth="0.5" />
                    <text x="340" y="494" textAnchor="middle" dominantBaseline="central" style={{ fontSize: 11, fontWeight: 600, fill: '#5ca8ff', fontFamily: 'inherit', letterSpacing: '0.06em' }}>
                        PHASE 3 — TEST EXECUTION (token injected into every request)
                    </text>

                    {/* Token storage */}
                    <g>
                        <rect x="180" y="522" width="320" height="52" rx="8" fill="rgba(92,168,255,0.08)" stroke="rgba(92,168,255,0.25)" strokeWidth="0.5" />
                        <text x="340" y="540" textAnchor="middle" dominantBaseline="central" style={{ fontSize: 12, fontWeight: 600, fill: '#8dc6ff', fontFamily: 'inherit' }}>Token stored in Worker memory</text>
                        <text x="340" y="558" textAnchor="middle" dominantBaseline="central" style={{ fontSize: 10, fill: '#4a8ac4', fontFamily: 'JetBrains Mono, monospace' }}>Authorization: Bearer eyJhbGciOiJIUzI1NiIs…</text>
                    </g>

                    <line x1="340" y1="574" x2="340" y2="600" stroke="rgba(255,255,255,0.15)" strokeWidth="1.2" markerEnd="url(#lf-arrow)" />

                    {/* 3 test request examples side by side */}
                    {[
                        { x: 72, method: 'GET', path: '/customers', status: '200 ✓' },
                        { x: 258, method: 'POST', path: '/customers', status: '201 ✓' },
                        { x: 444, method: 'DELETE', path: '/customers/{id}', status: '204 ✓' },
                    ].map(({ x, method, path, status }) => {
                        const methodColor = method === 'GET' ? '#23d18b' : method === 'POST' ? '#5ca8ff' : '#ff5c5c';
                        const methodBg = method === 'GET' ? 'rgba(35,209,139,0.1)' : method === 'POST' ? 'rgba(92,168,255,0.1)' : 'rgba(255,92,92,0.1)';
                        return (
                            <g key={x}>
                                <rect x={x} y="604" width="190" height="90" rx="8" fill="rgba(255,255,255,0.03)" stroke="rgba(255,255,255,0.1)" strokeWidth="0.5" />
                                {/* method badge */}
                                <rect x={x + 10} y="616" width="48" height="18" rx="3" fill={methodBg} stroke={`${methodColor}60`} strokeWidth="0.5" />
                                <text x={x + 34} y="625" textAnchor="middle" dominantBaseline="central" style={{ fontSize: 9, fontWeight: 700, fill: methodColor, fontFamily: 'JetBrains Mono, monospace' }}>{method}</text>
                                <text x={x + 66} y="625" textAnchor="start" dominantBaseline="central" style={{ fontSize: 10, fill: 'var(--text-secondary)', fontFamily: 'JetBrains Mono, monospace' }}>{path}</text>
                                {/* auth header */}
                                <rect x={x + 10} y="641" width="170" height="28" rx="4" fill="rgba(130,100,255,0.08)" stroke="rgba(130,100,255,0.15)" strokeWidth="0.5" />
                                <text x={x + 95} y="651" textAnchor="middle" dominantBaseline="central" style={{ fontSize: 9, fill: '#9882ee', fontFamily: 'JetBrains Mono, monospace' }}>Authorization:</text>
                                <text x={x + 95} y="663" textAnchor="middle" dominantBaseline="central" style={{ fontSize: 9, fill: '#6a5fc0', fontFamily: 'JetBrains Mono, monospace' }}>Bearer &lt;token&gt; ✓ injected</text>
                                {/* status */}
                                <text x={x + 95} y="686" textAnchor="middle" dominantBaseline="central" style={{ fontSize: 11, fontWeight: 600, fill: '#23d18b', fontFamily: 'inherit' }}>{status}</text>
                            </g>
                        );
                    })}

                    {/* Batch label */}
                    <text x="340" y="708" textAnchor="middle" style={{ fontSize: 10, fill: 'var(--text-tertiary)', fontFamily: 'inherit' }}>All requests run in parallel batches of 5 · retried automatically on timeout</text>

                    <line x1="340" y1="716" x2="340" y2="744" stroke="rgba(255,255,255,0.15)" strokeWidth="1.2" markerEnd="url(#lf-arrow)" />

                    {/* ══════════════════════════════════════
              PHASE 4 — Results
              ══════════════════════════════════════ */}

                    <rect x="56" y="748" width="568" height="24" rx="4" fill="rgba(35,209,139,0.06)" stroke="rgba(35,209,139,0.12)" strokeWidth="0.5" />
                    <text x="340" y="760" textAnchor="middle" dominantBaseline="central" style={{ fontSize: 11, fontWeight: 600, fill: '#23d18b', fontFamily: 'inherit', letterSpacing: '0.06em' }}>
                        PHASE 4 — RESULTS &amp; AI BUG DETECTION
                    </text>

                    {[
                        { x: 72, color: '#23d18b', bg: 'rgba(35,209,139,0.08)', border: 'rgba(35,209,139,0.25)', title: '🔐 Login status', sub: 'Success or failure banner' },
                        { x: 258, color: '#5ca8ff', bg: 'rgba(92,168,255,0.08)', border: 'rgba(92,168,255,0.25)', title: 'Pass / Fail table', sub: 'Per-test HTTP status + time' },
                        { x: 444, color: '#ffb547', bg: 'rgba(255,181,71,0.08)', border: 'rgba(255,181,71,0.25)', title: 'AI bug analysis', sub: 'Root cause + suggested fix' },
                    ].map(({ x, color, bg, border, title, sub }) => (
                        <g key={x}>
                            <rect x={x} y="780" width="190" height="58" rx="8" fill={bg} stroke={border} strokeWidth="0.5" />
                            <text x={x + 95} y="800" textAnchor="middle" dominantBaseline="central" style={{ fontSize: 12, fontWeight: 600, fill: color, fontFamily: 'inherit' }}>{title}</text>
                            <text x={x + 95} y="820" textAnchor="middle" dominantBaseline="central" style={{ fontSize: 10, fill: 'var(--text-secondary)', fontFamily: 'inherit' }}>{sub}</text>
                        </g>
                    ))}

                    {[167, 353, 539].map(x => (
                        <line key={x} x1={x} y1="748" x2={x < 200 ? 167 : x < 400 ? 353 : 539} y2="780"
                            stroke="rgba(255,255,255,0.1)" strokeWidth="1" markerEnd="url(#lf-arrow)" />
                    ))}
                    <line x1="167" y1="748" x2="167" y2="780" stroke="rgba(255,255,255,0.1)" strokeWidth="1" markerEnd="url(#lf-arrow)" />
                    <line x1="353" y1="748" x2="353" y2="780" stroke="rgba(255,255,255,0.1)" strokeWidth="1" markerEnd="url(#lf-arrow)" />
                    <line x1="539" y1="748" x2="539" y2="780" stroke="rgba(255,255,255,0.1)" strokeWidth="1" markerEnd="url(#lf-arrow)" />

                </svg>
            </div>

            {/* ── Example token path reference ── */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
                <div className="card" style={{ padding: '18px 20px' }}>
                    <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 14, display: 'flex', alignItems: 'center', gap: 6 }}>
                        <span style={{ color: 'var(--green)' }}>✓</span> Common token paths
                    </div>
                    {[
                        ['token', '{ "token": "eyJ…" }'],
                        ['access_token', '{ "access_token": "eyJ…" }'],
                        ['data.token', '{ "data": { "token": "eyJ…" } }'],
                        ['data.access_token', '{ "data": { "access_token": "eyJ…" } }'],
                        ['result.auth.token', '{ "result": { "auth": { "token": "…" } } }'],
                    ].map(([path, example]) => (
                        <div key={path} style={{ display: 'flex', alignItems: 'baseline', gap: 12, padding: '7px 0', borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                            <code style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 11, color: 'var(--accent)', minWidth: 160, flexShrink: 0 }}>{path}</code>
                            <span style={{ fontSize: 11, color: 'var(--text-tertiary)', fontFamily: 'JetBrains Mono, monospace' }}>{example}</span>
                        </div>
                    ))}
                </div>

                <div className="card" style={{ padding: '18px 20px' }}>
                    <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 14, display: 'flex', alignItems: 'center', gap: 6 }}>
                        <span style={{ color: 'var(--amber)' }}>⚠</span> What happens if login fails
                    </div>
                    {[
                        ['Wrong credentials', 'Tests still run — you\'ll see 401s everywhere, which is useful'],
                        ['Token path wrong', 'Banner shows "could not find token at path X"'],
                        ['Login URL 404', 'Banner shows the exact HTTP error from your server'],
                        ['Network timeout', 'Login step times out after 10s, tests run without token'],
                        ['Token expires mid-run', 'Some tests may return 401 — re-run to get fresh token'],
                    ].map(([cause, effect]) => (
                        <div key={cause} style={{ padding: '7px 0', borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                            <div style={{ fontSize: 12, fontWeight: 500, color: 'var(--text-primary)', marginBottom: 2 }}>{cause}</div>
                            <div style={{ fontSize: 11, color: 'var(--text-secondary)' }}>{effect}</div>
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
}