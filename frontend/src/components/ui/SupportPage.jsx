import { useNavigate, useLocation } from 'react-router-dom';
import { PublicFooter } from './PublicFooter.jsx';
import { ArrowLeft, Mail, MapPin, MessageCircle, Book, Zap, ChevronDown, ChevronUp, ExternalLink, Globe } from 'lucide-react';
import { useState } from 'react';
import { LogoMark } from './Logo.jsx';

const COMPANY = 'Scriptimiz Insight LLP';
const EMAIL = 'support@hitapi.dev';
const ADDRESS = 'Gokul Nagar, Akurli Road, Kandivali East, Mumbai – 400101, Maharashtra, India';

const FAQS = [
    {
        q: 'How do I install the HitAPI browser extension?',
        a: 'Download the extension ZIP from our GitHub releases page. Unzip it, open chrome://extensions in Chrome, enable Developer Mode (top-right toggle), click "Load unpacked", and select the unzipped folder. The ⚡ icon will appear in your toolbar.'
    },
    {
        q: 'The extension says "Failed to fetch" — what do I do?',
        a: 'This means the extension cannot reach your HitAPI Worker. Check that: (1) your Worker URL is correct in the Setup tab, (2) your Worker is deployed and running (visit the Worker URL directly to confirm), and (3) CORS is set to "*" in your Worker\'s wrangler.toml.'
    },
    {
        q: 'Why does "Generate tests" say "AI timeout"?',
        a: 'The AI model is taking too long on Cloudflare\'s free tier. HitAPI automatically falls back to rule-based test generation in this case — you\'ll still get test cases. To get AI-generated cases, try generating for fewer endpoints at once using the "by tag" or "by method" filter.'
    },
    {
        q: 'How does the login flow work?',
        a: 'Set Auth type to "Login flow (auto token)" in Project Settings. Enter your login URL, the JSON body with credentials, and the dot-path to the token in the response (e.g. "data.token"). Before each test run, HitAPI POSTs to your login endpoint, extracts the token, and injects it as Authorization: Bearer <token> into every test request.'
    },
    {
        q: 'Can I test a local API running on localhost?',
        a: 'Yes. In the extension Setup tab, set Base URL to http://localhost:8080 (or your port). Your Cloudflare Worker will fetch the Swagger spec and run tests against your local URL. Note: your local API must be accessible from Cloudflare\'s network — use a tool like ngrok if your API is behind a firewall.'
    },
    {
        q: 'What Swagger / OpenAPI formats are supported?',
        a: 'HitAPI supports OpenAPI 3.0, OpenAPI 3.1, and Swagger 2.0 in JSON format. YAML support requires the js-yaml npm package to be added to the Worker.'
    },
    {
        q: 'Where is my data stored?',
        a: 'All data is stored in your own Cloudflare account — endpoints and test cases in D1 (SQLite), reports in R2 (object storage), and cached specs in KV. Scriptimiz does not have access to any of your data.'
    },
    {
        q: 'How do I update the extension?',
        a: 'Download the latest ZIP from GitHub releases, unzip it replacing the old folder, then go to chrome://extensions and click the refresh icon on the HitAPI card. Your saved configuration is preserved in chrome.storage.local.'
    },
];

function FAQ({ item }) {
    const [open, setOpen] = useState(false);
    return (
        <div style={{
            borderBottom: '1px solid var(--border)',
            overflow: 'hidden'
        }}>
            <button
                onClick={() => setOpen(o => !o)}
                style={{
                    width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                    padding: '16px 20px', background: 'transparent', cursor: 'pointer',
                    textAlign: 'left', gap: 12
                }}
            >
                <span style={{ fontSize: 'var(--fs-md)', fontWeight: 500, color: 'var(--text-primary)', flex: 1 }}>{item.q}</span>
                {open ? <ChevronUp size={16} color="var(--accent)" /> : <ChevronDown size={16} color="var(--text-tertiary)" />}
            </button>
            {open && (
                <div style={{ padding: '0 20px 18px', fontSize: 'var(--fs-md)', color: 'var(--text-secondary)', lineHeight: 1.8 }}>
                    {item.a}
                </div>
            )}
        </div>
    );
}

export function SupportPage() {
    const navigate = useNavigate();
    const isPublic = !useLocation().pathname.includes('/projects/');

    return (
        <div style={{ minHeight: '100vh', background: 'var(--bg-app)' }}>
            {/* Nav */}
            {isPublic && (
                <nav style={{
                    position: 'sticky', top: 0, zIndex: 50,
                    background: 'rgba(10,10,15,0.9)', backdropFilter: 'blur(12px)',
                    borderBottom: '1px solid var(--border)',
                    padding: '14px 40px', display: 'flex', alignItems: 'center', justifyContent: 'space-between'
                }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <LogoMark size={26} />
                        <span style={{ fontSize: 'var(--fs-md)', fontWeight: 600 }}>HitAPI</span>
                    </div>
                    <button onClick={() => navigate(-1)} className="btn btn-ghost btn-sm" style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                        <ArrowLeft size={13} /> Back
                    </button>
                </nav>
            )}

            <div style={{ maxWidth: 800, margin: '0 auto', padding: isPublic ? '48px 24px' : '28px 32px' }}>

                {/* Header */}
                <div style={{ textAlign: 'center', marginBottom: 48 }}>
                    <LogoMark size={40} />
                    <h1 style={{ fontSize: 32, fontWeight: 700, letterSpacing: '-0.02em', marginBottom: 10 }}>
                        HitAPI Support
                    </h1>
                    <p style={{ fontSize: 'var(--fs-lg)', color: 'var(--text-secondary)', maxWidth: 480, margin: '0 auto', lineHeight: 1.7 }}>
                        Get help with HitAPI — AI-powered API testing built on Cloudflare. We're here to help you ship faster.
                    </p>
                </div>

                {/* Quick help cards */}
                <div className="grid-3" style={{ marginBottom: 40 }}>
                    {[
                        {
                            icon: Book,
                            color: 'var(--accent)',
                            bg: 'var(--accent-dim)',
                            title: 'Documentation',
                            desc: 'Step-by-step guides for setup, auth, and test generation.',
                            action: 'View how it works',
                            href: '/how-it-works'
                        },
                        {
                            icon: Mail,
                            color: 'var(--blue)',
                            bg: 'var(--blue-bg)',
                            title: 'Email support',
                            desc: 'Contact us directly for billing, account, or private issues.',
                            action: EMAIL,
                            href: `mailto:${EMAIL}`
                        },
                    ].map(({ icon: Icon, color, bg, title, desc, action, href }) => (
                        <a
                            key={title}
                            href={href}
                            style={{ textDecoration: 'none' }}
                            target={href.startsWith('http') ? '_blank' : undefined}
                            rel={href.startsWith('http') ? 'noopener noreferrer' : undefined}
                        >
                            <div className="card card-hover" style={{ padding: '20px', height: '100%' }}>
                                <div style={{ width: 40, height: 40, borderRadius: 10, background: bg, display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 12 }}>
                                    <Icon size={18} color={color} />
                                </div>
                                <div style={{ fontSize: 'var(--fs-md)', fontWeight: 600, marginBottom: 6 }}>{title}</div>
                                <div style={{ fontSize: 'var(--fs-base)', color: 'var(--text-secondary)', lineHeight: 1.6, marginBottom: 12 }}>{desc}</div>
                                <div style={{ fontSize: 'var(--fs-base)', color, display: 'flex', alignItems: 'center', gap: 4, marginTop: 'auto' }}>
                                    {action.length > 30 ? action.slice(0, 30) + '…' : action} <ExternalLink size={11} />
                                </div>
                            </div>
                        </a>
                    ))}
                </div>

                {/* FAQ */}
                <div style={{ marginBottom: 40 }}>
                    <h2 style={{ fontSize: 20, fontWeight: 600, marginBottom: 16, display: 'flex', alignItems: 'center', gap: 8 }}>
                        <MessageCircle size={18} color="var(--accent)" /> Frequently asked questions
                    </h2>
                    <div className="card" style={{ overflow: 'hidden', padding: 0 }}>
                        {FAQS.map((item, i) => <FAQ key={i} item={item} />)}
                    </div>
                </div>

                {/* Quick start */}
                <div style={{ marginBottom: 40 }}>
                    <h2 style={{ fontSize: 20, fontWeight: 600, marginBottom: 16, display: 'flex', alignItems: 'center', gap: 8 }}>
                        <Zap size={18} color="var(--accent)" /> Quick start
                    </h2>
                    <div className="card" style={{ padding: '20px 24px' }}>
                        {[
                            { step: '1', title: 'Deploy your Worker', desc: 'Run npm run deploy --workspace=worker after setting up D1, KV, R2, and Queue in wrangler.toml.' },
                            { step: '2', title: 'Create a project', desc: 'Enter your API\'s base URL and Swagger spec URL. Choose your auth type.' },
                            { step: '3', title: 'Import Swagger', desc: 'Click "Import Swagger" — all endpoints are discovered and stored automatically.' },
                            { step: '4', title: 'Generate AI tests', desc: 'Click "Generate tests" — choose scope (all, by tag, by method) and limit.' },
                            { step: '5', title: 'Run &amp; see results', desc: 'Click "Run Tests" — pass/fail results appear instantly with HTTP status and response time.' },
                        ].map(({ step, title, desc }) => (
                            <div key={step} style={{ display: 'flex', gap: 14, padding: '12px 0', borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                                <div style={{
                                    width: 28, height: 28, borderRadius: '50%', flexShrink: 0,
                                    background: 'var(--accent-dim)', border: '1px solid rgba(130,100,255,0.3)',
                                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                                    fontSize: 'var(--fs-base)', fontWeight: 700, color: 'var(--accent)'
                                }}>{step}</div>
                                <div>
                                    <div style={{ fontSize: 'var(--fs-md)', fontWeight: 500, marginBottom: 3 }}>{title}</div>
                                    <div style={{ fontSize: 'var(--fs-base)', color: 'var(--text-secondary)', lineHeight: 1.6 }}>{desc}</div>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>


                {/* ── Sponsored by Scriptimiz ── */}
                <div style={{ marginBottom: 40 }}>
                    <div style={{
                        background: 'var(--bg-card)',
                        border: '1px solid rgba(255,92,92,0.2)',
                        borderRadius: 14, overflow: 'hidden'
                    }}>
                        {/* Header */}
                        <div style={{
                            padding: '18px 24px 14px',
                            background: 'rgba(255,92,92,0.05)',
                            borderBottom: '1px solid rgba(255,92,92,0.1)',
                            display: 'flex', alignItems: 'center', justifyContent: 'space-between'
                        }}>
                            <div>
                                <div style={{ fontSize: 'var(--fs-xs)', color: '#ff5c5c', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 4 }}>
                                    Sponsored by
                                </div>
                                <div style={{ fontSize: 18, fontWeight: 600 }}>Scriptimiz Insight LLP</div>
                                <div style={{ fontSize: 'var(--fs-md)', color: 'var(--text-secondary)', marginTop: 2 }}>
                                    Custom Software Solutions &amp; Web Development · Mumbai, India
                                </div>
                            </div>
                            <a href="https://scriptimiz.com" target="_blank" rel="noopener noreferrer"
                                className="btn btn-ghost btn-sm" style={{ display: 'flex', alignItems: 'center', gap: 5, flexShrink: 0 }}>
                                Visit site <ExternalLink size={12} />
                            </a>
                        </div>

                        {/* Services grid */}
                        <div style={{ padding: '20px 24px' }}>
                            <div style={{ fontSize: 'var(--fs-base)', color: 'var(--text-tertiary)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 14 }}>
                                Our services
                            </div>
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 20 }}>
                                {[
                                    { title: 'Web Development', desc: 'Custom web apps with React, Spring Boot &amp; Microservices' },
                                    { title: 'Software Training', desc: 'Java, Spring Boot, Microservices — for individuals &amp; teams' },
                                    { title: 'Application Support', desc: 'Ongoing maintenance and support for enterprise apps' },
                                    { title: 'IT Consulting', desc: 'Architecture, code reviews, and technology strategy' },
                                    { title: 'B2B Software Products', desc: 'End-to-end product development for businesses' },
                                    { title: 'E-Commerce Solutions', desc: 'Online stores, payment integration &amp; fulfilment systems' },
                                ].map(({ title, desc }) => (
                                    <div key={title} style={{ padding: '12px 14px', background: 'var(--bg-input)', borderRadius: 8, border: '1px solid var(--border)' }}>
                                        <div style={{ fontSize: 'var(--fs-md)', fontWeight: 500, marginBottom: 4 }}>{title}</div>
                                        <div style={{ fontSize: 'var(--fs-base)', color: 'var(--text-secondary)', lineHeight: 1.5 }}>{desc}</div>
                                    </div>
                                ))}
                            </div>

                            {/* Tech stack */}
                            <div style={{ fontSize: 'var(--fs-base)', color: 'var(--text-tertiary)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 10 }}>
                                Expert in
                            </div>
                            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 20 }}>
                                {['Java', 'Spring Boot', 'Microservices', 'React', 'Node.js', 'MySQL', 'PostgreSQL', 'AWS', 'Docker', 'REST APIs'].map(tech => (
                                    <span key={tech} style={{
                                        fontSize: 'var(--fs-sm)', padding: '3px 10px', borderRadius: 20,
                                        background: 'rgba(255,92,92,0.08)', color: '#ff5c5c',
                                        border: '1px solid rgba(255,92,92,0.2)', fontWeight: 500
                                    }}>{tech}</span>
                                ))}
                            </div>

                            {/* Contact row */}
                            <div style={{ display: 'flex', gap: 20, padding: '14px 16px', background: 'rgba(255,255,255,0.02)', borderRadius: 8, flexWrap: 'wrap' }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 'var(--fs-md)' }}>
                                    <Mail size={13} color="var(--text-tertiary)" />
                                    <a href="mailto:scriptimizinsights@gmail.com" style={{ color: '#ff5c5c' }}>scriptimizinsights@gmail.com</a>
                                </div>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 'var(--fs-md)', color: 'var(--text-secondary)' }}>
                                    <MapPin size={13} color="var(--text-tertiary)" />
                                    Gokul Nagar, Akurli Road, Kandivali East, Mumbai — 400101
                                </div>
                                <a href="https://scriptimiz.com" target="_blank" rel="noopener noreferrer"
                                    style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 'var(--fs-md)', color: '#ff5c5c' }}>
                                    <Globe size={13} /> scriptimiz.com
                                </a>
                            </div>
                        </div>
                    </div>
                </div>
                {/* Contact */}
                <div className="card" style={{ padding: '28px', borderColor: 'rgba(255,92,92,0.2)', background: 'rgba(255,92,92,0.04)', marginBottom: 32 }}>
                    <h2 style={{ fontSize: 18, fontWeight: 600, marginBottom: 18 }}>Contact us</h2>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>
                        <div>
                            <div style={{ fontSize: 'var(--fs-sm)', color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.06em', fontWeight: 600, marginBottom: 8 }}>Email</div>
                            <a href={`mailto:${EMAIL}`} style={{ color: 'var(--accent)', fontSize: 'var(--fs-md)', display: 'flex', alignItems: 'center', gap: 6 }}>
                                <Mail size={13} /> {EMAIL}
                            </a>
                            <div style={{ fontSize: 'var(--fs-base)', color: 'var(--text-tertiary)', marginTop: 4 }}>We respond within 24–48 hours</div>
                        </div>
                        <div>
                            <div style={{ fontSize: 'var(--fs-sm)', color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.06em', fontWeight: 600, marginBottom: 8 }}>Office</div>
                            <div style={{ fontSize: 'var(--fs-md)', color: 'var(--text-secondary)', display: 'flex', alignItems: 'flex-start', gap: 6 }}>
                                <MapPin size={13} style={{ marginTop: 2, flexShrink: 0 }} color="var(--text-tertiary)" />
                                <span>{COMPANY}<br />{ADDRESS}</span>
                            </div>
                        </div>
                    </div>
                </div>

            </div>
            <PublicFooter />
        </div>
    );
}