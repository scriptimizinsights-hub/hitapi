import { useEffect, useRef, useState } from 'react';
import { PublicFooter } from './PublicFooter.jsx';
import { useNavigate } from 'react-router-dom';
import {
    Zap, Upload, Globe, Cpu, Play, Bug, BarChart3,
    ArrowRight, CheckCircle2, Shield, AlertTriangle, Activity, ExternalLink
} from 'lucide-react';

const STAGES = [
    {
        step: '01', icon: Upload, color: '#8264ff', bg: 'rgba(130,100,255,0.1)', border: 'rgba(130,100,255,0.25)',
        title: 'Import your API spec',
        subtitle: 'Paste a Swagger URL — done.',
        description: 'HitAPI fetches and parses your OpenAPI 3.0, 3.1, or Swagger 2.0 spec automatically. Supports JSON and YAML.',
        details: ['OpenAPI 3.0 / 3.1 / Swagger 2.0', 'JSON and YAML formats', 'Extracts paths, methods, schemas, auth'],
    },
    {
        step: '02', icon: Globe, color: '#23d18b', bg: 'rgba(35,209,139,0.1)', border: 'rgba(35,209,139,0.25)',
        title: 'Endpoint discovery',
        subtitle: 'Every route, automatically mapped.',
        description: 'Every path and method is extracted and stored. You get a live inventory with method breakdown, parameter counts, tags, and request/response schemas.',
        details: ['All HTTP methods', 'Path parameters and query params', 'Request body schemas', 'Grouped by OpenAPI tags'],
    },
    {
        step: '03', icon: Cpu, color: '#ffb547', bg: 'rgba(255,181,71,0.1)', border: 'rgba(255,181,71,0.25)',
        title: 'AI test generation',
        subtitle: 'Cloudflare Workers AI writes your test suite.',
        description: 'Each endpoint\'s schema is sent to Cloudflare Workers AI. The model generates structured test cases covering the full spectrum from happy paths to attack vectors.',
        details: ['Positive — valid payloads, expect 2xx', 'Negative — missing/invalid fields, expect 4xx', 'Boundary — empty, null, max length', 'Security — SQL injection, XSS attempts'],
    },
    {
        step: '04', icon: Play, color: '#5ca8ff', bg: 'rgba(92,168,255,0.1)', border: 'rgba(92,168,255,0.25)',
        title: 'Execute against your API',
        subtitle: 'Real HTTP calls, sequential flow suites.',
        description: 'The execution engine fires real HTTP requests against your API. Flow suites run signup → login → authenticated endpoints in order, passing tokens automatically.',
        details: ['Flow suite execution (signup → login → test)', 'Token extraction and injection', 'Security sub-checks per step', 'Async via Cloudflare Queues'],
    },
    {
        step: '05', icon: Bug, color: '#ff5c5c', bg: 'rgba(255,92,92,0.1)', border: 'rgba(255,92,92,0.25)',
        title: 'AI bug detection',
        subtitle: 'Root cause, not just "test failed".',
        description: 'Every failed test is analyzed by Workers AI. Instead of a raw error, you get severity, a human-readable description, the likely root cause, and a suggested fix.',
        details: ['Critical / High / Medium / Low severity', 'Root cause analysis', 'Suggested fix per bug', 'Dismiss or track to resolution'],
    },
    {
        step: '06', icon: BarChart3, color: '#c084fc', bg: 'rgba(192,132,252,0.1)', border: 'rgba(192,132,252,0.25)',
        title: 'Reports &amp; monitoring',
        subtitle: 'Full run history, always available.',
        description: 'Every flow suite run generates a report with pass rate, step-by-step results, timing, and bug counts. Set up monitors to re-run on a schedule.',
        details: ['Pass rate and step breakdown', 'Per-step security check results', 'AI bug analysis per failure', 'Scheduled monitoring'],
    },
];

const TEST_TYPES = [
    { type: 'Positive', color: '#23d18b', bg: 'rgba(35,209,139,0.1)', example: 'Valid payload → expect 200', icon: CheckCircle2 },
    { type: 'Negative', color: '#ff5c5c', bg: 'rgba(255,92,92,0.1)', example: 'Missing field → expect 400', icon: AlertTriangle },
    { type: 'Boundary', color: '#ffb547', bg: 'rgba(255,181,71,0.1)', example: 'Empty string → expect 422', icon: Activity },
    { type: 'Security', color: '#ff7eb3', bg: 'rgba(255,126,179,0.1)', example: 'SQL injection → expect 400', icon: Shield },
];

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

export function HowItWorks() {
    const navigate = useNavigate();

    return (
        <div style={{ minHeight: '100vh', background: 'var(--bg)', overflowX: 'hidden' }}>

            {/* Nav */}
            <nav style={{
                position: 'sticky', top: 0, zIndex: 50,
                background: 'rgba(10,10,15,0.9)', backdropFilter: 'blur(12px)',
                borderBottom: '1px solid var(--border)',
                padding: '14px 40px', display: 'flex', alignItems: 'center', justifyContent: 'space-between'
            }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <div style={{ width: 28, height: 28, borderRadius: 8, background: 'linear-gradient(135deg, #8264ff, #5ca8ff)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        <Zap size={14} color="#fff" />
                    </div>
                    <span style={{ fontSize: 15, fontWeight: 600 }}>HitAPI</span>
                    <span style={{ fontSize: 11, color: 'var(--text-tertiary)', marginLeft: 4 }}>· How it works</span>
                </div>
                <button onClick={() => navigate('/')} className="btn btn-primary btn-sm" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    Open app <ArrowRight size={13} />
                </button>
            </nav>

            {/* Hero */}
            <div style={{ textAlign: 'center', padding: '80px 40px 60px', position: 'relative' }}>
                <div style={{
                    position: 'absolute', top: 0, left: '50%', transform: 'translateX(-50%)',
                    width: 600, height: 300,
                    background: 'radial-gradient(ellipse at center, rgba(130,100,255,0.12) 0%, transparent 70%)',
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

                <h1 style={{ fontSize: 48, fontWeight: 700, letterSpacing: '-0.03em', lineHeight: 1.1, marginBottom: 20 }}>
                    From Swagger URL to{' '}
                    <span style={{ background: 'linear-gradient(135deg, #8264ff, #5ca8ff)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
                        AI test suite
                    </span>
                    {' '}in seconds.
                </h1>

                <p style={{ fontSize: 17, color: 'var(--text-secondary)', maxWidth: 520, margin: '0 auto 40px', lineHeight: 1.7 }}>
                    HitAPI reads your API spec, generates comprehensive test cases with AI,
                    executes them against your live API, and tells you exactly what broke and why.
                </p>

                <div style={{ display: 'flex', gap: 12, justifyContent: 'center' }}>
                    <button onClick={() => navigate('/')} className="btn btn-primary" style={{ fontSize: 15, padding: '11px 26px', display: 'flex', alignItems: 'center', gap: 8 }}>
                        Start testing <ArrowRight size={16} />
                    </button>
                    <a href="https://github.com/yadavsunil9699" target="_blank" rel="noopener noreferrer" className="btn btn-ghost" style={{ fontSize: 15, padding: '11px 26px', display: 'flex', alignItems: 'center', gap: 8 }}>
                        View on GitHub <ExternalLink size={14} />
                    </a>
                </div>
            </div>

            {/* Stats */}
            <div style={{ padding: '0 40px 80px' }}>
                <div style={{
                    maxWidth: 800, margin: '0 auto',
                    display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)',
                    background: 'var(--border)', gap: 1,
                    border: '1px solid var(--border)', borderRadius: 16, overflow: 'hidden'
                }}>
                    {[
                        { val: 100, suffix: '+', label: 'Steps per suite', color: '#8264ff' },
                        { val: 4, suffix: ' types', label: 'Test categories', color: '#23d18b' },
                        { val: 4, suffix: ' checks', label: 'Security checks per step', color: '#ffb547' },
                        { val: 0, suffix: ' config', label: 'Infrastructure needed', color: '#5ca8ff' },
                    ].map((s, i) => (
                        <div key={i} style={{ background: 'var(--bg-card)', padding: '26px 20px', textAlign: 'center' }}>
                            <div style={{ fontSize: 34, fontWeight: 700, color: s.color, letterSpacing: '-0.02em', marginBottom: 6 }}>
                                <Counter to={s.val} suffix={s.suffix} />
                            </div>
                            <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{s.label}</div>
                        </div>
                    ))}
                </div>
            </div>

            {/* Test types */}
            <div style={{ padding: '0 40px 80px' }}>
                <div style={{ maxWidth: 860, margin: '0 auto' }}>
                    <div style={{ textAlign: 'center', marginBottom: 36 }}>
                        <h2 style={{ fontSize: 30, fontWeight: 600, letterSpacing: '-0.02em', marginBottom: 8 }}>4 categories of AI-generated tests</h2>
                        <p style={{ color: 'var(--text-secondary)', fontSize: 14 }}>Every endpoint gets a full matrix — not just happy paths.</p>
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12 }}>
                        {TEST_TYPES.map(({ type, color, bg, example, icon: Icon }) => (
                            <div key={type} style={{ background: 'var(--bg-card)', border: `1px solid ${color}30`, borderRadius: 14, padding: '20px 16px', borderTop: `3px solid ${color}` }}>
                                <div style={{ width: 36, height: 36, borderRadius: 10, background: bg, display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 12 }}>
                                    <Icon size={16} color={color} />
                                </div>
                                <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 5, color }}>{type}</div>
                                <div style={{ fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.6 }}>{example}</div>
                            </div>
                        ))}
                    </div>
                </div>
            </div>

            {/* Steps — simple vertical list */}
            <div style={{ padding: '0 40px 80px' }}>
                <div style={{ maxWidth: 700, margin: '0 auto' }}>
                    <div style={{ textAlign: 'center', marginBottom: 48 }}>
                        <h2 style={{ fontSize: 30, fontWeight: 600, letterSpacing: '-0.02em', marginBottom: 8 }}>How it works — step by step</h2>
                        <p style={{ color: 'var(--text-secondary)', fontSize: 14 }}>Six stages, fully automated on Cloudflare's edge.</p>
                    </div>

                    <div style={{ position: 'relative' }}>
                        {/* Vertical line */}
                        <div style={{
                            position: 'absolute', left: 23, top: 24, bottom: 24, width: 1,
                            background: 'linear-gradient(to bottom, transparent, var(--border) 10%, var(--border) 90%, transparent)'
                        }} />

                        <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
                            {STAGES.map((s, i) => {
                                const Icon = s.icon;
                                return (
                                    <div key={s.step} style={{ display: 'flex', gap: 20, paddingBottom: i < STAGES.length - 1 ? 32 : 0 }}>
                                        {/* Icon */}
                                        <div style={{
                                            width: 48, height: 48, borderRadius: '50%', flexShrink: 0,
                                            background: s.bg, border: `2px solid ${s.color}`,
                                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                                            boxShadow: `0 0 16px ${s.color}30`, zIndex: 1
                                        }}>
                                            <Icon size={20} color={s.color} />
                                        </div>

                                        {/* Content */}
                                        <div style={{ flex: 1, paddingTop: 4 }}>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                                                <span style={{ fontSize: 10, fontWeight: 700, color: s.color, letterSpacing: '.08em' }}>STEP {s.step}</span>
                                            </div>
                                            <h3 style={{ fontSize: 16, fontWeight: 600, marginBottom: 4 }}>{s.title}</h3>
                                            <p style={{ fontSize: 12, color: s.color, fontWeight: 500, marginBottom: 8 }}>{s.subtitle}</p>
                                            <p style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.7, marginBottom: 12 }}>{s.description}</p>
                                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                                                {s.details.map(d => (
                                                    <span key={d} style={{ fontSize: 11, padding: '2px 8px', borderRadius: 5, background: s.bg, color: s.color, border: `1px solid ${s.border}` }}>
                                                        {d}
                                                    </span>
                                                ))}
                                            </div>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                </div>
            </div>

            {/* CTA */}
            <div style={{ textAlign: 'center', padding: '60px 40px 80px' }}>
                <div style={{ display: 'inline-block', background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 20, padding: '48px 56px', position: 'relative', overflow: 'hidden' }}>
                    <div style={{ position: 'absolute', top: -60, left: '50%', transform: 'translateX(-50%)', width: 300, height: 200, background: 'radial-gradient(ellipse, rgba(130,100,255,0.15) 0%, transparent 70%)', pointerEvents: 'none' }} />
                    <div style={{ fontSize: 32, fontWeight: 700, letterSpacing: '-0.02em', marginBottom: 10 }}>Ready to test your API?</div>
                    <p style={{ color: 'var(--text-secondary)', fontSize: 15, marginBottom: 28, maxWidth: 380 }}>
                        Import a Swagger URL and get your first AI-generated test suite in under 60 seconds.
                    </p>
                    <button onClick={() => navigate('/')} className="btn btn-primary" style={{ fontSize: 15, padding: '12px 32px', display: 'inline-flex', alignItems: 'center', gap: 8, borderRadius: 10 }}>
                        <Zap size={16} /> Get started free
                    </button>
                </div>
            </div>

            {/* Footer */}
            <div style={{ borderTop: '1px solid var(--border)', padding: '20px 40px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <Zap size={13} color="#8264ff" />
                    <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>HitAPI — AI-powered API testing on Cloudflare</span>
                </div>
                <div style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>Powered by Workers AI · D1 · KV · R2 · Queues</div>
            </div>
            <PublicFooter />
        </div>
    );
}