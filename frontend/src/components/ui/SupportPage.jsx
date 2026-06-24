import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Mail, MapPin, MessageCircle, Book, Zap, ChevronDown, ChevronUp, ExternalLink, Github } from 'lucide-react';
import { useState } from 'react';

const COMPANY = 'Scriptimiz Insight LLP';
const EMAIL = 'scriptimizinsights@gmail.com';
const ADDRESS = 'Gokul Nagar, Akurli Road, Kandivali East, Mumbai – 400101, Maharashtra, India';

const FAQS = [
    {
        q: 'How do I install the APIForge browser extension?',
        a: 'Download the extension ZIP from our GitHub releases page. Unzip it, open chrome://extensions in Chrome, enable Developer Mode (top-right toggle), click "Load unpacked", and select the unzipped folder. The ⚡ icon will appear in your toolbar.'
    },
    {
        q: 'The extension says "Failed to fetch" — what do I do?',
        a: 'This means the extension cannot reach your APIForge Worker. Check that: (1) your Worker URL is correct in the Setup tab, (2) your Worker is deployed and running (visit the Worker URL directly to confirm), and (3) CORS is set to "*" in your Worker\'s wrangler.toml.'
    },
    {
        q: 'Why does "Generate tests" say "AI timeout"?',
        a: 'The AI model is taking too long on Cloudflare\'s free tier. APIForge automatically falls back to rule-based test generation in this case — you\'ll still get test cases. To get AI-generated cases, try generating for fewer endpoints at once using the "by tag" or "by method" filter.'
    },
    {
        q: 'How does the login flow work?',
        a: 'Set Auth type to "Login flow (auto token)" in Project Settings. Enter your login URL, the JSON body with credentials, and the dot-path to the token in the response (e.g. "data.token"). Before each test run, APIForge POSTs to your login endpoint, extracts the token, and injects it as Authorization: Bearer <token> into every test request.'
    },
    {
        q: 'Can I test a local API running on localhost?',
        a: 'Yes. In the extension Setup tab, set Base URL to http://localhost:8080 (or your port). Your Cloudflare Worker will fetch the Swagger spec and run tests against your local URL. Note: your local API must be accessible from Cloudflare\'s network — use a tool like ngrok if your API is behind a firewall.'
    },
    {
        q: 'What Swagger / OpenAPI formats are supported?',
        a: 'APIForge supports OpenAPI 3.0, OpenAPI 3.1, and Swagger 2.0 in JSON format. YAML support requires the js-yaml npm package to be added to the Worker.'
    },
    {
        q: 'Where is my data stored?',
        a: 'All data is stored in your own Cloudflare account — endpoints and test cases in D1 (SQLite), reports in R2 (object storage), and cached specs in KV. Scriptimiz does not have access to any of your data.'
    },
    {
        q: 'How do I update the extension?',
        a: 'Download the latest ZIP from GitHub releases, unzip it replacing the old folder, then go to chrome://extensions and click the refresh icon on the APIForge card. Your saved configuration is preserved in chrome.storage.local.'
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
                <span style={{ fontSize: 14, fontWeight: 500, color: 'var(--text-primary)', flex: 1 }}>{item.q}</span>
                {open ? <ChevronUp size={16} color="var(--accent)" /> : <ChevronDown size={16} color="var(--text-tertiary)" />}
            </button>
            {open && (
                <div style={{ padding: '0 20px 18px', fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.8 }}>
                    {item.a}
                </div>
            )}
        </div>
    );
}

export function SupportPage() {
    const navigate = useNavigate();
    const isPublic = !window.location.pathname.includes('/projects/');

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
                        <div style={{ width: 26, height: 26, borderRadius: 7, background: 'linear-gradient(135deg,#8264ff,#5ca8ff)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13 }}>⚡</div>
                        <span style={{ fontSize: 14, fontWeight: 600 }}>APIForge</span>
                    </div>
                    <button onClick={() => navigate(-1)} className="btn btn-ghost btn-sm" style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                        <ArrowLeft size={13} /> Back
                    </button>
                </nav>
            )}

            <div style={{ maxWidth: 800, margin: '0 auto', padding: isPublic ? '48px 24px' : '28px 32px' }}>

                {/* Header */}
                <div style={{ textAlign: 'center', marginBottom: 48 }}>
                    <div style={{ fontSize: 40, marginBottom: 16 }}>⚡</div>
                    <h1 style={{ fontSize: 32, fontWeight: 700, letterSpacing: '-0.02em', marginBottom: 10 }}>
                        APIForge Support
                    </h1>
                    <p style={{ fontSize: 15, color: 'var(--text-secondary)', maxWidth: 480, margin: '0 auto', lineHeight: 1.7 }}>
                        Get help with APIForge — AI-powered API testing built on Cloudflare. We're here to help you ship faster.
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
                            icon: Github,
                            color: 'var(--green)',
                            bg: 'var(--green-bg)',
                            title: 'GitHub Issues',
                            desc: 'Report bugs or request features on our public repository.',
                            action: 'Open GitHub',
                            href: 'https://github.com/sunilyadav/apiforge'
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
                                <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 6 }}>{title}</div>
                                <div style={{ fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.6, marginBottom: 12 }}>{desc}</div>
                                <div style={{ fontSize: 12, color, display: 'flex', alignItems: 'center', gap: 4, marginTop: 'auto' }}>
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
                            { step: '5', title: 'Run & see results', desc: 'Click "Run Tests" — pass/fail results appear instantly with HTTP status and response time.' },
                        ].map(({ step, title, desc }) => (
                            <div key={step} style={{ display: 'flex', gap: 14, padding: '12px 0', borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                                <div style={{
                                    width: 28, height: 28, borderRadius: '50%', flexShrink: 0,
                                    background: 'var(--accent-dim)', border: '1px solid rgba(130,100,255,0.3)',
                                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                                    fontSize: 12, fontWeight: 700, color: 'var(--accent)'
                                }}>{step}</div>
                                <div>
                                    <div style={{ fontSize: 13, fontWeight: 500, marginBottom: 3 }}>{title}</div>
                                    <div style={{ fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.6 }}>{desc}</div>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>

                {/* Contact */}
                <div className="card" style={{ padding: '28px', borderColor: 'rgba(130,100,255,0.25)', background: 'rgba(130,100,255,0.04)', marginBottom: 32 }}>
                    <h2 style={{ fontSize: 18, fontWeight: 600, marginBottom: 18 }}>Contact us</h2>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>
                        <div>
                            <div style={{ fontSize: 11, color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.06em', fontWeight: 600, marginBottom: 8 }}>Email</div>
                            <a href={`mailto:${EMAIL}`} style={{ color: 'var(--accent)', fontSize: 13, display: 'flex', alignItems: 'center', gap: 6 }}>
                                <Mail size={13} /> {EMAIL}
                            </a>
                            <div style={{ fontSize: 12, color: 'var(--text-tertiary)', marginTop: 4 }}>We respond within 24–48 hours</div>
                        </div>
                        <div>
                            <div style={{ fontSize: 11, color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.06em', fontWeight: 600, marginBottom: 8 }}>Office</div>
                            <div style={{ fontSize: 13, color: 'var(--text-secondary)', display: 'flex', alignItems: 'flex-start', gap: 6 }}>
                                <MapPin size={13} style={{ marginTop: 2, flexShrink: 0 }} color="var(--text-tertiary)" />
                                <span>{COMPANY}<br />{ADDRESS}</span>
                            </div>
                        </div>
                    </div>
                </div>

                <div style={{ textAlign: 'center', fontSize: 11, color: 'var(--text-tertiary)' }}>
                    © 2026 {COMPANY} · <a href="/privacy" style={{ color: 'var(--accent)' }}>Privacy Policy</a> · <a href="/support" style={{ color: 'var(--accent)' }}>Support</a>
                </div>
            </div>
        </div>
    );
}