import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Shield, Mail, MapPin } from 'lucide-react';

const LAST_UPDATED = 'June 30, 2026';
const COMPANY = 'Scriptimiz Insight LLP';
const EMAIL = 'support@hitapi.dev';
const ADDRESS = 'Gokul Nagar, Akurli Road, Kandivali East, Mumbai – 400101, Maharashtra, India';
const PRODUCT = 'HitAPI';

function Section({ title, children }) {
    return (
        <div style={{ marginBottom: 32 }}>
            <h2 style={{ fontSize: 16, fontWeight: 700, marginBottom: 12, color: 'var(--text-primary)', paddingBottom: 8, borderBottom: '1px solid var(--border)' }}>
                {title}
            </h2>
            <div style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.9 }}>
                {children}
            </div>
        </div>
    );
}

function Li({ children }) {
    return (
        <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
            <span style={{ color: 'var(--accent)', flexShrink: 0, marginTop: 2 }}>•</span>
            <span>{children}</span>
        </div>
    );
}

function Note({ children }) {
    return (
        <div style={{ padding: '10px 14px', background: 'rgba(255,181,71,0.07)', border: '1px solid rgba(255,181,71,0.2)', borderRadius: 7, fontSize: 12, color: 'var(--amber)', marginTop: 10, lineHeight: 1.7 }}>
            {children}
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
                <div style={{ marginBottom: 40 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
                        <Shield size={26} color="var(--accent)" />
                        <h1 style={{ fontSize: 30, fontWeight: 700, letterSpacing: '-0.02em' }}>Privacy Policy</h1>
                    </div>
                    <p style={{ color: 'var(--text-secondary)', fontSize: 13, marginBottom: 16 }}>
                        <strong style={{ color: 'var(--text-primary)' }}>{PRODUCT}</strong> is operated by {COMPANY} &nbsp;·&nbsp; Last updated: {LAST_UPDATED}
                    </p>
                    <p style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.8 }}>
                        This Privacy Policy describes how {COMPANY} ("we", "us", "our") collects, uses, and handles information when you use HitAPI, an AI-powered API testing platform available at hitapi.dev. Please read this policy carefully. By using HitAPI, you agree to the practices described here.
                    </p>
                </div>

                <Section title="1. Information We Collect">
                    <p style={{ marginBottom: 10 }}>We collect the following categories of information:</p>
                    <p style={{ fontWeight: 600, color: 'var(--text-primary)', marginBottom: 6 }}>Account Information</p>
                    <Li>Name and email address provided during registration.</Li>
                    <Li>Hashed password (we never store your password in plain text).</Li>
                    <Li>Account creation timestamp.</Li>

                    <p style={{ fontWeight: 600, color: 'var(--text-primary)', margin: '14px 0 6px' }}>Project Configuration</p>
                    <Li>API base URLs and Swagger/OpenAPI spec URLs you provide.</Li>
                    <Li>Project names, descriptions, and environment labels.</Li>
                    <Li>Authentication configuration you set up (e.g. login endpoint URLs, token extraction paths). See Section 2 for how credentials are handled.</Li>

                    <p style={{ fontWeight: 600, color: 'var(--text-primary)', margin: '14px 0 6px' }}>Server and Access Logs</p>
                    <Li>IP addresses, browser user-agent strings, and timestamps are recorded in standard server access logs for security monitoring purposes. These logs are retained for up to 30 days.</Li>
                </Section>

                <Section title="2. Information Collected During API Testing">
                    <p style={{ marginBottom: 12 }}>Because HitAPI is an API testing platform, the nature of what we process is different from a typical SaaS product. Please read this section carefully.</p>

                    <p style={{ fontWeight: 600, color: 'var(--text-primary)', marginBottom: 6 }}>Authentication Credentials</p>
                    <p style={{ marginBottom: 8 }}>
                        When you configure a flow suite with login steps (e.g. email/password for your API), those credentials are stored in our database as part of your flow step configuration. They are used solely to execute login requests against your configured API endpoints. We do not use them for any other purpose.
                    </p>
                    <Note>
                        If your test configuration includes real production credentials or sensitive secrets, you are responsible for that choice. We recommend using test-specific credentials wherever possible.
                    </Note>

                    <p style={{ fontWeight: 600, color: 'var(--text-primary)', margin: '14px 0 6px' }}>API Requests and Responses</p>
                    <Li>When you run a test suite, HitAPI sends HTTP requests to the API endpoints you configure <strong>on your behalf</strong>. The full request details (URL, method, headers, body) and the API responses (status code, response body) are stored to display your execution history, generate reports, and assist in debugging.</Li>
                    <Li>This means that any data returned by your API — including potentially sensitive data — may be stored in our database as part of test results. Users are responsible for ensuring that test environments do not return real sensitive data such as production PII, financial records, or credentials.</Li>

                    <p style={{ fontWeight: 600, color: 'var(--text-primary)', margin: '14px 0 6px' }}>Generated Test Cases and Flow Suites</p>
                    <Li>Test cases generated by AI, flow suite steps, and step configurations are stored in our database and associated with your account.</Li>

                    <p style={{ fontWeight: 600, color: 'var(--text-primary)', margin: '14px 0 6px' }}>AI Analysis</p>
                    <Li>When AI bug analysis runs on a failed test step, the request/response data for that step (truncated to 200 characters) is sent to a third-party AI inference service to generate a bug report. See Section 7 (Service Providers) for details.</Li>

                    <p style={{ fontWeight: 600, color: 'var(--text-primary)', margin: '14px 0 6px' }}>Bug Reports</p>
                    <Li>AI-generated bug reports including severity, title, description, root cause, and suggested fix are stored in our database and associated with your project.</Li>
                </Section>

                <Section title="3. How We Use Your Information">
                    <Li>To create and manage your account.</Li>
                    <Li>To execute API test suites and flow suites on your behalf.</Li>
                    <Li>To store and display test results, execution history, reports, and detected bugs within your account.</Li>
                    <Li>To generate AI-powered bug analysis for failed test steps.</Li>
                    <Li>To respond to support requests you submit.</Li>
                    <Li>To monitor for security incidents, abuse, or violations of our terms.</Li>
                    <Li>To improve the service using aggregated, anonymised usage patterns — we do not use individual test data for model training without explicit consent.</Li>
                </Section>

                <Section title="4. AI Processing">
                    <p style={{ marginBottom: 10 }}>
                        HitAPI uses AI inference for two purposes:
                    </p>
                    <Li><strong>Test case generation</strong> — Your API endpoint schemas (path, method, parameters, request body structure) are sent to an AI inference service to generate test cases. Raw API responses from your endpoints are not sent at this stage.</Li>
                    <Li><strong>Bug analysis</strong> — For failed test steps, a truncated excerpt of the request and response (up to 200 characters each) plus the HTTP status code and failure reason is sent to an AI inference service to produce a structured bug report.</Li>
                    <Note>
                        Do not configure HitAPI to test endpoints that return highly sensitive data (e.g. full SSNs, payment card numbers, medical records) in their responses, as excerpts may be processed by our AI inference provider.
                    </Note>
                </Section>

                <Section title="5. Data Retention">
                    <Li><strong>Account data</strong> — Retained for the lifetime of your account. If you request account deletion, your account and associated project data will be deleted within 30 days.</Li>
                    <Li><strong>Test results and execution history</strong> — Retained indefinitely while your account is active. You can delete individual runs from within the application.</Li>
                    <Li><strong>Server access logs</strong> — Retained for up to 30 days for security purposes, then deleted.</Li>
                    <Li><strong>Backups</strong> — Our infrastructure provider may retain database backups for a period of up to 30 days for disaster recovery. Data deleted from your account may persist in backups for this period before being permanently removed.</Li>
                </Section>

                <Section title="6. Security">
                    <Li>Passwords are stored using a one-way cryptographic hash with a unique salt per user. We cannot recover your password.</Li>
                    <Li>All data in transit between your browser and our services is encrypted using TLS (HTTPS).</Li>
                    <Li>Access to customer data is controlled through authentication and authorisation. Authorised personnel may access data only when necessary for maintenance, support, or security incident response.</Li>
                    <Li>Where supported by our infrastructure provider, data at rest is protected by the provider's security controls. We rely on the security practices of our infrastructure and service providers as described in Section 7.</Li>
                    <Li>No method of transmission or storage is 100% secure. We take reasonable measures but cannot guarantee absolute security.</Li>
                </Section>

                <Section title="7. Sharing and Service Providers">
                    <p style={{ marginBottom: 10 }}>We do not sell your data. We do not share your data with third parties for advertising purposes. We use the following subprocessors who may process your data as part of providing the HitAPI service:</p>

                    <div style={{ overflowX: 'auto' }}>
                        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12, marginBottom: 12 }}>
                            <thead>
                                <tr style={{ borderBottom: '1px solid var(--border)' }}>
                                    {['Provider', 'Purpose', 'Data processed'].map(h => (
                                        <th key={h} style={{ padding: '8px 12px', textAlign: 'left', color: 'var(--text-tertiary)', fontWeight: 600, letterSpacing: '.04em', textTransform: 'uppercase', fontSize: 11 }}>{h}</th>
                                    ))}
                                </tr>
                            </thead>
                            <tbody>
                                {[
                                    ['Cloudflare, Inc.', 'Infrastructure, edge network, database, storage, queue, AI inference', 'All data processed by HitAPI passes through Cloudflare infrastructure'],
                                    ['GitHub, Inc.', 'Source code hosting and CI/CD deployment pipeline', 'Source code only — no customer data'],
                                ].map(([provider, purpose, data], i) => (
                                    <tr key={i} style={{ borderBottom: '1px solid var(--border)' }}>
                                        <td style={{ padding: '10px 12px', color: 'var(--text-primary)', fontWeight: 500, verticalAlign: 'top' }}>{provider}</td>
                                        <td style={{ padding: '10px 12px', color: 'var(--text-secondary)', verticalAlign: 'top' }}>{purpose}</td>
                                        <td style={{ padding: '10px 12px', color: 'var(--text-secondary)', verticalAlign: 'top' }}>{data}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                    <p>Each provider operates under their own privacy policy and data processing agreements. We are not responsible for the privacy practices of these third parties beyond our contractual arrangements with them.</p>

                    <p style={{ marginTop: 12 }}>We may also disclose your information if required by law, court order, or governmental authority, or to investigate fraud, abuse, or violations of our terms of service.</p>
                </Section>

                <Section title="8. International Data Transfers">
                    <p>
                        {COMPANY} is based in India. Our infrastructure provider operates a global edge network, meaning your data may be processed in data centres located outside of India, including in the United States and European Union. By using HitAPI, you consent to the transfer of your information to these locations.
                    </p>
                    <p style={{ marginTop: 10 }}>
                        If you are located in the European Economic Area (EEA), please note that these transfers are made under appropriate safeguards including standard contractual clauses where applicable.
                    </p>
                </Section>

                <Section title="9. Your Rights">
                    <p style={{ marginBottom: 10 }}>Depending on your location, you may have the following rights regarding your personal data:</p>
                    <Li><strong>Access</strong> — Request a copy of the personal data we hold about you.</Li>
                    <Li><strong>Correction</strong> — Request correction of inaccurate or incomplete data.</Li>
                    <Li><strong>Deletion</strong> — Request deletion of your account and associated personal data, subject to legal retention obligations.</Li>
                    <Li><strong>Portability</strong> — Request your data in a machine-readable format.</Li>
                    <Li><strong>Objection</strong> — Object to certain processing activities.</Li>
                    <p style={{ marginTop: 10 }}>To exercise any of these rights, contact us at <a href={`mailto:${EMAIL}`} style={{ color: 'var(--accent)' }}>{EMAIL}</a>. We will respond within 30 days.</p>
                </Section>

                <Section title="10. Cookies">
                    <p style={{ marginBottom: 10 }}>HitAPI uses the following types of cookies and local storage:</p>
                    <Li><strong>Authentication tokens</strong> — A session token is stored in your browser's local storage to keep you logged in. This is strictly necessary for the service to function. It is not used for tracking or advertising.</Li>
                    <Li><strong>Infrastructure cookies</strong> — Our infrastructure provider may set cookies for security (e.g. bot detection, DDoS protection). These are strictly functional.</Li>
                    <Li>We do not use advertising cookies, third-party tracking pixels, or behavioural analytics cookies.</Li>
                </Section>

                <Section title="11. Children's Privacy">
                    HitAPI is a developer tool intended for professional use by adults. We do not knowingly collect personal information from children under 13 years of age. If you believe a child has provided us with personal information, contact us and we will delete it promptly.
                </Section>

                <Section title="12. Changes to This Policy">
                    We may update this Privacy Policy from time to time to reflect changes in our practices or legal requirements. The "Last updated" date at the top will always reflect the most recent version. For significant changes, we will make reasonable efforts to notify registered users by email. Continued use of HitAPI after changes are posted constitutes acceptance of the updated policy.
                </Section>

                {/* Contact */}
                <div className="card" style={{ padding: '24px 28px', borderColor: 'rgba(130,100,255,0.25)', background: 'rgba(130,100,255,0.04)' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
                        <Mail size={17} color="var(--accent)" />
                        <h2 style={{ fontSize: 15, fontWeight: 600 }}>13. Contact Us</h2>
                    </div>
                    <p style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 14, lineHeight: 1.7 }}>
                        For any questions, concerns, or data requests regarding this Privacy Policy:
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