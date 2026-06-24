import { useNavigate } from 'react-router-dom';
import { Zap, ArrowLeft } from 'lucide-react';

export function FlowDiagram() {
    const navigate = useNavigate();

    return (
        <div className="page">
            <div className="page-header" style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
                <div>
                    <h1 className="page-title">How it works</h1>
                    <p className="page-subtitle">End-to-end flow — from Swagger URL to AI bug report</p>
                </div>
                <button className="btn btn-ghost" onClick={() => navigate(-1)} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <ArrowLeft size={14} /> Back
                </button>
            </div>

            <div className="card" style={{ padding: '32px 24px', overflow: 'hidden' }}>
                <svg width="100%" viewBox="0 0 680 740" role="img" xmlns="http://www.w3.org/2000/svg">
                    <title>APIForge application flow diagram</title>
                    <desc>End-to-end flow from Swagger import through AI test generation, execution, and bug reporting</desc>
                    <defs>
                        <marker id="af-arrow" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
                            <path d="M2 1L8 5L2 9" fill="none" stroke="context-stroke" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                        </marker>
                    </defs>

                    {/* ── Step numbers ── */}
                    {[98, 220, 350, 490, 630].map((y, i) => (
                        <text key={i} x="36" y={y} textAnchor="middle" dominantBaseline="central"
                            style={{ fontSize: 11, fill: 'var(--text-tertiary)', fontFamily: 'JetBrains Mono, monospace' }}>
                            {i + 1}
                        </text>
                    ))}

                    {/* ══ STAGE 1 — Import ══ */}
                    {/* Create project */}
                    <g style={{ cursor: 'pointer' }}>
                        <rect x="56" y="68" width="174" height="56" rx="8" fill="rgba(130,100,255,0.12)" stroke="rgba(130,100,255,0.4)" strokeWidth="0.5" />
                        <text x="143" y="90" textAnchor="middle" dominantBaseline="central" style={{ fontSize: 13, fontWeight: 600, fill: '#c4b8ff', fontFamily: 'inherit' }}>Create project</text>
                        <text x="143" y="110" textAnchor="middle" dominantBaseline="central" style={{ fontSize: 11, fill: '#9882ee', fontFamily: 'inherit' }}>Name · base URL · auth</text>
                    </g>

                    {/* Arrow */}
                    <line x1="230" y1="96" x2="262" y2="96" stroke="#8264ff" strokeWidth="1.2" markerEnd="url(#af-arrow)" opacity="0.6" />

                    {/* Import Swagger */}
                    <g style={{ cursor: 'pointer' }}>
                        <rect x="266" y="68" width="174" height="56" rx="8" fill="rgba(130,100,255,0.12)" stroke="rgba(130,100,255,0.4)" strokeWidth="0.5" />
                        <text x="353" y="90" textAnchor="middle" dominantBaseline="central" style={{ fontSize: 13, fontWeight: 600, fill: '#c4b8ff', fontFamily: 'inherit' }}>Import Swagger</text>
                        <text x="353" y="110" textAnchor="middle" dominantBaseline="central" style={{ fontSize: 11, fill: '#9882ee', fontFamily: 'inherit' }}>OpenAPI 3.0 · 2.0 · YAML</text>
                    </g>

                    {/* Arrow */}
                    <line x1="440" y1="96" x2="472" y2="96" stroke="#8264ff" strokeWidth="1.2" markerEnd="url(#af-arrow)" opacity="0.6" />

                    {/* Parse spec */}
                    <g style={{ cursor: 'pointer' }}>
                        <rect x="476" y="68" width="148" height="56" rx="8" fill="rgba(130,100,255,0.12)" stroke="rgba(130,100,255,0.4)" strokeWidth="0.5" />
                        <text x="550" y="90" textAnchor="middle" dominantBaseline="central" style={{ fontSize: 13, fontWeight: 600, fill: '#c4b8ff', fontFamily: 'inherit' }}>Parse spec</text>
                        <text x="550" y="110" textAnchor="middle" dominantBaseline="central" style={{ fontSize: 11, fill: '#9882ee', fontFamily: 'inherit' }}>Paths · params · schemas</text>
                    </g>

                    {/* KV cache note */}
                    <line x1="550" y1="124" x2="550" y2="148" stroke="rgba(255,255,255,0.1)" strokeWidth="1" strokeDasharray="3 2" />
                    <rect x="476" y="148" width="148" height="28" rx="4" fill="rgba(255,255,255,0.04)" stroke="rgba(255,255,255,0.08)" strokeWidth="0.5" />
                    <text x="550" y="162" textAnchor="middle" dominantBaseline="central" style={{ fontSize: 10, fill: 'var(--text-tertiary)', fontFamily: 'inherit' }}>Cached in KV (1 hr)</text>

                    {/* ══ STAGE 2 — D1 ══ */}
                    <line x1="340" y1="148" x2="340" y2="176" stroke="rgba(255,255,255,0.15)" strokeWidth="1.2" markerEnd="url(#af-arrow)" />
                    <g style={{ cursor: 'pointer' }}>
                        <rect x="56" y="176" width="568" height="56" rx="8" fill="rgba(35,209,139,0.08)" stroke="rgba(35,209,139,0.35)" strokeWidth="0.5" />
                        <text x="340" y="197" textAnchor="middle" dominantBaseline="central" style={{ fontSize: 13, fontWeight: 600, fill: '#6ee7bf', fontFamily: 'inherit' }}>Endpoint inventory saved to D1 (Cloudflare SQLite)</text>
                        <text x="340" y="217" textAnchor="middle" dominantBaseline="central" style={{ fontSize: 11, fill: '#3db88a', fontFamily: 'inherit' }}>GET · POST · PUT · DELETE · PATCH — each stored with path, method, schema, tags</text>
                    </g>

                    {/* ══ STAGE 3 — AI Generation ══ */}
                    <line x1="340" y1="232" x2="340" y2="270" stroke="rgba(255,255,255,0.15)" strokeWidth="1.2" markerEnd="url(#af-arrow)" />

                    {/* Select scope */}
                    <g style={{ cursor: 'pointer' }}>
                        <rect x="56" y="270" width="128" height="76" rx="8" fill="rgba(255,255,255,0.04)" stroke="rgba(255,255,255,0.1)" strokeWidth="0.5" />
                        <text x="120" y="290" textAnchor="middle" dominantBaseline="central" style={{ fontSize: 12, fontWeight: 600, fill: 'var(--text-secondary)', fontFamily: 'inherit' }}>Select scope</text>
                        <text x="120" y="308" textAnchor="middle" dominantBaseline="central" style={{ fontSize: 10, fill: 'var(--text-tertiary)', fontFamily: 'inherit' }}>All · by tag</text>
                        <text x="120" y="323" textAnchor="middle" dominantBaseline="central" style={{ fontSize: 10, fill: 'var(--text-tertiary)', fontFamily: 'inherit' }}>by method · pick</text>
                    </g>

                    <line x1="184" y1="308" x2="210" y2="308" stroke="#ffb547" strokeWidth="1.2" markerEnd="url(#af-arrow)" opacity="0.7" />

                    {/* Workers AI */}
                    <g style={{ cursor: 'pointer' }}>
                        <rect x="214" y="270" width="200" height="76" rx="8" fill="rgba(255,181,71,0.1)" stroke="rgba(255,181,71,0.4)" strokeWidth="0.5" />
                        <text x="314" y="290" textAnchor="middle" dominantBaseline="central" style={{ fontSize: 13, fontWeight: 600, fill: '#ffd080', fontFamily: 'inherit' }}>Workers AI</text>
                        <text x="314" y="308" textAnchor="middle" dominantBaseline="central" style={{ fontSize: 11, fill: '#c89240', fontFamily: 'inherit' }}>mistral-7b-instruct</text>
                        <text x="314" y="324" textAnchor="middle" dominantBaseline="central" style={{ fontSize: 11, fill: '#c89240', fontFamily: 'inherit' }}>Prompt → JSON test cases</text>
                    </g>

                    <line x1="414" y1="308" x2="440" y2="308" stroke="#ffb547" strokeWidth="1.2" markerEnd="url(#af-arrow)" opacity="0.7" />

                    {/* 4 test types */}
                    <g style={{ cursor: 'pointer' }}>
                        <rect x="444" y="270" width="180" height="76" rx="8" fill="rgba(255,255,255,0.04)" stroke="rgba(255,255,255,0.1)" strokeWidth="0.5" />
                        <text x="534" y="288" textAnchor="middle" dominantBaseline="central" style={{ fontSize: 12, fontWeight: 600, fill: 'var(--text-secondary)', fontFamily: 'inherit' }}>4 test types</text>
                        <text x="534" y="305" textAnchor="middle" dominantBaseline="central" style={{ fontSize: 10, fill: '#23d18b', fontFamily: 'inherit' }}>✓ Positive (2xx)</text>
                        <text x="534" y="320" textAnchor="middle" dominantBaseline="central" style={{ fontSize: 10, fill: 'var(--text-tertiary)', fontFamily: 'inherit' }}>✗ Negative · ◈ Boundary</text>
                        <text x="534" y="335" textAnchor="middle" dominantBaseline="central" style={{ fontSize: 10, fill: '#ff7eb3', fontFamily: 'inherit' }}>⚠ Security (SQLi, XSS)</text>
                    </g>

                    {/* ══ STAGE 4 — Execution ══ */}
                    <line x1="340" y1="346" x2="340" y2="430" stroke="rgba(255,255,255,0.15)" strokeWidth="1.2" markerEnd="url(#af-arrow)" />

                    {/* Queue dashed branch */}
                    <line x1="340" y1="388" x2="200" y2="388" stroke="rgba(255,255,255,0.12)" strokeWidth="1" strokeDasharray="4 3" />
                    <line x1="200" y1="388" x2="200" y2="428" stroke="rgba(255,255,255,0.12)" strokeWidth="1" strokeDasharray="4 3" markerEnd="url(#af-arrow)" />
                    <text x="264" y="382" textAnchor="middle" style={{ fontSize: 10, fill: 'var(--text-tertiary)', fontFamily: 'inherit' }}>via Queue</text>

                    {/* Execution engine */}
                    <g style={{ cursor: 'pointer' }}>
                        <rect x="56" y="430" width="568" height="56" rx="8" fill="rgba(92,168,255,0.08)" stroke="rgba(92,168,255,0.35)" strokeWidth="0.5" />
                        <text x="340" y="451" textAnchor="middle" dominantBaseline="central" style={{ fontSize: 13, fontWeight: 600, fill: '#8dc6ff', fontFamily: 'inherit' }}>Execution engine — runs tests in parallel batches (5 at a time)</text>
                        <text x="340" y="470" textAnchor="middle" dominantBaseline="central" style={{ fontSize: 11, fill: '#4a8ac4', fontFamily: 'inherit' }}>fetch() each endpoint · capture status, body, headers, response time · retry on error</text>
                    </g>

                    {/* ══ STAGE 5 — Results ══ */}
                    {/* Fan out lines */}
                    <line x1="138" y1="486" x2="138" y2="524" stroke="rgba(255,255,255,0.12)" strokeWidth="1" markerEnd="url(#af-arrow)" />
                    <line x1="340" y1="486" x2="340" y2="524" stroke="rgba(255,255,255,0.12)" strokeWidth="1" markerEnd="url(#af-arrow)" />
                    <line x1="542" y1="486" x2="542" y2="524" stroke="rgba(255,255,255,0.12)" strokeWidth="1" markerEnd="url(#af-arrow)" />

                    {/* Validate result */}
                    <g style={{ cursor: 'pointer' }}>
                        <rect x="56" y="524" width="164" height="76" rx="8" fill="rgba(35,209,139,0.08)" stroke="rgba(35,209,139,0.3)" strokeWidth="0.5" />
                        <text x="138" y="544" textAnchor="middle" dominantBaseline="central" style={{ fontSize: 12, fontWeight: 600, fill: '#6ee7bf', fontFamily: 'inherit' }}>Validate result</text>
                        <text x="138" y="562" textAnchor="middle" dominantBaseline="central" style={{ fontSize: 10, fill: '#3db88a', fontFamily: 'inherit' }}>Status code match</text>
                        <text x="138" y="578" textAnchor="middle" dominantBaseline="central" style={{ fontSize: 10, fill: '#3db88a', fontFamily: 'inherit' }}>Schema diff → pass/fail</text>
                    </g>

                    {/* AI bug analysis */}
                    <g style={{ cursor: 'pointer' }}>
                        <rect x="238" y="524" width="204" height="76" rx="8" fill="rgba(255,181,71,0.08)" stroke="rgba(255,181,71,0.3)" strokeWidth="0.5" />
                        <text x="340" y="544" textAnchor="middle" dominantBaseline="central" style={{ fontSize: 12, fontWeight: 600, fill: '#ffd080', fontFamily: 'inherit' }}>AI bug analysis</text>
                        <text x="340" y="562" textAnchor="middle" dominantBaseline="central" style={{ fontSize: 10, fill: '#c89240', fontFamily: 'inherit' }}>Workers AI reviews failures</text>
                        <text x="340" y="578" textAnchor="middle" dominantBaseline="central" style={{ fontSize: 10, fill: '#c89240', fontFamily: 'inherit' }}>Severity · root cause · fix</text>
                    </g>

                    {/* Generate report */}
                    <g style={{ cursor: 'pointer' }}>
                        <rect x="460" y="524" width="164" height="76" rx="8" fill="rgba(130,100,255,0.1)" stroke="rgba(130,100,255,0.3)" strokeWidth="0.5" />
                        <text x="542" y="544" textAnchor="middle" dominantBaseline="central" style={{ fontSize: 12, fontWeight: 600, fill: '#c4b8ff', fontFamily: 'inherit' }}>Generate report</text>
                        <text x="542" y="562" textAnchor="middle" dominantBaseline="central" style={{ fontSize: 10, fill: '#9882ee', fontFamily: 'inherit' }}>HTML / JSON / CSV</text>
                        <text x="542" y="578" textAnchor="middle" dominantBaseline="central" style={{ fontSize: 10, fill: '#9882ee', fontFamily: 'inherit' }}>Stored in R2</text>
                    </g>

                    {/* ══ STAGE 5 → Dashboard ══ */}
                    <line x1="340" y1="600" x2="340" y2="630" stroke="rgba(255,255,255,0.12)" strokeWidth="1" markerEnd="url(#af-arrow)" />
                    <line x1="542" y1="600" x2="542" y2="658" stroke="rgba(255,255,255,0.08)" strokeWidth="1" />
                    <line x1="542" y1="658" x2="626" y2="658" stroke="rgba(255,255,255,0.08)" strokeWidth="1" markerEnd="url(#af-arrow)" />

                    {/* Cron monitor loop */}
                    <line x1="138" y1="600" x2="138" y2="660" stroke="rgba(255,255,255,0.07)" strokeWidth="1" strokeDasharray="4 3" />
                    <line x1="138" y1="660" x2="56" y2="660" stroke="rgba(255,255,255,0.07)" strokeWidth="1" strokeDasharray="4 3" />
                    <line x1="56" y1="660" x2="56" y2="432" stroke="rgba(255,255,255,0.07)" strokeWidth="1" strokeDasharray="4 3" />
                    <line x1="56" y1="432" x2="56" y2="430" stroke="rgba(255,255,255,0.07)" strokeWidth="1" strokeDasharray="4 3" markerEnd="url(#af-arrow)" />
                    <text x="24" y="550" textAnchor="middle" style={{ fontSize: 9, fill: 'var(--text-tertiary)', fontFamily: 'inherit' }}>Cron</text>
                    <text x="24" y="562" textAnchor="middle" style={{ fontSize: 9, fill: 'var(--text-tertiary)', fontFamily: 'inherit' }}>monitor</text>
                    <text x="24" y="574" textAnchor="middle" style={{ fontSize: 9, fill: 'var(--text-tertiary)', fontFamily: 'inherit' }}>(5 min)</text>

                    {/* Dashboard */}
                    <g style={{ cursor: 'pointer' }}>
                        <rect x="238" y="630" width="386" height="56" rx="8" fill="rgba(255,255,255,0.04)" stroke="rgba(255,255,255,0.1)" strokeWidth="0.5" />
                        <text x="431" y="651" textAnchor="middle" dominantBaseline="central" style={{ fontSize: 13, fontWeight: 600, fill: 'var(--text-primary)', fontFamily: 'inherit' }}>Dashboard + alerts</text>
                        <text x="431" y="669" textAnchor="middle" dominantBaseline="central" style={{ fontSize: 11, fill: 'var(--text-secondary)', fontFamily: 'inherit' }}>Pass rate · bug list · execution history · Slack / email / webhook</text>
                    </g>
                </svg>
            </div>

            {/* Legend */}
            <div style={{ display: 'flex', gap: 20, marginTop: 20, flexWrap: 'wrap' }}>
                {[
                    { color: 'rgba(130,100,255,0.4)', label: 'Project setup' },
                    { color: 'rgba(35,209,139,0.35)', label: 'D1 storage' },
                    { color: 'rgba(255,181,71,0.4)', label: 'Workers AI' },
                    { color: 'rgba(92,168,255,0.35)', label: 'Execution engine' },
                    { color: 'rgba(255,255,255,0.12)', label: 'Results & reports' },
                ].map(({ color, label }) => (
                    <div key={label} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: 'var(--text-secondary)' }}>
                        <div style={{ width: 12, height: 12, borderRadius: 3, background: color, border: `1px solid ${color}`, flexShrink: 0 }} />
                        {label}
                    </div>
                ))}
            </div>
        </div>
    );
}