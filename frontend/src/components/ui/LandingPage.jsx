import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { PublicFooter } from './PublicFooter.jsx';
import {
    Zap, ArrowRight, CheckCircle2, Play, Bug, BarChart3,
    Shield, Globe, Cpu, Upload, ChevronDown, ExternalLink,
    Terminal, GitBranch, Clock
} from 'lucide-react';

// ── Animated counter ───────────────────────────────────────────────────────────
function Counter({ to, suffix = '', prefix = '', duration = 1500 }) {
    const [val, setVal] = useState(0);
    const ref = useRef();
    useEffect(() => {
        const obs = new IntersectionObserver(([e]) => {
            if (!e.isIntersecting) return;
            obs.disconnect();
            const start = Date.now();
            const tick = () => {
                const elapsed = Date.now() - start;
                const progress = Math.min(elapsed / duration, 1);
                const eased = 1 - Math.pow(1 - progress, 3);
                setVal(Math.round(eased * to));
                if (progress < 1) requestAnimationFrame(tick);
            };
            requestAnimationFrame(tick);
        }, { threshold: 0.5 });
        if (ref.current) obs.observe(ref.current);
        return () => obs.disconnect();
    }, [to, duration]);
    return <span ref={ref}>{prefix}{val}{suffix}</span>;
}

// ── Typing animation for the hero code block ──────────────────────────────────
const TYPING_LINES = [
    { text: '# Import your Swagger spec', color: '#6c6c7c' },
    { text: 'swagger_url: https://api.example.com/docs', color: '#23d18b' },
    { text: '', color: '' },
    { text: '# AI generates 47 test cases', color: '#6c6c7c' },
    { text: '✓ POST /auth/signup         201', color: '#23d18b' },
    { text: '✓ POST /auth/login          200', color: '#23d18b' },
    { text: '✓ GET  /users/me            200', color: '#23d18b' },
    { text: '✗ DELETE /admin/users/1     500  ← bug found', color: '#ff5c5c' },
    { text: '', color: '' },
    { text: '# AI bug analysis', color: '#6c6c7c' },
    { text: 'severity: HIGH', color: '#ffb547' },
    { text: 'root_cause: FK constraint on activities', color: '#a8a8b8' },
    { text: 'fix: Delete related records first', color: '#8264ff' },
];

function TypingDemo() {
    const [visibleLines, setVisibleLines] = useState(0);
    const ref = useRef();
    const started = useRef(false);

    useEffect(() => {
        const obs = new IntersectionObserver(([e]) => {
            if (!e.isIntersecting || started.current) return;
            started.current = true;
            obs.disconnect();
            let i = 0;
            const next = () => {
                if (i >= TYPING_LINES.length) return;
                setVisibleLines(++i);
                setTimeout(next, i < 3 ? 300 : i < 8 ? 180 : 250);
            };
            setTimeout(next, 400);
        }, { threshold: 0.3 });
        if (ref.current) obs.observe(ref.current);
        return () => obs.disconnect();
    }, []);

    return (
        <div ref={ref} style={{
            background: '#0a0a0f',
            border: '1px solid rgba(255,255,255,0.08)',
            borderRadius: 14,
            padding: '20px 24px',
            fontFamily: 'JetBrains Mono, SF Mono, monospace',
            fontSize: 13,
            lineHeight: 1.9,
            minHeight: 280,
        }}>
            {/* Window chrome */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 20 }}>
                <div style={{ width: 12, height: 12, borderRadius: '50%', background: '#ff5f57' }} />
                <div style={{ width: 12, height: 12, borderRadius: '50%', background: '#febc2e' }} />
                <div style={{ width: 12, height: 12, borderRadius: '50%', background: '#28c840' }} />
                <span style={{ marginLeft: 8, fontSize: 11, color: '#6c6c7c' }}>hitapi — terminal</span>
            </div>

            {TYPING_LINES.slice(0, visibleLines).map((line, i) => (
                <div key={i} style={{ color: line.color || 'transparent', minHeight: '1.9em' }}>
                    {line.text || '\u00A0'}
                    {i === visibleLines - 1 && visibleLines < TYPING_LINES.length && (
                        <span style={{
                            display: 'inline-block', width: 8, height: 14,
                            background: '#8264ff', marginLeft: 2, verticalAlign: 'middle',
                            animation: 'blink 1s step-end infinite',
                        }} />
                    )}
                </div>
            ))}

            <style>{`@keyframes blink { 0%,100%{opacity:1} 50%{opacity:0} }`}</style>
        </div>
    );
}

// ── Main landing page ──────────────────────────────────────────────────────────
export function LandingPage({ onGetStarted }) {
    const navigate = useNavigate();
    const [scrolled, setScrolled] = useState(false);

    useEffect(() => {
        const onScroll = () => setScrolled(window.scrollY > 40);
        window.addEventListener('scroll', onScroll);
        return () => window.removeEventListener('scroll', onScroll);
    }, []);

    const go = () => onGetStarted ? onGetStarted() : navigate('/login');

    return (
        <div style={{ background: 'var(--bg)', color: 'var(--text-primary)', overflowX: 'hidden' }}>

            {/* ── Nav ── */}
            <nav style={{
                position: 'fixed', top: 0, left: 0, right: 0, zIndex: 100,
                padding: '0 40px',
                background: scrolled ? 'rgba(10,10,15,0.92)' : 'transparent',
                backdropFilter: scrolled ? 'blur(12px)' : 'none',
                borderBottom: scrolled ? '1px solid var(--border)' : '1px solid transparent',
                transition: 'all .3s',
                display: 'flex', alignItems: 'center', height: 60,
            }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, flex: 1 }}>
                    <div style={{ width: 28, height: 28, borderRadius: 8, background: 'linear-gradient(135deg,#8264ff,#5ca8ff)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                        <Zap size={14} color="#fff" />
                    </div>
                    <span style={{ fontSize: 15, fontWeight: 700, letterSpacing: '-0.01em' }}>HitAPI</span>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <button onClick={() => navigate('/how-it-works')} style={{ background: 'none', border: 'none', color: 'var(--text-secondary)', fontSize: 13, cursor: 'pointer', padding: '6px 12px', borderRadius: 7 }}>
                        How it works
                    </button>
                    <button onClick={() => navigate('/privacy')} style={{ background: 'none', border: 'none', color: 'var(--text-secondary)', fontSize: 13, cursor: 'pointer', padding: '6px 12px', borderRadius: 7 }}>
                        Privacy
                    </button>
                    <button onClick={go} style={{ background: 'none', border: '1px solid var(--border)', color: 'var(--text-primary)', fontSize: 13, cursor: 'pointer', padding: '6px 14px', borderRadius: 7, marginLeft: 4 }}>
                        Sign in
                    </button>
                    <button onClick={go} style={{ background: 'var(--accent)', border: 'none', color: '#fff', fontSize: 13, fontWeight: 600, cursor: 'pointer', padding: '7px 16px', borderRadius: 7 }}>
                        Get started free
                    </button>
                </div>
            </nav>

            {/* ── Hero ── */}
            <section style={{ padding: '140px 40px 100px', textAlign: 'center', position: 'relative', overflow: 'hidden' }}>
                {/* Ambient glow */}
                <div style={{ position: 'absolute', top: -100, left: '50%', transform: 'translateX(-50%)', width: 800, height: 500, background: 'radial-gradient(ellipse, rgba(130,100,255,0.15) 0%, transparent 70%)', pointerEvents: 'none' }} />
                <div style={{ position: 'absolute', top: 200, left: '20%', width: 300, height: 300, background: 'radial-gradient(ellipse, rgba(92,168,255,0.07) 0%, transparent 70%)', pointerEvents: 'none' }} />

                <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, background: 'rgba(130,100,255,0.1)', border: '1px solid rgba(130,100,255,0.25)', borderRadius: 20, padding: '5px 14px', fontSize: 12, color: 'var(--accent)', fontWeight: 600, marginBottom: 28, letterSpacing: '.04em' }}>
                    <Zap size={11} fill="currentColor" /> NOW LIVE ON CHROME WEB STORE
                </div>

                <h1 style={{ fontSize: 'clamp(36px, 6vw, 72px)', fontWeight: 800, letterSpacing: '-0.04em', lineHeight: 1.08, marginBottom: 24, maxWidth: 900, margin: '0 auto 24px' }}>
                    Your API tests write{' '}
                    <span style={{ background: 'linear-gradient(135deg, #8264ff 0%, #5ca8ff 50%, #23d18b 100%)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
                        themselves.
                    </span>
                </h1>

                <p style={{ fontSize: 19, color: 'var(--text-secondary)', maxWidth: 560, margin: '0 auto 44px', lineHeight: 1.7 }}>
                    Import a Swagger spec. HitAPI generates comprehensive test cases with AI,
                    runs them against your live API, and tells you exactly what broke and why.
                </p>

                <div style={{ display: 'flex', gap: 12, justifyContent: 'center', flexWrap: 'wrap', marginBottom: 16 }}>
                    <button onClick={go} style={{ display: 'flex', alignItems: 'center', gap: 8, background: 'var(--accent)', border: 'none', color: '#fff', fontSize: 15, fontWeight: 600, cursor: 'pointer', padding: '13px 28px', borderRadius: 10 }}>
                        Start testing for free <ArrowRight size={16} />
                    </button>
                    <button onClick={() => navigate('/how-it-works')} style={{ display: 'flex', alignItems: 'center', gap: 8, background: 'rgba(255,255,255,0.05)', border: '1px solid var(--border)', color: 'var(--text-primary)', fontSize: 15, cursor: 'pointer', padding: '13px 28px', borderRadius: 10 }}>
                        <Play size={14} fill="currentColor" /> See how it works
                    </button>
                </div>
                <p style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>No credit card · No infrastructure to set up · Free to start</p>
            </section>

            {/* ── Stats ── */}
            <section style={{ padding: '0 40px 80px' }}>
                <div style={{ maxWidth: 900, margin: '0 auto', display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', background: 'var(--border)', gap: 1, border: '1px solid var(--border)', borderRadius: 16, overflow: 'hidden' }}>
                    {[
                        { val: 100, suffix: '+', label: 'Steps per test suite' },
                        { val: 4, suffix: '', label: 'AI security checks per endpoint' },
                        { val: 60, suffix: 's', label: 'First test suite, from Swagger URL' },
                        { val: 0, suffix: '', label: 'Infrastructure to manage' },
                    ].map((s, i) => (
                        <div key={i} style={{ background: 'var(--bg-card)', padding: '28px 24px', textAlign: 'center' }}>
                            <div style={{ fontSize: 38, fontWeight: 800, color: 'var(--accent)', letterSpacing: '-0.03em', marginBottom: 6 }}>
                                <Counter to={s.val} suffix={s.suffix} />
                            </div>
                            <div style={{ fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.5 }}>{s.label}</div>
                        </div>
                    ))}
                </div>
            </section>

            {/* ── Demo / How it works ── */}
            <section style={{ padding: '60px 40px 100px' }}>
                <div style={{ maxWidth: 1100, margin: '0 auto', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 60, alignItems: 'center' }}>
                    <div>
                        <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--accent)', letterSpacing: '.1em', textTransform: 'uppercase', marginBottom: 16 }}>Watch it work</div>
                        <h2 style={{ fontSize: 'clamp(28px,4vw,42px)', fontWeight: 700, letterSpacing: '-0.03em', lineHeight: 1.2, marginBottom: 20 }}>
                            From Swagger URL to<br />bug report in 60 seconds.
                        </h2>
                        <p style={{ color: 'var(--text-secondary)', fontSize: 15, lineHeight: 1.8, marginBottom: 32 }}>
                            Paste your API spec URL. HitAPI discovers every endpoint, generates test cases covering happy paths, edge cases, and attack vectors — then runs them and tells you exactly what's broken.
                        </p>
                        {[
                            { icon: Upload, label: 'Import Swagger/OpenAPI', desc: 'JSON or YAML, any version' },
                            { icon: Cpu, label: 'AI writes test cases', desc: 'Positive, negative, boundary, security' },
                            { icon: Play, label: 'Runs against your API', desc: 'Real HTTP requests, parallel execution' },
                            { icon: Bug, label: 'AI explains each failure', desc: 'Root cause + suggested fix, not just a status code' },
                        ].map(({ icon: Icon, label, desc }) => (
                            <div key={label} style={{ display: 'flex', alignItems: 'flex-start', gap: 12, marginBottom: 18 }}>
                                <div style={{ width: 34, height: 34, borderRadius: 9, background: 'var(--accent-dim)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, marginTop: 2 }}>
                                    <Icon size={15} color="var(--accent)" />
                                </div>
                                <div>
                                    <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 2 }}>{label}</div>
                                    <div style={{ fontSize: 13, color: 'var(--text-secondary)' }}>{desc}</div>
                                </div>
                            </div>
                        ))}
                    </div>
                    <TypingDemo />
                </div>
            </section>

            {/* ── Features grid ── */}
            <section style={{ padding: '60px 40px 100px', background: 'rgba(255,255,255,0.015)', borderTop: '1px solid var(--border)', borderBottom: '1px solid var(--border)' }}>
                <div style={{ maxWidth: 1100, margin: '0 auto' }}>
                    <div style={{ textAlign: 'center', marginBottom: 56 }}>
                        <h2 style={{ fontSize: 'clamp(26px,4vw,40px)', fontWeight: 700, letterSpacing: '-0.03em', marginBottom: 12 }}>Everything your API testing needs</h2>
                        <p style={{ color: 'var(--text-secondary)', fontSize: 15, maxWidth: 480, margin: '0 auto' }}>Built on Cloudflare's edge — no servers to run, no infra to manage.</p>
                    </div>

                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 16 }}>
                        {[
                            {
                                icon: Cpu, color: 'var(--accent)', bg: 'rgba(130,100,255,0.08)',
                                title: 'AI test generation',
                                desc: 'Cloudflare Workers AI writes test cases from your Swagger schemas — positive, negative, boundary, and security tests for every endpoint.',
                            },
                            {
                                icon: GitBranch, color: 'var(--blue)', bg: 'rgba(92,168,255,0.08)',
                                title: 'Flow suites',
                                desc: 'Run endpoints in sequence: sign up → log in → test authenticated routes. Tokens extracted automatically and injected into each step.',
                            },
                            {
                                icon: Shield, color: 'var(--green)', bg: 'rgba(35,209,139,0.08)',
                                title: 'Security sub-checks',
                                desc: 'Every endpoint automatically tested for auth bypass, SQL injection, empty body validation, and wrong HTTP method handling.',
                            },
                            {
                                icon: Bug, color: 'var(--red)', bg: 'rgba(255,92,92,0.08)',
                                title: 'AI bug analysis',
                                desc: 'Failed tests get AI-generated bug reports: severity level, root cause, and a concrete suggested fix — not just a raw status code.',
                            },
                            {
                                icon: BarChart3, color: 'var(--amber)', bg: 'rgba(255,181,71,0.08)',
                                title: 'Reports & history',
                                desc: 'Every run generates a report with pass rate, step breakdown, duration, and bug count. Full history retained indefinitely.',
                            },
                            {
                                icon: Globe, color: 'var(--pink)', bg: 'rgba(255,126,179,0.08)',
                                title: 'Chrome extension',
                                desc: 'Capture API requests as you browse, detect auth tokens, and add endpoints to test suites — without leaving the page.',
                            },
                        ].map(({ icon: Icon, color, bg, title, desc }) => (
                            <div key={title} style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 14, padding: '24px 22px', transition: 'border-color .2s' }}
                                onMouseEnter={e => e.currentTarget.style.borderColor = color + '55'}
                                onMouseLeave={e => e.currentTarget.style.borderColor = 'var(--border)'}
                            >
                                <div style={{ width: 40, height: 40, borderRadius: 11, background: bg, display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 16 }}>
                                    <Icon size={18} color={color} />
                                </div>
                                <div style={{ fontSize: 15, fontWeight: 600, marginBottom: 8 }}>{title}</div>
                                <div style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.7 }}>{desc}</div>
                            </div>
                        ))}
                    </div>
                </div>
            </section>

            {/* ── Security checks deep-dive ── */}
            <section style={{ padding: '80px 40px' }}>
                <div style={{ maxWidth: 1100, margin: '0 auto', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 60, alignItems: 'center' }}>
                    {/* Security check cards mock */}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                        {[
                            { icon: '🔒', label: 'Auth check', status: 'passed', desc: 'No token → 401', result: '401 ✓' },
                            { icon: '⚠', label: 'Validation', status: 'passed', desc: 'Empty body → 400', result: '400 ✓' },
                            { icon: '🛡', label: 'SQL injection', status: 'failed', desc: 'Injection → 400 expected', result: '200 ✗' },
                            { icon: '🔁', label: 'Wrong method', status: 'passed', desc: 'GET on POST → 405', result: '405 ✓' },
                        ].map(({ icon, label, status, desc, result }) => (
                            <div key={label} style={{
                                background: 'var(--bg-card)', border: `1px solid ${status === 'passed' ? 'rgba(35,209,139,0.2)' : 'rgba(255,92,92,0.2)'}`,
                                borderRadius: 10, padding: '12px 16px', display: 'flex', alignItems: 'center', gap: 12,
                            }}>
                                <span style={{ fontSize: 18, flexShrink: 0 }}>{icon}</span>
                                <div style={{ flex: 1 }}>
                                    <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 2 }}>{label}</div>
                                    <div style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>{desc}</div>
                                </div>
                                <span style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 12, fontWeight: 700, color: status === 'passed' ? 'var(--green)' : 'var(--red)', flexShrink: 0 }}>{result}</span>
                            </div>
                        ))}
                        <div style={{ padding: '12px 16px', background: 'rgba(255,92,92,0.06)', border: '1px solid rgba(255,92,92,0.2)', borderRadius: 10, marginTop: 4 }}>
                            <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--red)', marginBottom: 4 }}>🐛 HIGH — SQL Injection vulnerability</div>
                            <div style={{ fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.6 }}>
                                Endpoint accepts SQL injection payload without validation.<br />
                                <span style={{ color: 'var(--green)' }}>Fix: Add input sanitization layer before DB query.</span>
                            </div>
                        </div>
                    </div>
                    <div>
                        <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--green)', letterSpacing: '.1em', textTransform: 'uppercase', marginBottom: 16 }}>Security testing built in</div>
                        <h2 style={{ fontSize: 'clamp(26px,4vw,40px)', fontWeight: 700, letterSpacing: '-0.03em', lineHeight: 1.2, marginBottom: 20 }}>
                            4 security checks on every endpoint. Automatically.
                        </h2>
                        <p style={{ color: 'var(--text-secondary)', fontSize: 15, lineHeight: 1.8 }}>
                            After every test suite run, HitAPI automatically probes each endpoint for common vulnerabilities: auth bypass, input validation gaps, SQL injection, and incorrect method handling. When something fails, AI explains exactly what the vulnerability is and how to fix it.
                        </p>
                    </div>
                </div>
            </section>


            {/* ── Pricing ── */}
            <section style={{ padding: '80px 40px 100px' }}>
                <div style={{ maxWidth: 800, margin: '0 auto', textAlign: 'center' }}>
                    <h2 style={{ fontSize: 'clamp(28px,4vw,44px)', fontWeight: 700, letterSpacing: '-0.03em', marginBottom: 12 }}>Free while we're in early access</h2>
                    <p style={{ color: 'var(--text-secondary)', fontSize: 15, marginBottom: 48 }}>We're building in public. HitAPI is free to use right now.</p>

                    <div style={{ background: 'var(--bg-card)', border: '1px solid rgba(130,100,255,0.3)', borderRadius: 20, padding: '44px 48px', position: 'relative', overflow: 'hidden' }}>
                        <div style={{ position: 'absolute', top: -60, right: -60, width: 200, height: 200, background: 'radial-gradient(circle, rgba(130,100,255,0.12) 0%, transparent 70%)', pointerEvents: 'none' }} />
                        <div style={{ fontSize: 48, fontWeight: 800, letterSpacing: '-0.04em', marginBottom: 8 }}>$0 <span style={{ fontSize: 20, fontWeight: 400, color: 'var(--text-tertiary)' }}>/ month</span></div>
                        <div style={{ fontSize: 14, color: 'var(--text-secondary)', marginBottom: 32 }}>Everything included. No credit card required.</div>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, textAlign: 'left', marginBottom: 36 }}>
                            {[
                                'Unlimited projects',
                                'Unlimited test runs',
                                'AI test generation',
                                'AI bug analysis',
                                'Flow suites (100+ steps)',
                                '4 security checks per endpoint',
                                'Full run history',
                                'Chrome extension',
                            ].map(f => (
                                <div key={f} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 14 }}>
                                    <CheckCircle2 size={15} color="var(--green)" style={{ flexShrink: 0 }} />
                                    {f}
                                </div>
                            ))}
                        </div>
                        <button onClick={go} style={{ display: 'inline-flex', alignItems: 'center', gap: 8, background: 'var(--accent)', border: 'none', color: '#fff', fontSize: 15, fontWeight: 600, cursor: 'pointer', padding: '13px 32px', borderRadius: 10 }}>
                            Get started free <ArrowRight size={16} />
                        </button>
                    </div>
                </div>
            </section>

            {/* ── CTA ── */}
            <section style={{ padding: '60px 40px 100px', textAlign: 'center' }}>
                <div style={{ maxWidth: 600, margin: '0 auto' }}>
                    <h2 style={{ fontSize: 'clamp(28px,4vw,48px)', fontWeight: 700, letterSpacing: '-0.03em', marginBottom: 16 }}>
                        Stop writing tests manually.
                    </h2>
                    <p style={{ color: 'var(--text-secondary)', fontSize: 16, lineHeight: 1.7, marginBottom: 36 }}>
                        Import your Swagger spec and get a complete AI-generated test suite in under 60 seconds. For free.
                    </p>
                    <button onClick={go} style={{ display: 'inline-flex', alignItems: 'center', gap: 8, background: 'var(--accent)', border: 'none', color: '#fff', fontSize: 16, fontWeight: 600, cursor: 'pointer', padding: '14px 36px', borderRadius: 10 }}>
                        <Zap size={17} fill="currentColor" /> Start testing now
                    </button>
                    <div style={{ marginTop: 16, display: 'flex', justifyContent: 'center', gap: 24, fontSize: 13, color: 'var(--text-tertiary)' }}>
                        <span>✓ Free forever</span>
                        <span>✓ No setup</span>
                        <span>✓ No credit card</span>
                    </div>
                </div>
            </section>

            <PublicFooter />
        </div>
    );
}