import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
    Zap, Upload, Globe, Cpu, Play, Bug, BarChart3,
    ArrowRight, CheckCircle2, Shield, AlertTriangle, Activity,
    ChevronRight, ExternalLink
} from 'lucide-react';

// ─── Data ────────────────────────────────────────────────────────────────────

const STAGES = [
    {
        id: 'import',
        step: '01',
        icon: Upload,
        color: '#8264ff',
        bg: 'rgba(130,100,255,0.1)',
        border: 'rgba(130,100,255,0.25)',
        title: 'Import your API spec',
        subtitle: 'Paste a Swagger URL — done.',
        description: 'APIForge fetches and parses your OpenAPI 3.0, 3.1, or Swagger 2.0 spec automatically. Supports JSON and YAML. The parsed spec is cached in Cloudflare KV for instant re-imports.',
        details: ['OpenAPI 3.0 / 3.1 / Swagger 2.0', 'JSON and YAML formats', 'Cached in KV for 1 hour', 'Extracts paths, methods, schemas, auth'],
        cfService: 'KV Cache'
    },
    {
        id: 'discover',
        step: '02',
        icon: Globe,
        color: '#23d18b',
        bg: 'rgba(35,209,139,0.1)',
        border: 'rgba(35,209,139,0.25)',
        title: 'Endpoint discovery',
        subtitle: 'Every route, automatically mapped.',
        description: 'Every path and method is extracted, normalized, and stored in Cloudflare D1. You get a live inventory with method breakdown, parameter counts, tags, and request/response schemas.',
        details: ['All HTTP methods (GET, POST, PUT, PATCH, DELETE)', 'Path parameters and query params', 'Request body schemas', 'Grouped by OpenAPI tags'],
        cfService: 'D1 Database'
    },
    {
        id: 'generate',
        step: '03',
        icon: Cpu,
        color: '#ffb547',
        bg: 'rgba(255,181,71,0.1)',
        border: 'rgba(255,181,71,0.25)',
        title: 'AI test generation',
        subtitle: 'Mistral 7B writes your test suite.',
        description: 'Each endpoint\'s schema is sent to Cloudflare Workers AI (Mistral 7B). The model generates a structured JSON array of test cases — covering the full spectrum from happy paths to attack vectors.',
        details: ['Positive — valid payloads, expect 2xx', 'Negative — missing/invalid fields, expect 4xx', 'Boundary — empty, null, max length edge cases', 'Security — SQL injection, XSS, IDOR attempts'],
        cfService: 'Workers AI'
    },
    {
        id: 'execute',
        step: '04',
        icon: Play,
        color: '#5ca8ff',
        bg: 'rgba(92,168,255,0.1)',
        border: 'rgba(92,168,255,0.25)',
        title: 'Execute against your API',
        subtitle: 'Real HTTP calls, parallel batches.',
        description: 'The execution engine fires real HTTP requests against your API in parallel batches of 5. Each request captures the status code, response body, headers, and response time. Failed requests are retried automatically.',
        details: ['Parallel execution (5 at a time)', 'Automatic retries with backoff', 'Configurable timeouts', 'Async via Cloudflare Queues'],
        cfService: 'Queues'
    },
    {
        id: 'detect',
        step: '05',
        icon: Bug,
        color: '#ff5c5c',
        bg: 'rgba(255,92,92,0.1)',
        border: 'rgba(255,92,92,0.25)',
        title: 'AI bug detection',
        subtitle: 'Root cause, not just "test failed".',
        description: 'Every failed test is analyzed by Workers AI. Instead of a raw error, you get severity, a human-readable description, the likely root cause, and a suggested fix — ready to paste into a GitHub issue.',
        details: ['Critical / High / Medium / Low severity', 'Root cause analysis', 'Suggested fix per bug', 'Dismiss or track to resolution'],
        cfService: 'Workers AI'
    },
    {
        id: 'report',
        step: '06',
        icon: BarChart3,
        color: '#c084fc',
        bg: 'rgba(192,132,252,0.1)',
        border: 'rgba(192,132,252,0.25)',
        title: 'Reports & monitoring',
        subtitle: 'Stored in R2, scheduled forever.',
        description: 'Full HTML, JSON, and CSV reports are generated and stored in Cloudflare R2. Set up a cron monitor to re-run your test suite every 5 minutes, hourly, or daily — with Slack, email, or webhook alerts on failure.',
        details: ['HTML / JSON / CSV export', 'Stored in Cloudflare R2', 'Cron-scheduled monitoring', 'Slack · Email · Webhook alerts'],
        cfService: 'R2 + Cron'
    }
];

const TEST_TYPES = [
    { type: 'Positive', color: '#23d18b', bg: 'rgba(35,209,139,0.1)', example: 'Valid payload → expect 200', icon: CheckCircle2 },
    { type: 'Negative', color: '#ff5c5c', bg: 'rgba(255,92,92,0.1)', example: 'Missing field → expect 400', icon: AlertTriangle },
    { type: 'Boundary', color: '#ffb547', bg: 'rgba(255,181,71,0.1)', example: 'Empty string → expect 422', icon: Activity },
    { type: 'Security', color: '#ff7eb3', bg: 'rgba(255,126,179,0.1)', example: 'SQL injection → expect 400', icon: Shield },
];

const ARCH = [
    { label: 'Frontend', sub: 'React + Vite', color: '#8264ff' },
    { label: 'Worker', sub: 'Cloudflare Workers', color: '#ffb547' },
    { label: 'Database', sub: 'Cloudflare D1', color: '#23d18b' },
    { label: 'Cache', sub: 'Cloudflare KV', color: '#5ca8ff' },
    { label: 'Queue', sub: 'Cloudflare Queues', color: '#ff7eb3' },
    { label: 'Storage', sub: 'Cloudflare R2', color: '#c084fc' },
    { label: 'AI', sub: 'Workers AI (Mistral)', color: '#ffb547' },
];

// ─── Animated counter ─────────────────────────────────────────────────────────

function Counter({ to, suffix = '' }) {
    const [val, setVal] = useState(0);
    const ref = useRef();
    useEffect(() => {
        const obs = new IntersectionObserver(([e]) => {
            if (!e.isIntersecting) return;
            obs.disconnect();
            let start = 0;
            const step = to / 40;
            const timer = setInterval(() => {
                start = Math.min(start + step, to);
                setVal(Math.round(start));
                if (start >= to) clearInterval(timer);
            }, 30);
        }, { threshold: 0.5 });
        if (ref.current) obs.observe(ref.current);
        return () => obs.disconnect();
    }, [to]);
    return <span ref={ref}>{val}{suffix}</span>;
}

// ─── Flow connector SVG ───────────────────────────────────────────────────────

function FlowConnector({ color }) {
    return (
        <div style={{ display: 'flex', justifyContent: 'center', margin: '4px 0' }}>
            <svg width="24" height="32" viewBox="0 0 24 32">
                <line x1="12" y1="0" x2="12" y2="24" stroke={color} strokeWidth="1.5" strokeDasharray="4 3" opacity="0.5" />
                <polygon points="6,20 18,20 12,30" fill={color} opacity="0.5" />
            </svg>
        </div>
    );
}

// ─── Stage card ───────────────────────────────────────────────────────────────

function StageCard({ stage, index, isVisible }) {
    const Icon = stage.icon;
    const isEven = index % 2 === 0;

    return (
        <div style={{
            display: 'grid',
            gridTemplateColumns: '1fr 80px 1fr',
            gap: 0,
            alignItems: 'center',
            opacity: isVisible ? 1 : 0,
            transform: isVisible ? 'translateY(0)' : 'translateY(24px)',
            transition: `opacity 0.5s ease ${index * 0.08}s, transform 0.5s ease ${index * 0.08}s`
        }}>
            {/* Left content */}
            <div style={{ padding: '0 24px 0 0', textAlign: isEven ? 'right' : 'left', order: isEven ? 0 : 2 }}>
                {isEven ? (
                    <div style={{
                        background: 'var(--bg-card)',
                        border: `1px solid ${stage.border}`,
                        borderRadius: 14,
                        padding: '22px 24px',
                        boxShadow: `0 0 0 1px ${stage.border}, 0 8px 32px rgba(0,0,0,0.3)`
                    }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, justifyContent: 'flex-end', marginBottom: 12 }}>
                            <span style={{ fontSize: 11, fontWeight: 700, color: stage.color, letterSpacing: '0.1em' }}>STEP {stage.step}</span>
                            <span style={{ fontSize: 10, padding: '2px 7px', borderRadius: 4, background: stage.bg, color: stage.color, fontWeight: 600 }}>
                                {stage.cfService}
                            </span>
                        </div>
                        <h3 style={{ fontSize: 17, fontWeight: 600, marginBottom: 6, color: 'var(--text-primary)' }}>{stage.title}</h3>
                        <p style={{ fontSize: 12, color: stage.color, fontWeight: 500, marginBottom: 10 }}>{stage.subtitle}</p>
                        <p style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.7, marginBottom: 14 }}>{stage.description}</p>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, alignItems: 'flex-end' }}>
                            {stage.details.map(d => (
                                <div key={d} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'var(--text-secondary)' }}>
                                    <span>{d}</span>
                                    <span style={{ width: 5, height: 5, borderRadius: '50%', background: stage.color, flexShrink: 0 }} />
                                </div>
                            ))}
                        </div>
                    </div>
                ) : <div />}
            </div>

            {/* Center spine */}
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', position: 'relative' }}>
                <div style={{
                    width: 52, height: 52, borderRadius: '50%',
                    background: stage.bg,
                    border: `2px solid ${stage.color}`,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    boxShadow: `0 0 20px ${stage.color}30`,
                    zIndex: 1, flexShrink: 0
                }}>
                    <Icon size={22} color={stage.color} />
                </div>
            </div>

            {/* Right content */}
            <div style={{ padding: '0 0 0 24px', order: isEven ? 2 : 0 }}>
                {!isEven ? (
                    <div style={{
                        background: 'var(--bg-card)',
                        border: `1px solid ${stage.border}`,
                        borderRadius: 14,
                        padding: '22px 24px',
                        boxShadow: `0 0 0 1px ${stage.border}, 0 8px 32px rgba(0,0,0,0.3)`
                    }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
                            <span style={{ fontSize: 11, fontWeight: 700, color: stage.color, letterSpacing: '0.1em' }}>STEP {stage.step}</span>
                            <span style={{ fontSize: 10, padding: '2px 7px', borderRadius: 4, background: stage.bg, color: stage.color, fontWeight: 600 }}>
                                {stage.cfService}
                            </span>
                        </div>
                        <h3 style={{ fontSize: 17, fontWeight: 600, marginBottom: 6 }}>{stage.title}</h3>
                        <p style={{ fontSize: 12, color: stage.color, fontWeight: 500, marginBottom: 10 }}>{stage.subtitle}</p>
                        <p style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.7, marginBottom: 14 }}>{stage.description}</p>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                            {stage.details.map(d => (
                                <div key={d} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'var(--text-secondary)' }}>
                                    <span style={{ width: 5, height: 5, borderRadius: '50%', background: stage.color, flexShrink: 0 }} />
                                    <span>{d}</span>
                                </div>
                            ))}
                        </div>
                    </div>
                ) : <div />}
            </div>
        </div>
    );
}

// ─── Main page ────────────────────────────────────────────────────────────────

export function HowItWorks() {
    const navigate = useNavigate();
    const [visible, setVisible] = useState(false);
    const sectionRef = useRef();

    useEffect(() => {
        const obs = new IntersectionObserver(([e]) => {
            if (e.isIntersecting) setVisible(true);
        }, { threshold: 0.1 });
        if (sectionRef.current) obs.observe(sectionRef.current);
        return () => obs.disconnect();
    }, []);

    return (
        <div style={{ minHeight: '100vh', background: 'var(--bg-app)', overflowX: 'hidden' }}>

            {/* ── Nav ── */}
            <nav style={{
                position: 'sticky', top: 0, zIndex: 50,
                background: 'rgba(10,10,15,0.85)', backdropFilter: 'blur(12px)',
                borderBottom: '1px solid var(--border)',
                padding: '14px 40px', display: 'flex', alignItems: 'center', justifyContent: 'space-between'
            }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <div style={{
                        width: 28, height: 28, borderRadius: 8, flexShrink: 0,
                        background: 'linear-gradient(135deg, #8264ff, #5ca8ff)',
                        display: 'flex', alignItems: 'center', justifyContent: 'center'
                    }}>
                        <Zap size={14} color="#fff" />
                    </div>
                    <span style={{ fontSize: 15, fontWeight: 600 }}>APIForge</span>
                    <span style={{ fontSize: 11, color: 'var(--text-tertiary)', marginLeft: 4 }}>How it works</span>
                </div>
                <button
                    onClick={() => navigate('/')}
                    className="btn btn-primary btn-sm"
                    style={{ display: 'flex', alignItems: 'center', gap: 6 }}
                >
                    Open app <ArrowRight size={13} />
                </button>
            </nav>

            {/* ── Hero ── */}
            <div style={{ textAlign: 'center', padding: '80px 40px 60px', position: 'relative' }}>
                {/* Background glow */}
                <div style={{
                    position: 'absolute', top: 0, left: '50%', transform: 'translateX(-50%)',
                    width: 600, height: 300,
                    background: 'radial-gradient(ellipse at center, rgba(130,100,255,0.15) 0%, transparent 70%)',
                    pointerEvents: 'none'
                }} />

                <div style={{
                    display: 'inline-flex', alignItems: 'center', gap: 6,
                    background: 'rgba(130,100,255,0.1)', border: '1px solid rgba(130,100,255,0.25)',
                    borderRadius: 20, padding: '5px 14px', fontSize: 12, color: '#8264ff',
                    fontWeight: 600, marginBottom: 24, letterSpacing: '0.04em'
                }}>
                    <Zap size={11} /> POWERED BY CLOUDFLARE WORKERS AI
                </div>

                <h1 style={{
                    fontSize: 52, fontWeight: 700, letterSpacing: '-0.03em',
                    lineHeight: 1.1, marginBottom: 20, maxWidth: 640, margin: '0 auto 20px'
                }}>
                    From Swagger URL to{' '}
                    <span style={{ background: 'linear-gradient(135deg, #8264ff, #5ca8ff)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
                        AI test suite
                    </span>
                    {' '}in seconds.
                </h1>

                <p style={{ fontSize: 18, color: 'var(--text-secondary)', maxWidth: 560, margin: '0 auto 40px', lineHeight: 1.7 }}>
                    APIForge reads your API spec, generates comprehensive test cases with AI,
                    executes them against your live API, and tells you exactly what broke and why.
                </p>

                <div style={{ display: 'flex', gap: 12, justifyContent: 'center', flexWrap: 'wrap' }}>
                    <button onClick={() => navigate('/')} className="btn btn-primary" style={{ fontSize: 15, padding: '12px 28px', display: 'flex', alignItems: 'center', gap: 8 }}>
                        Start testing <ArrowRight size={16} />
                    </button>
                    <a href="https://github.com" target="_blank" rel="noopener noreferrer" className="btn btn-ghost" style={{ fontSize: 15, padding: '12px 28px', display: 'flex', alignItems: 'center', gap: 8 }}>
                        View on GitHub <ExternalLink size={14} />
                    </a>
                </div>
            </div>

            {/* ── Stats ── */}
            <div style={{ padding: '0 40px 80px' }}>
                <div style={{
                    maxWidth: 900, margin: '0 auto',
                    display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)',
                    gap: 1, background: 'var(--border)',
                    border: '1px solid var(--border)', borderRadius: 16, overflow: 'hidden'
                }}>
                    {[
                        { val: 30, suffix: '+', label: 'Endpoints discovered', color: '#8264ff' },
                        { val: 4, suffix: ' types', label: 'Test categories', color: '#23d18b' },
                        { val: 100, suffix: '%', label: 'Cloudflare native', color: '#ffb547' },
                        { val: 0, suffix: ' config', label: 'Infrastructure needed', color: '#5ca8ff' },
                    ].map((s, i) => (
                        <div key={i} style={{ background: 'var(--bg-card)', padding: '28px 24px', textAlign: 'center' }}>
                            <div style={{ fontSize: 36, fontWeight: 700, color: s.color, letterSpacing: '-0.02em', marginBottom: 6 }}>
                                <Counter to={s.val} suffix={s.suffix} />
                            </div>
                            <div style={{ fontSize: 13, color: 'var(--text-secondary)' }}>{s.label}</div>
                        </div>
                    ))}
                </div>
            </div>

            {/* ── Test types ── */}
            <div style={{ padding: '0 40px 80px' }}>
                <div style={{ maxWidth: 900, margin: '0 auto' }}>
                    <div style={{ textAlign: 'center', marginBottom: 40 }}>
                        <h2 style={{ fontSize: 32, fontWeight: 600, letterSpacing: '-0.02em', marginBottom: 10 }}>
                            4 categories of AI-generated tests
                        </h2>
                        <p style={{ color: 'var(--text-secondary)', fontSize: 15 }}>
                            Every endpoint gets a full matrix — not just happy paths.
                        </p>
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12 }}>
                        {TEST_TYPES.map(({ type, color, bg, example, icon: Icon }) => (
                            <div key={type} style={{
                                background: 'var(--bg-card)',
                                border: `1px solid ${color}30`,
                                borderRadius: 14, padding: '22px 18px',
                                borderTop: `3px solid ${color}`
                            }}>
                                <div style={{
                                    width: 38, height: 38, borderRadius: 10, background: bg,
                                    display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 14
                                }}>
                                    <Icon size={18} color={color} />
                                </div>
                                <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 6, color }}>{type}</div>
                                <div style={{ fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.6 }}>{example}</div>
                            </div>
                        ))}
                    </div>
                </div>
            </div>

            {/* ── Flow diagram (timeline) ── */}
            <div ref={sectionRef} style={{ padding: '0 40px 80px' }}>
                <div style={{ maxWidth: 900, margin: '0 auto' }}>
                    <div style={{ textAlign: 'center', marginBottom: 60 }}>
                        <h2 style={{ fontSize: 32, fontWeight: 600, letterSpacing: '-0.02em', marginBottom: 10 }}>
                            How it works — step by step
                        </h2>
                        <p style={{ color: 'var(--text-secondary)', fontSize: 15 }}>
                            Six stages, fully automated on Cloudflare's edge.
                        </p>
                    </div>

                    {/* Timeline spine */}
                    <div style={{ position: 'relative' }}>
                        {/* Center line */}
                        <div style={{
                            position: 'absolute', left: '50%', top: 26, bottom: 26,
                            width: 1, background: 'linear-gradient(to bottom, transparent, var(--border) 10%, var(--border) 90%, transparent)',
                            transform: 'translateX(-50%)', zIndex: 0
                        }} />

                        <div style={{ display: 'flex', flexDirection: 'column', gap: 32 }}>
                            {STAGES.map((stage, i) => (
                                <StageCard key={stage.id} stage={stage} index={i} isVisible={visible} />
                            ))}
                        </div>
                    </div>
                </div>
            </div>

            {/* ── Architecture strip ── */}
            <div style={{ background: 'var(--bg-surface)', borderTop: '1px solid var(--border)', borderBottom: '1px solid var(--border)', padding: '48px 40px' }}>
                <div style={{ maxWidth: 900, margin: '0 auto' }}>
                    <div style={{ textAlign: 'center', marginBottom: 36 }}>
                        <h2 style={{ fontSize: 28, fontWeight: 600, letterSpacing: '-0.02em', marginBottom: 8 }}>Architecture</h2>
                        <p style={{ color: 'var(--text-secondary)', fontSize: 14 }}>100% Cloudflare — no servers, no ops, global edge.</p>
                    </div>
                    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', justifyContent: 'center' }}>
                        {ARCH.map(({ label, sub, color }) => (
                            <div key={label} style={{
                                background: 'var(--bg-card)',
                                border: `1px solid ${color}25`,
                                borderRadius: 12, padding: '16px 20px',
                                display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6,
                                minWidth: 110
                            }}>
                                <div style={{ width: 8, height: 8, borderRadius: '50%', background: color, boxShadow: `0 0 8px ${color}` }} />
                                <div style={{ fontSize: 13, fontWeight: 600, color }}>{label}</div>
                                <div style={{ fontSize: 11, color: 'var(--text-tertiary)', textAlign: 'center' }}>{sub}</div>
                            </div>
                        ))}
                    </div>

                    {/* Flow arrows between arch boxes */}
                    <div style={{ marginTop: 32, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4, flexWrap: 'wrap' }}>
                        {['Browser', 'Cloudflare Pages', 'Worker (Edge)', 'D1 + KV + R2 + Queue', 'Workers AI'].map((s, i, arr) => (
                            <div key={s} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                                <span style={{
                                    fontSize: 12, padding: '4px 10px', borderRadius: 6,
                                    background: 'var(--bg-input)', color: 'var(--text-secondary)',
                                    border: '1px solid var(--border)'
                                }}>{s}</span>
                                {i < arr.length - 1 && <ChevronRight size={14} color="var(--text-tertiary)" />}
                            </div>
                        ))}
                    </div>
                </div>
            </div>

            {/* ── CTA ── */}
            <div style={{ textAlign: 'center', padding: '80px 40px' }}>
                <div style={{
                    display: 'inline-block',
                    background: 'var(--bg-card)',
                    border: '1px solid var(--border)',
                    borderRadius: 24, padding: '52px 60px',
                    position: 'relative', overflow: 'hidden'
                }}>
                    {/* Glow */}
                    <div style={{
                        position: 'absolute', top: -60, left: '50%', transform: 'translateX(-50%)',
                        width: 300, height: 200,
                        background: 'radial-gradient(ellipse, rgba(130,100,255,0.2) 0%, transparent 70%)',
                        pointerEvents: 'none'
                    }} />

                    <div style={{ fontSize: 36, fontWeight: 700, letterSpacing: '-0.02em', marginBottom: 12 }}>
                        Ready to test your API?
                    </div>
                    <p style={{ color: 'var(--text-secondary)', fontSize: 16, marginBottom: 32, maxWidth: 400 }}>
                        Import a Swagger URL and get your first AI-generated test suite in under 60 seconds.
                    </p>
                    <button
                        onClick={() => navigate('/')}
                        className="btn btn-primary"
                        style={{ fontSize: 16, padding: '14px 36px', display: 'inline-flex', alignItems: 'center', gap: 8, borderRadius: 12 }}
                    >
                        <Zap size={17} /> Get started free
                    </button>
                </div>
            </div>

            {/* ── Footer ── */}
            <div style={{ borderTop: '1px solid var(--border)', padding: '24px 40px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <Zap size={14} color="#8264ff" />
                    <span style={{ fontSize: 13, color: 'var(--text-secondary)' }}>APIForge — AI-powered API testing on Cloudflare</span>
                </div>
                <div style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>
                    Powered by Workers AI · D1 · KV · R2 · Queues
                </div>
            </div>
        </div>
    );
}