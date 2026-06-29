import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Shield, Lock, Eye, Database, Globe, Mail, MapPin } from 'lucide-react';

const LAST_UPDATED = 'June 30, 2026';
const COMPANY = 'Scriptimiz Insight LLP';
const EMAIL = 'support@hitapi.dev';
const ADDRESS = 'Gokul Nagar, Akurli Road, Kandivali East, Mumbai – 400101, Maharashtra, India';
const PRODUCT = 'HitAPI';

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
            {isPublic && (
                <nav style={{
                    position: 'sticky', top: 0, zIndex: 50,
                    background: 'rgba(10,10,15,0.9)', backdropFilter: 'blur(12px)',
                    borderBottom: '1px solid var(--border)',
                    padding: '14px 40px', display: 'flex', alignItems: 'center', justifyContent: 'space-between'
                }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <div style={{ width: 26, height: 26, borderRadius: 7, background: 'linear-gradient(135deg,#8264ff,#5ca8ff)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13 }}>⚡</div>
                        <span style={{ fontSize: 14, fontWeight: 600 }}>HitAPI</span>
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
                        <strong>In plain English:</strong> HitAPI does not sell your data, does not share it with third parties for advertising, and only uses what is necessary to provide the service.
                    </div>
                </div>

                <Section icon={Eye} color="var(--accent)" title="1. What we collect">
                    <p style={{ marginBottom: 10 }}>HitAPI collects only the minimum information required to operate the service:</p>
                    <Li><strong>Account information</strong> — When you register, we collect your name and email address to identify your account.</Li>
                    <Li><strong>Project configuration</strong> — API spec URLs and base URLs you provide are stored securely and associated with your account.</Li>
                    <Li><strong>Test results</strong> — Execution results, response data, and detected issues are stored to display reports and bug history within your account.</Li>
                    <Li><strong>Usage information</strong> — Standard server logs (timestamps, response codes) used for security monitoring and debugging. These are not shared or sold.</Li>
                </Section>

                <Section icon={Globe} color="var(--blue)" title="2. What we do not collect">
                    <Li>We do not collect your API credentials, bearer tokens, or passwords for the APIs you test. These are transmitted directly to your target API and not stored on our servers.</Li>
                    <Li>We do not use tracking pixels, advertising cookies, or third-party analytics.</Li>
                    <Li>We do not build advertising profiles or sell your data to any third party.</Li>
                    <Li>We do not access the APIs you test beyond what is needed to execute the test cases you configure.</Li>
                </Section>

                <Section icon={Database} color="var(--amber)" title="3. How we store your data">
                    <p style={{ marginBottom: 10 }}>Your data is stored securely on our infrastructure with the following practices:</p>
                    <Li>Data is encrypted in transit using TLS.</Li>
                    <Li>Access to stored data is restricted to your account only — other users cannot view your projects, results, or configurations.</Li>
                    <Li>We retain your data for as long as your account is active. You may request deletion at any time by contacting us.</Li>
                    <Li>Passwords are never stored in plain text. We use industry-standard one-way hashing.</Li>
                </Section>

                <Section icon={Lock} color="var(--green)" title="4. How we use your data">
                    <p style={{ marginBottom: 10 }}>We use the information we collect solely to:</p>
                    <Li>Provide and operate the HitAPI service.</Li>
                    <Li>Display your test results, reports, and detected issues within your account.</Li>
                    <Li>Send transactional emails (e.g. account verification, password reset) if applicable.</Li>
                    <Li>Investigate security incidents or abuse involving our platform.</Li>
                    <Li>Improve the service based on aggregated, anonymised usage patterns.</Li>
                </Section>

                <Section icon={Shield} color="var(--pink)" title="5. Sharing of data">
                    <p style={{ marginBottom: 10 }}>We do not sell, rent, or trade your personal information. We may share data only in these limited circumstances:</p>
                    <Li><strong>Legal compliance</strong> — If required by applicable law, court order, or governmental authority.</Li>
                    <Li><strong>Security</strong> — To investigate fraud, abuse, or violations of our terms of service.</Li>
                    <Li><strong>Business transfer</strong> — In the event of a merger or acquisition, data may transfer to the new entity under the same privacy commitments.</Li>
                </Section>

                <Section icon={Eye} color="var(--text-secondary)" title="6. Your rights">
                    <p style={{ marginBottom: 10 }}>You have the right to:</p>
                    <Li>Access the personal data we hold about you.</Li>
                    <Li>Request correction of inaccurate data.</Li>
                    <Li>Request deletion of your account and associated data.</Li>
                    <Li>Withdraw consent at any time by discontinuing use and requesting account deletion.</Li>
                    <p style={{ marginTop: 10 }}>To exercise any of these rights, contact us at the address below.</p>
                </Section>

                <Section icon={Globe} color="var(--accent)" title="7. Changes to this policy">
                    We may update this Privacy Policy periodically. The "Last updated" date at the top of this page will reflect any changes. Continued use of {PRODUCT} after changes are posted constitutes acceptance of the updated policy. For significant changes, we will make reasonable efforts to notify registered users.
                </Section>

                {/* Contact */}
                <div className="card" style={{ padding: '24px 28px', borderColor: 'rgba(130,100,255,0.25)', background: 'rgba(130,100,255,0.04)' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
                        <Mail size={17} color="var(--accent)" />
                        <h2 style={{ fontSize: 15, fontWeight: 600 }}>8. Contact us</h2>
                    </div>
                    <p style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 14, lineHeight: 1.7 }}>
                        For any questions, concerns, or requests regarding this Privacy Policy or your personal data:
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