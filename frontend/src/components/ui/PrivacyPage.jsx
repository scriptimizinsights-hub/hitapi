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
                        <strong style={{ color: 'var(--text-primary)' }}>{PRODUCT}</strong> by {COMPANY} &nbsp;·&nbsp; Last updated: {LAST_UPDATED}
                    </p>
                    <p style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.8 }}>
                        This Privacy Policy describes how {COMPANY} ("we", "us", "our") collects, uses, stores, and protects information when you use HitAPI at hitapi.dev. By using the Service, you agree to the practices described here.
                    </p>
                </div>

                <Section title="1. Information We Collect">
                    <p style={{ marginBottom: 10 }}>We collect the following categories of information:</p>

                    <p style={{ fontWeight: 600, color: 'var(--text-primary)', marginBottom: 6 }}>Account Information</p>
                    <Li>Name and email address provided during registration.</Li>
                    <Li>Password stored as a salted one-way cryptographic hash using PBKDF2-SHA256 with 100,000 iterations. We cannot recover your password.</Li>
                    <Li>Account creation timestamp and the version of our Terms &amp; Conditions you accepted at registration.</Li>

                    <p style={{ fontWeight: 600, color: 'var(--text-primary)', margin: '14px 0 6px' }}>Terms Acceptance Records</p>
                    <Li>Each time you accept our Terms &amp; Conditions, we record: your user ID, the terms version accepted, a timestamp, your IP address, and your browser user-agent string. This is required for legal compliance and is stored in an audit table.</Li>

                    <p style={{ fontWeight: 600, color: 'var(--text-primary)', margin: '14px 0 6px' }}>Project Configuration</p>
                    <Li>API base URLs and Swagger/OpenAPI spec URLs you provide.</Li>
                    <Li>Project names, descriptions, and environment labels.</Li>
                    <Li>Flow suite step configurations including endpoint paths, HTTP methods, expected status codes, and variable extraction rules.</Li>
                    <Li>Authentication configuration for test execution (see Section 2 for how credentials are stored).</Li>

                    <p style={{ fontWeight: 600, color: 'var(--text-primary)', margin: '14px 0 6px' }}>Server and Access Logs</p>
                    <Li>IP addresses, browser user-agent strings, HTTP methods, response codes, and timestamps are recorded in standard server access logs for security monitoring. These are retained for up to 30 days.</Li>
                </Section>

                <Section title="2. Information Collected During API Testing">
                    <p style={{ marginBottom: 12 }}>Because HitAPI executes HTTP requests against your APIs on your behalf, the nature of what we store is different from a typical SaaS product. Please read this section carefully.</p>

                    <p style={{ fontWeight: 600, color: 'var(--text-primary)', marginBottom: 6 }}>Authentication Credentials</p>
                    <p style={{ marginBottom: 8 }}>
                        When you configure a flow suite with login steps (e.g. email and password for your API), those credentials are stored in our database as part of your flow step configuration. They are encrypted at rest using AES-256-GCM authenticated encryption with a unique random initialisation vector per record. The encryption key is stored separately as a secret environment variable, not in the database itself. Credentials are used solely to execute login requests against your configured API endpoints during test runs.
                    </p>
                    <Note>
                        ⚠ We recommend using dedicated low-privilege test accounts rather than production or admin credentials. Never store real user passwords in test configurations.
                    </Note>

                    <p style={{ fontWeight: 600, color: 'var(--text-primary)', margin: '14px 0 6px' }}>API Requests and Responses</p>
                    <Li>When you run a test suite, HitAPI sends HTTP requests to your configured endpoints on your behalf. The full request details (URL, method, headers, body) and the API responses (status code, response body) are stored in our database to display your execution history and generate reports.</Li>
                    <Li>API response bodies are stored as plain text in the database. They are not individually encrypted at rest beyond the protections provided by our infrastructure provider.</Li>
                    <Li>You can delete individual runs at any time from the Reports page. Deleting a run permanently removes all step results, associated bug reports, and reports for that run.</Li>
                    <Note>
                        ⚠ Do not test endpoints that return real personal data, payment information, or medical records. Any data returned by your API may be stored in our systems as part of test results.
                    </Note>

                    <p style={{ fontWeight: 600, color: 'var(--text-primary)', margin: '14px 0 6px' }}>Generated Test Cases and Flow Suites</p>
                    <Li>AI-generated test cases, flow suite steps, and configurations are stored in our database associated with your account.</Li>

                    <p style={{ fontWeight: 600, color: 'var(--text-primary)', margin: '14px 0 6px' }}>AI Analysis</p>
                    <Li>When AI bug analysis runs on a failed test step, a truncated excerpt (up to 200 characters each) of the request and response, the HTTP status code, and the failure reason are sent to Cloudflare Workers AI to generate a structured bug report. Full response bodies are not sent to the AI provider.</Li>

                    <p style={{ fontWeight: 600, color: 'var(--text-primary)', margin: '14px 0 6px' }}>Security Sub-Checks</p>
                    <Li>After each flow suite run, HitAPI automatically runs security checks against your endpoints — including auth bypass, empty body, SQL injection payload, and wrong HTTP method checks. The results of these checks (status codes, pass/fail) are stored alongside your test results.</Li>
                </Section>

                <Section title="3. How We Use Your Information">
                    <Li>To create and manage your account.</Li>
                    <Li>To record your acceptance of our Terms &amp; Conditions with a timestamp and IP address for legal compliance.</Li>
                    <Li>To execute API test suites and flow suites on your behalf.</Li>
                    <Li>To store and display test results, execution history, reports, and detected bugs within your account.</Li>
                    <Li>To generate AI-powered bug analysis for failed test steps.</Li>
                    <Li>To respond to support requests.</Li>
                    <Li>To monitor for security incidents, abuse, or violations of our Terms of Service.</Li>
                    <Li>To improve the service using aggregated, anonymised usage patterns. We do not use your individual test data or API responses to train AI models without your explicit consent.</Li>
                </Section>

                <Section title="4. AI Processing">
                    <p style={{ marginBottom: 10 }}>HitAPI uses AI inference for two purposes:</p>
                    <Li><strong>Test case generation</strong> — Your API endpoint schemas (path, method, parameters, request body structure from your Swagger spec) are sent to Cloudflare Workers AI to generate test cases. API responses from your live endpoints are not sent at this stage.</Li>
                    <Li><strong>Bug analysis</strong> — For failed test steps, a truncated excerpt (up to 200 characters each) of the request and response, plus the HTTP status code and failure reason, is sent to Cloudflare Workers AI to produce a structured bug report.</Li>
                    <Note>
                        Do not configure HitAPI to test endpoints that return highly sensitive data in their responses, as excerpts may be processed by our AI inference provider (Cloudflare Workers AI).
                    </Note>
                </Section>

                <Section title="5. Data Retention">
                    <Li><strong>Account data</strong> — Retained for the lifetime of your account. Upon account deletion request, your personal data will be removed within 30 days, subject to legal retention obligations.</Li>
                    <Li><strong>Terms acceptance audit records</strong> — Retained for the lifetime of your account and for up to 7 years after account deletion, as required for legal compliance.</Li>
                    <Li><strong>Test results and execution history</strong> — Retained indefinitely while your account is active. You can delete individual flow runs at any time from the Reports page. Deleting a run permanently removes all associated step results, bug reports, and report records.</Li>
                    <Li><strong>Server access logs</strong> — Retained for up to 30 days, then deleted.</Li>
                    <Li><strong>Infrastructure backups</strong> — Our infrastructure provider (Cloudflare) may retain database backups for disaster recovery for a period of up to 30 days. Data deleted from your account may persist in backups for this period before being permanently removed from all systems.</Li>
                </Section>

                <Section title="6. Security">
                    <Li><strong>Passwords</strong> — Stored using PBKDF2-SHA256 with a unique random salt per user and 100,000 iterations. We cannot recover your password.</Li>
                    <Li><strong>Authentication credentials (flow step configurations)</strong> — Encrypted at rest using AES-256-GCM authenticated encryption. Each record uses a unique random 96-bit initialisation vector. The encryption key is stored as a Cloudflare Worker Secret, separate from the database.</Li>
                    <Li><strong>Transit encryption</strong> — All data between your browser and our services is encrypted using TLS 1.3 (HTTPS).</Li>
                    <Li><strong>API response bodies</strong> — Stored as plain text in our database. Protected by the infrastructure-level security controls provided by Cloudflare D1, but not individually encrypted at the application layer.</Li>
                    <Li><strong>Access controls</strong> — Customer data is accessible only to your account through authenticated API requests. Authorised personnel may access data only when required for maintenance, support, or security incident response.</Li>
                    <Li><strong>Terms acceptance</strong> — Each acceptance is recorded server-side with a timestamp, IP address, and user-agent string, and is tied to a specific version of our Terms &amp; Conditions.</Li>
                    <Li>No method of transmission or storage is 100% secure. We take reasonable technical measures but cannot guarantee absolute security.</Li>
                </Section>

                <Section title="7. Sharing and Service Providers">
                    <p style={{ marginBottom: 10 }}>We do not sell your data. We do not share your data with third parties for advertising. The following subprocessors may process your data as part of providing the HitAPI service:</p>

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
                                    ['Cloudflare, Inc.', 'Edge network, database (D1), queue (Queues), AI inference (Workers AI), DDoS protection', 'All data processed by HitAPI passes through Cloudflare infrastructure. Cloudflare Workers AI processes truncated API data for bug analysis.'],
                                    ['GitHub, Inc.', 'Source code hosting and CI/CD deployment pipeline', 'Source code only — no customer data'],
                                ].map(([provider, purpose, data], i) => (
                                    <tr key={i} style={{ borderBottom: '1px solid var(--border)' }}>
                                        <td style={{ padding: '10px 12px', color: 'var(--text-primary)', fontWeight: 500, verticalAlign: 'top', whiteSpace: 'nowrap' }}>{provider}</td>
                                        <td style={{ padding: '10px 12px', color: 'var(--text-secondary)', verticalAlign: 'top' }}>{purpose}</td>
                                        <td style={{ padding: '10px 12px', color: 'var(--text-secondary)', verticalAlign: 'top' }}>{data}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                    <p>We may also disclose your information if required by law, court order, or governmental authority, or to investigate fraud, abuse, or violations of our Terms of Service.</p>
                </Section>

                <Section title="8. International Data Transfers">
                    <p style={{ marginBottom: 10 }}>
                        {COMPANY} is based in India. Our infrastructure provider (Cloudflare) operates a global edge network, meaning your data may be processed in data centres outside India, including in the United States and the European Union.
                    </p>
                    <p>
                        If you are located in the European Economic Area (EEA), these transfers are made under appropriate safeguards including Standard Contractual Clauses (SCCs) as provided by Cloudflare's data processing agreements. For details of Cloudflare's international transfer mechanisms, see <a href="https://www.cloudflare.com/privacypolicy/" target="_blank" rel="noopener noreferrer" style={{ color: 'var(--accent)' }}>Cloudflare's Privacy Policy</a>.
                    </p>
                </Section>

                <Section title="9. Your Rights">
                    <p style={{ marginBottom: 10 }}>Depending on your location, you may have the following rights regarding your personal data:</p>
                    <Li><strong>Access</strong> — Request a copy of the personal data we hold about you, including your terms acceptance history.</Li>
                    <Li><strong>Correction</strong> — Request correction of inaccurate data.</Li>
                    <Li><strong>Deletion</strong> — Request deletion of your account and personal data. Test results and execution history can be deleted by you directly from the Reports page at any time. Account deletion requests are processed within 30 days.</Li>
                    <Li><strong>Portability</strong> — Request your data in a machine-readable format.</Li>
                    <Li><strong>Objection</strong> — Object to certain processing activities.</Li>
                    <p style={{ marginTop: 10 }}>To exercise any of these rights, contact us at <a href={`mailto:${EMAIL}`} style={{ color: 'var(--accent)' }}>{EMAIL}</a>. We will respond within 30 days.</p>
                </Section>

                <Section title="10. Cookies and Local Storage">
                    <p style={{ marginBottom: 10 }}>HitAPI uses the following storage mechanisms:</p>
                    <Li><strong>Authentication token (localStorage)</strong> — A signed JWT session token is stored in your browser's localStorage to keep you logged in. It contains your user ID, name, and email. It expires after 7 days. This is strictly necessary for the service to function and is not used for tracking.</Li>
                    <Li><strong>Infrastructure cookies</strong> — Cloudflare may set cookies for security purposes (e.g. bot detection, DDoS protection). These are strictly functional.</Li>
                    <Li>We do not use advertising cookies, third-party tracking pixels, or behavioural analytics.</Li>
                </Section>

                <Section title="11. Children's Privacy">
                    HitAPI is a developer tool intended for professional use by adults. We do not knowingly collect personal information from anyone under 18 years of age. If you believe a minor has registered, contact us at {EMAIL} and we will delete the account promptly.
                </Section>

                <Section title="12. Changes to This Policy">
                    <p>
                        We may update this Privacy Policy to reflect changes in our practices, the features we implement, or legal requirements. The "Last updated" date at the top will always reflect the most recent version. For significant changes, we will make reasonable efforts to notify registered users by email or via an in-app notice. Continued use of {PRODUCT} after changes are posted constitutes acceptance of the updated policy.
                    </p>
                </Section>

                {/* Contact */}
                <div className="card" style={{ padding: '24px 28px', borderColor: 'rgba(130,100,255,0.25)', background: 'rgba(130,100,255,0.04)' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
                        <Mail size={17} color="var(--accent)" />
                        <h2 style={{ fontSize: 15, fontWeight: 600 }}>13. Contact Us</h2>
                    </div>
                    <p style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 14, lineHeight: 1.7 }}>
                        For any questions, concerns, data requests, or to exercise your rights under this Privacy Policy:
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
                    © 2026 {COMPANY} · <a href="/support" style={{ color: 'var(--accent)' }}>Support</a> · <a href="/privacy" style={{ color: 'var(--accent)' }}>Privacy</a> · <a href="/terms" style={{ color: 'var(--accent)' }}>Terms</a>
                </div>
            </div>
        </div>
    );
}