import { useNavigate } from 'react-router-dom';
import { ArrowRight, Send } from 'lucide-react';
import { LogoMark } from './Logo.jsx';
import { DemoVideo } from './DemoVideo.jsx';
import { PublicFooter } from './PublicFooter.jsx';

/**
 * /demo — the "watch page" for the HitAPI product demo.
 * Google only shows a video in video results when it is the main content of
 * its page, so this page leads with the video. Its VideoObject structured data
 * lives in seo/pages.js (path '/demo').
 */

const SHOWS = [
    ['Import a Swagger / OpenAPI spec', 'Paste the spec URL; every endpoint is listed with its method, parameters and schema.'],
    ['AI writes the test cases', 'Positive, negative, boundary and security tests for each endpoint, generated from the spec.'],
    ['Run against a live API', 'Real HTTP calls with pass/fail per test, expected vs actual status and timing.'],
    ['Bugs explained', 'Each failure becomes a bug with severity, root cause and a suggested fix.'],
    ['Multi-step flows', 'Sign up, log in and call authenticated endpoints in order, with the token passed along.'],
    ['Free API Playground', 'Send any request or paste a cURL command, no sign-up needed.'],
];

export function DemoPage() {
    const navigate = useNavigate();

    return (
        <div style={{ minHeight: '100vh', background: 'var(--bg-app)' }}>
            <style>{`
                .demo-nav { padding: 14px 40px; }
                @media (max-width: 640px) {
                    .demo-nav { padding: 12px 16px; }
                    .demo-nav-link { display: none; }
                }
            `}</style>
            <nav className="demo-nav" style={{
                position: 'sticky', top: 0, zIndex: 50,
                background: 'rgba(10,10,15,0.9)', backdropFilter: 'blur(12px)',
                borderBottom: '1px solid var(--border)',
                display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16,
            }}>
                <a href="/" style={{ display: 'flex', alignItems: 'center', gap: 8, color: 'var(--text-primary)' }}>
                    <LogoMark size={26} />
                    <span style={{ fontSize: 'var(--fs-md)', fontWeight: 600 }}>HitAPI</span>
                </a>
                <div style={{ display: 'flex', alignItems: 'center', gap: 18 }}>
                    <a href="/how-it-works" className="demo-nav-link" style={{ fontSize: 'var(--fs-base)', color: 'var(--text-secondary)' }}>How it works</a>
                    <a href="/playground" className="demo-nav-link" style={{ fontSize: 'var(--fs-base)', color: 'var(--text-secondary)' }}>API Playground</a>
                    <button className="btn btn-primary btn-sm" onClick={() => navigate('/login')}>Get started free</button>
                </div>
            </nav>

            <main style={{ maxWidth: 1040, margin: '0 auto', padding: '40px 16px 72px' }}>
                <h1 style={{ fontSize: 'clamp(26px,3.6vw,38px)', fontWeight: 700, letterSpacing: '-0.03em', margin: '0 0 10px', textAlign: 'center' }}>
                    HitAPI product demo: AI API testing in about a minute
                </h1>
                <p style={{ fontSize: 'var(--fs-lg)', color: 'var(--text-secondary)', lineHeight: 1.7, margin: '0 auto 28px', maxWidth: 680, textAlign: 'center' }}>
                    Watch HitAPI go from a Swagger spec to AI-written tests, a live run and explained bugs. Runs 1:11.
                </p>

                <DemoVideo maxWidth={1000} />

                <h2 style={{ fontSize: 22, fontWeight: 700, letterSpacing: '-0.02em', margin: '48px 0 16px' }}>What the video shows</h2>
                <ol style={{ margin: 0, paddingLeft: 22, display: 'grid', gap: 12 }}>
                    {SHOWS.map(([title, text]) => (
                        <li key={title} style={{ fontSize: 'var(--fs-md)', color: 'var(--text-secondary)', lineHeight: 1.6 }}>
                            <strong style={{ color: 'var(--text-primary)', fontWeight: 600 }}>{title}.</strong> {text}
                        </li>
                    ))}
                </ol>

                <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginTop: 36 }}>
                    <button className="btn btn-primary" onClick={() => navigate('/login')} style={{ padding: '11px 22px' }}>
                        Start testing for free <ArrowRight size={15} />
                    </button>
                    <a href="/playground" className="btn btn-ghost" style={{ padding: '11px 22px' }}>
                        <Send size={14} /> Try the API Playground
                    </a>
                </div>
            </main>

            <PublicFooter />
        </div>
    );
}
