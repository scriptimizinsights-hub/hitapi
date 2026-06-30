import { useNavigate } from 'react-router-dom';
import { ArrowLeft, FileText } from 'lucide-react';

const LAST_UPDATED = 'June 30, 2026';
const COMPANY = 'Scriptimiz Insight LLP';
const EMAIL = 'support@hitapi.dev';
const ADDRESS = 'Gokul Nagar, Akurli Road, Kandivali East, Mumbai – 400101, Maharashtra, India';
const PRODUCT = 'HitAPI';
const WEBSITE = 'hitapi.dev';

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

export function TermsPage() {
    const navigate = useNavigate();

    return (
        <div style={{ minHeight: '100vh', background: 'var(--bg-app)' }}>
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

            <div style={{ maxWidth: 760, margin: '0 auto', padding: '48px 24px' }}>

                {/* Header */}
                <div style={{ marginBottom: 40 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
                        <FileText size={26} color="var(--accent)" />
                        <h1 style={{ fontSize: 30, fontWeight: 700, letterSpacing: '-0.02em' }}>Terms &amp; Conditions</h1>
                    </div>
                    <p style={{ color: 'var(--text-secondary)', fontSize: 13, marginBottom: 16 }}>
                        <strong style={{ color: 'var(--text-primary)' }}>{PRODUCT}</strong> by {COMPANY} &nbsp;·&nbsp; Last updated: {LAST_UPDATED}
                    </p>
                    <p style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.8 }}>
                        Please read these Terms and Conditions ("Terms") carefully before using {PRODUCT} (the "Service"), operated by {COMPANY} ("we", "us", "our") at {WEBSITE}. By accessing or using the Service, creating an account, or clicking "I agree", you confirm that you have read, understood, and agree to be bound by these Terms. If you do not agree, do not use the Service.
                    </p>
                </div>

                <Section title="1. Acceptance of Terms">
                    <p style={{ marginBottom: 10 }}>
                        These Terms constitute a legally binding agreement between you ("User", "you") and {COMPANY}. They govern your use of {PRODUCT}, including the web application at {WEBSITE}, any browser extensions, APIs, and related services.
                    </p>
                    <p>
                        We reserve the right to update these Terms at any time. We will update the "Last updated" date and, for material changes, notify registered users by email. Continued use of the Service after changes constitutes acceptance of the updated Terms.
                    </p>
                </Section>

                <Section title="2. Description of Service">
                    <p style={{ marginBottom: 10 }}>
                        {PRODUCT} is an AI-powered API testing platform that allows users to:
                    </p>
                    <Li>Import API specifications (OpenAPI/Swagger) and discover endpoints.</Li>
                    <Li>Generate automated test cases using AI.</Li>
                    <Li>Execute test suites and flow suites against user-configured API endpoints.</Li>
                    <Li>Receive AI-generated bug reports and test execution reports.</Li>
                    <Li>Manage projects, test configurations, and execution history.</Li>
                    <p style={{ marginTop: 10 }}>
                        The Service is intended for developers, QA engineers, and technical teams for legitimate API testing purposes only.
                    </p>
                </Section>

                <Section title="3. Account Registration">
                    <Li>You must register for an account to use the Service. You agree to provide accurate, current, and complete information during registration.</Li>
                    <Li>You are responsible for maintaining the confidentiality of your account credentials. You must notify us immediately at <a href={`mailto:${EMAIL}`} style={{ color: 'var(--accent)' }}>{EMAIL}</a> if you suspect unauthorised access to your account.</Li>
                    <Li>You must be at least 18 years of age, or the age of legal majority in your jurisdiction, to use the Service.</Li>
                    <Li>One person or legal entity may not maintain more than one free account.</Li>
                    <Li>You are responsible for all activity that occurs under your account.</Li>
                </Section>

                <Section title="4. Acceptable Use">
                    <p style={{ marginBottom: 10 }}>You agree to use {PRODUCT} only for lawful purposes. You must not use the Service to:</p>
                    <Li>Test APIs or systems that you do not own or have explicit written authorisation to test. Unauthorised API testing may constitute a criminal offence under applicable computer crime laws.</Li>
                    <Li>Send requests to APIs with the intent to disrupt, degrade, or deny service (denial-of-service attacks).</Li>
                    <Li>Attempt to extract, scrape, or harvest data from third-party APIs without authorisation.</Li>
                    <Li>Use the Service to develop, test, or deploy malware, exploits, or any software designed to harm systems or users.</Li>
                    <Li>Probe, scan, or test the vulnerability of {PRODUCT} itself or its underlying infrastructure without our written permission.</Li>
                    <Li>Violate any applicable law or regulation, including data protection laws, export control laws, or intellectual property laws.</Li>
                    <Li>Impersonate any person or entity, or misrepresent your affiliation with any person or entity.</Li>
                    <Li>Resell, sublicense, or commercially exploit the Service without our prior written consent.</Li>
                    <p style={{ marginTop: 10 }}>
                        We reserve the right to suspend or terminate accounts that violate these acceptable use requirements, without notice.
                    </p>
                </Section>

                <Section title="5. Your Responsibilities as a User">
                    <Li><strong>Authorisation</strong> — You are solely responsible for ensuring you have legal authorisation to test any API you configure within {PRODUCT}. We are not liable for any consequences arising from unauthorised testing.</Li>
                    <Li><strong>Test data</strong> — You are responsible for the data you include in test configurations, including credentials, API keys, and request payloads. Do not include sensitive personal data, payment card data, or production credentials in test configurations unless you understand and accept the associated risks.</Li>
                    <Li><strong>API responses</strong> — Test results, including API response bodies, are stored in our systems. You are responsible for ensuring that the APIs you test do not return unnecessary sensitive or personal data in responses.</Li>
                    <Li><strong>Compliance</strong> — You are responsible for ensuring your use of {PRODUCT} complies with any terms of service of the APIs you test, and with applicable laws in your jurisdiction.</Li>
                </Section>

                <Section title="6. Intellectual Property">
                    <Li><strong>Our IP</strong> — {PRODUCT}, its source code, design, branding, AI models, and all associated intellectual property are owned by or licensed to {COMPANY}. Nothing in these Terms grants you ownership of any part of the Service.</Li>
                    <Li><strong>Your IP</strong> — You retain ownership of your API specifications, test configurations, and data. By using the Service, you grant us a limited, non-exclusive licence to process and store your data solely to provide the Service.</Li>
                    <Li><strong>Feedback</strong> — If you submit feedback, suggestions, or bug reports to us, you grant us the right to use that feedback without restriction or compensation.</Li>
                </Section>

                <Section title="7. AI-Generated Content">
                    <p style={{ marginBottom: 10 }}>
                        {PRODUCT} uses AI to generate test cases and bug analysis reports. You acknowledge that:
                    </p>
                    <Li>AI-generated content may be inaccurate, incomplete, or misleading. Always review AI-generated test cases and bug reports before relying on them.</Li>
                    <Li>AI-generated test cases should not be used as the sole basis for security assessments or production deployments without human review.</Li>
                    <Li>We make no warranty that AI-generated content is fit for any particular purpose.</Li>
                    <Li>To generate test cases and bug reports, excerpts of your API schemas and response data may be processed by our AI inference provider (Cloudflare Workers AI). By using these features, you consent to this processing.</Li>
                </Section>

                <Section title="8. Fees and Payment">
                    <p style={{ marginBottom: 10 }}>
                        {PRODUCT} is currently available at no charge during the early access period. We reserve the right to introduce paid plans in the future. If we do:
                    </p>
                    <Li>We will provide reasonable advance notice before charging existing users.</Li>
                    <Li>Free tier limitations, if any, will be clearly communicated.</Li>
                    <Li>All fees are non-refundable unless otherwise stated or required by applicable law.</Li>
                </Section>

                <Section title="9. Disclaimers and Limitation of Liability">
                    <p style={{ marginBottom: 10, fontWeight: 600, color: 'var(--text-primary)' }}>THE SERVICE IS PROVIDED "AS IS" AND "AS AVAILABLE" WITHOUT WARRANTIES OF ANY KIND.</p>
                    <p style={{ marginBottom: 10 }}>
                        To the fullest extent permitted by applicable law, {COMPANY} disclaims all warranties, express or implied, including but not limited to warranties of merchantability, fitness for a particular purpose, and non-infringement.
                    </p>
                    <p style={{ marginBottom: 10 }}>We do not warrant that:</p>
                    <Li>The Service will be uninterrupted, error-free, or secure.</Li>
                    <Li>AI-generated test cases or bug reports will be accurate or complete.</Li>
                    <Li>The Service will meet your specific requirements.</Li>
                    <p style={{ marginTop: 10, marginBottom: 10, fontWeight: 600, color: 'var(--text-primary)' }}>LIMITATION OF LIABILITY</p>
                    <p>
                        To the maximum extent permitted by law, {COMPANY} shall not be liable for any indirect, incidental, special, consequential, or punitive damages, including but not limited to loss of profits, data, or goodwill, arising from your use of or inability to use the Service. Our total liability for any claim arising from these Terms or the Service shall not exceed the amount you paid us in the 12 months preceding the claim, or ₹1,000 (Indian Rupees), whichever is greater.
                    </p>
                </Section>

                <Section title="10. Indemnification">
                    <p>
                        You agree to indemnify, defend, and hold harmless {COMPANY}, its officers, directors, employees, and agents from and against any claims, liabilities, damages, losses, and expenses (including legal fees) arising from: (a) your use of the Service; (b) your violation of these Terms; (c) your testing of APIs without authorisation; or (d) your violation of any third-party rights.
                    </p>
                </Section>

                <Section title="11. Termination">
                    <Li>You may terminate your account at any time by contacting us at {EMAIL}.</Li>
                    <Li>We may suspend or terminate your access immediately, without notice, if you violate these Terms, engage in fraudulent activity, or if we are required to do so by law.</Li>
                    <Li>Upon termination, your right to use the Service ceases immediately. We will delete your data in accordance with our Privacy Policy, subject to any legal retention obligations.</Li>
                </Section>

                <Section title="12. Governing Law and Dispute Resolution">
                    <p style={{ marginBottom: 10 }}>
                        These Terms are governed by the laws of India, without regard to conflict of law principles. Any disputes arising from these Terms or the Service shall be subject to the exclusive jurisdiction of the courts of Mumbai, Maharashtra, India.
                    </p>
                    <p>
                        Before initiating formal proceedings, you agree to first contact us at {EMAIL} to attempt to resolve the dispute informally. We will make reasonable efforts to resolve disputes within 30 days.
                    </p>
                </Section>

                <Section title="13. Miscellaneous">
                    <Li><strong>Entire Agreement</strong> — These Terms, together with our Privacy Policy, constitute the entire agreement between you and {COMPANY} regarding the Service.</Li>
                    <Li><strong>Severability</strong> — If any provision of these Terms is found to be unenforceable, the remaining provisions will continue in full force.</Li>
                    <Li><strong>No Waiver</strong> — Our failure to enforce any right or provision of these Terms does not constitute a waiver of that right.</Li>
                    <Li><strong>Assignment</strong> — You may not assign your rights under these Terms without our written consent. We may assign our rights without restriction.</Li>
                </Section>

                {/* Contact */}
                <div className="card" style={{ padding: '24px 28px', borderColor: 'rgba(130,100,255,0.25)', background: 'rgba(130,100,255,0.04)', marginBottom: 32 }}>
                    <h2 style={{ fontSize: 15, fontWeight: 600, marginBottom: 12 }}>14. Contact Us</h2>
                    <p style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 14, lineHeight: 1.7 }}>
                        Questions about these Terms? Contact us:
                    </p>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8, fontSize: 13 }}>
                        <div><a href={`mailto:${EMAIL}`} style={{ color: 'var(--accent)' }}>{EMAIL}</a></div>
                        <div style={{ color: 'var(--text-secondary)' }}>{COMPANY}<br />{ADDRESS}</div>
                    </div>
                </div>

                <div style={{ textAlign: 'center', fontSize: 11, color: 'var(--text-tertiary)' }}>
                    © 2026 {COMPANY} · <a href="/support" style={{ color: 'var(--accent)' }}>Support</a> · <a href="/privacy" style={{ color: 'var(--accent)' }}>Privacy</a> · <a href="/terms" style={{ color: 'var(--accent)' }}>Terms</a>
                </div>
            </div>
        </div>
    );
}