import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Shield, Lock, Eye, Database, Globe, Mail, MapPin } from 'lucide-react';

const LAST_UPDATED = 'June 24, 2026';
const COMPANY = 'Scriptimiz Insight LLP';
const EMAIL = 'scriptimizinsights@gmail.com';
const ADDRESS = 'Gokul Nagar, Akurli Road, Kandivali East, Mumbai – 400101, Maharashtra, India';
const PRODUCT = 'APIForge';

function Section({ icon: Icon, color, title, children }) {
    return (
        <div className="card" style={{ padding: '24px 28px', marginBottom: 16 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
                <div style={{
                    width: 36, height: 36, borderRadius: 10, flexShrink: 0,
                    background: `${color}18`,
                    display: 'flex', alignItems: 'center', justifyContent: 'center'
                }}>
                    <Icon size={17} color={color} />
                </div>
                <h2 style={{ fontSize: 15, fontWeight: 600 }}>{title}</h2>
            </div>
            <div style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.8 }}>
                {children}
            </div>
        </div>
    );
}

function Li({ children }) {
    return (
        <div style={{ display: 'flex', gap: 8, marginBottom: 6 }}>
            <span style={{ color: 'var(--accent)', flexShrink: 0, marginTop: 2 }}>•</span>
            <span>{children}</span>
        </div>
    );
}

export function PrivacyPage() {
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

            <div style={{ maxWidth: 760, margin: '0 auto', padding: isPublic ? '48px 24px' : '28px 32px' }}>

                {/* Header */}
                <div style={{ marginBottom: 36 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
                        <Shield size={26} color="var(--accent)" />
                        <h1 style={{ fontSize: 30, fontWeight: 700, letterSpacing: '-0.02em' }}>Privacy Policy</h1>
                    </div>
                    <p style={{ color: 'var(--text-secondary)', fontSize: 14 }}>
                        <strong style={{ color: 'var(--text-primary)' }}>{PRODUCT}</strong> by {COMPANY} &nbsp;·&nbsp; Last updated: {LAST_UPDATED}
                    </p>
                    <div style={{ marginTop: 14, padding: '12px 16px', background: 'rgba(35,209,139,0.08)', border: '1px solid rgba(35,209,139,0.2)', borderRadius: 8, fontSize: 13, color: 'var(--green)' }}>
                        <strong>Short version:</strong> APIForge does not collect, sell, or share your personal data. Your API credentials stay on your device and are only sent to your own Cloudflare Worker.
                    </div>
                </div>

                <Section icon={Eye} color="var(--accent)" title="1. What we collect">
                    <p style={{ marginBottom: 10 }}>APIForge collects the minimum data necessary to provide the service:</p>
                    <Li><strong>Configuration data</strong> — Swagger URLs, base URLs, and your APIForge Worker URL are stored locally in your browser using <code style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 11, color: 'var(--accent)' }}>chrome.storage.local</code>. This data never leaves your browser except to communicate with your own configured Worker.</Li>
                    <Li><strong>API credentials</strong> — Bearer tokens, API keys, and login credentials you enter are stored locally only and transmitted exclusively to your own Cloudflare Worker. We do not receive, store, or log these values.</Li>
                    <Li><strong>Usage data</strong> — We do not collect analytics, crash reports, or telemetry of any kind.</Li>
                    <Li><strong>No personal information</strong> — We do not collect names, email addresses, IP addresses, or any personally identifiable information through the extension.</Li>
                </Section>

                <Section icon={Globe} color="var(--blue)" title="2. How your data flows">
                    <p style={{ marginBottom: 10 }}>When you use APIForge, data flows as follows:</p>
                    <Li><strong>Extension → Your Cloudflare Worker</strong> — Test configurations and API credentials are sent to the Worker URL you provide. This is your own infrastructure — we have no access to it.</Li>
                    <Li><strong>Your Worker → Your API</strong> — The Worker makes HTTP requests to your API endpoints. Your API responses are returned to the extension. No data passes through Scriptimiz servers.</Li>
                    <Li><strong>Your Worker → Cloudflare Workers AI</strong> — Endpoint schemas (not credentials) are sent to Cloudflare's AI service to generate test cases. This is governed by Cloudflare's privacy policy.</Li>
                    <Li><strong>Browser tab scanning</strong> — The extension reads the current tab URL to detect Swagger documentation. This happens locally and is not transmitted anywhere.</Li>
                </Section>

                <Section icon={Database} color="var(--amber)" title="3. Data storage">
                    <Li>All extension configuration is stored in <code style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 11, color: 'var(--accent)' }}>chrome.storage.local</code> — local to your device only.</Li>
                    <Li>Test results and execution history are stored in your own Cloudflare D1 database, which you control.</Li>
                    <Li>Generated reports are stored in your own Cloudflare R2 bucket, which you control.</Li>
                    <Li>We do not operate any servers that store your data. The Cloudflare Worker runs in your own Cloudflare account.</Li>
                </Section>

                <Section icon={Lock} color="var(--green)" title="4. Third-party services">
                    <p style={{ marginBottom: 10 }}>APIForge relies on the following third-party services, each with their own privacy policies:</p>
                    <Li><strong>Cloudflare Workers AI</strong> — Used for AI test generation. Data processed: API endpoint schemas only. <a href="https://www.cloudflare.com/privacypolicy/" target="_blank" rel="noopener noreferrer" style={{ color: 'var(--accent)' }}>Cloudflare Privacy Policy</a></Li>
                    <Li><strong>Cloudflare Pages</strong> — Hosts the APIForge web interface. <a href="https://www.cloudflare.com/privacypolicy/" target="_blank" rel="noopener noreferrer" style={{ color: 'var(--accent)' }}>Cloudflare Privacy Policy</a></Li>
                    <Li><strong>Google Chrome</strong> — The extension runs in Chrome and uses standard Chrome APIs. <a href="https://policies.google.com/privacy" target="_blank" rel="noopener noreferrer" style={{ color: 'var(--accent)' }}>Google Privacy Policy</a></Li>
                </Section>

                <Section icon={Shield} color="var(--pink)" title="5. Permissions we request">
                    <p style={{ marginBottom: 10 }}>The Chrome extension requests the following permissions and here is why:</p>
                    <Li><strong>activeTab</strong> — To read the current tab URL and detect Swagger documentation. Only activated when you click the extension icon.</Li>
                    <Li><strong>storage</strong> — To save your configuration (Worker URL, Swagger URL) locally so you don't have to re-enter it every time.</Li>
                    <Li><strong>scripting</strong> — To run a small content script that detects Swagger UI on pages you visit.</Li>
                    <Li><strong>host_permissions (&lt;all_urls&gt;)</strong> — Required to detect Swagger docs across any domain you develop on (e.g. localhost, staging, production). We only scan for Swagger-specific patterns.</Li>
                </Section>

                <Section icon={Eye} color="var(--text-secondary)" title="6. Children's privacy">
                    APIForge is a developer tool intended for professional use. It is not directed at children under 13 years of age and we do not knowingly collect information from children.
                </Section>

                <Section icon={Globe} color="var(--accent)" title="7. Changes to this policy">
                    We may update this Privacy Policy from time to time. We will update the "Last updated" date at the top of this page. Continued use of {PRODUCT} after changes constitutes acceptance of the updated policy.
                </Section>

                {/* Contact */}
                <div className="card" style={{ padding: '24px 28px', borderColor: 'rgba(130,100,255,0.25)', background: 'rgba(130,100,255,0.04)' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
                        <Mail size={17} color="var(--accent)" />
                        <h2 style={{ fontSize: 15, fontWeight: 600 }}>8. Contact us</h2>
                    </div>
                    <p style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 14, lineHeight: 1.7 }}>
                        If you have any questions about this Privacy Policy or how we handle data, please contact us:
                    </p>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13 }}>
                            <Mail size={14} color="var(--accent)" />
                            <a href={`mailto:${EMAIL}`} style={{ color: 'var(--accent)' }}>{EMAIL}</a>
                        </div>
                        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8, fontSize: 13 }}>
                            <MapPin size={14} color="var(--text-tertiary)" style={{ marginTop: 2, flexShrink: 0 }} />
                            <span style={{ color: 'var(--text-secondary)' }}>{COMPANY}<br />{ADDRESS}</span>
                        </div>
                    </div>
                </div>

                <div style={{ textAlign: 'center', marginTop: 32, fontSize: 11, color: 'var(--text-tertiary)' }}>
                    © 2026 {COMPANY} · <a href="/support" style={{ color: 'var(--accent)' }}>Support</a> · <a href="/privacy" style={{ color: 'var(--accent)' }}>Privacy</a>
                </div>
            </div>
        </div>
    );
}