import { useState, useEffect } from 'react';
import { FileText, ExternalLink, CheckCircle2 } from 'lucide-react';
import { useStore } from '../../store/index.js';

// Must match CURRENT_TERMS_VERSION in worker/src/services/auth.js
export const CURRENT_TERMS_VERSION = '2026-06-30';

export function TermsGate({ children }) {
    const { user, acceptTerms } = useStore();
    const [showGate, setShowGate] = useState(false);
    const [checked, setChecked] = useState(false);
    const [scrolled, setScrolled] = useState(false);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');

    useEffect(() => {
        if (!user) return;
        // Show gate if user hasn't accepted current version
        if (user.terms_version_accepted !== CURRENT_TERMS_VERSION) {
            setShowGate(true);
        }
    }, [user]);

    async function handleAccept() {
        if (!checked) return;
        setLoading(true);
        setError('');
        try {
            await acceptTerms(CURRENT_TERMS_VERSION);
            setShowGate(false);
        } catch (err) {
            setError(err.message || 'Failed to record acceptance. Please try again.');
        } finally {
            setLoading(false);
        }
    }

    function handleScroll(e) {
        const el = e.currentTarget;
        if (el.scrollTop + el.clientHeight >= el.scrollHeight - 40) {
            setScrolled(true);
        }
    }

    // Not logged in — no gate needed (handled by LoginPage)
    if (!user) return children;

    // Terms accepted for current version
    if (!showGate) return children;

    const isUpdate = user.terms_version_accepted !== null;

    return (
        <>
            {/* Dimmed background showing the app is there */}
            <div style={{ position: 'fixed', inset: 0, zIndex: 9998, background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(4px)' }} />

            {/* Modal */}
            <div style={{
                position: 'fixed', inset: 0, zIndex: 9999,
                display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20,
            }}>
                <div style={{
                    width: '100%', maxWidth: 600,
                    background: 'var(--bg-card)', border: '1px solid var(--border)',
                    borderRadius: 16, overflow: 'hidden',
                    boxShadow: '0 24px 80px rgba(0,0,0,0.7)',
                    display: 'flex', flexDirection: 'column', maxHeight: '90vh',
                }}>

                    {/* Header */}
                    <div style={{ padding: '20px 24px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 12 }}>
                        <div style={{ width: 40, height: 40, borderRadius: 10, background: 'rgba(130,100,255,0.1)', border: '1px solid rgba(130,100,255,0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                            <FileText size={19} color="var(--accent)" />
                        </div>
                        <div style={{ flex: 1 }}>
                            <div style={{ fontSize: 15, fontWeight: 700 }}>
                                {isUpdate ? '📋 Terms Updated' : '📋 Terms & Conditions'}
                            </div>
                            <div style={{ fontSize: 11, color: 'var(--text-tertiary)', marginTop: 1 }}>
                                {isUpdate
                                    ? `Our terms have been updated (version ${CURRENT_TERMS_VERSION}). Please review and accept to continue.`
                                    : 'Please read and accept before using HitAPI'}
                            </div>
                        </div>
                        <div style={{ fontSize: 11, fontFamily: 'JetBrains Mono, monospace', color: 'var(--text-tertiary)', background: 'rgba(255,255,255,0.04)', padding: '3px 8px', borderRadius: 5, flexShrink: 0 }}>
                            v{CURRENT_TERMS_VERSION}
                        </div>
                    </div>

                    {/* Scrollable summary */}
                    <div onScroll={handleScroll} style={{
                        flex: 1, overflowY: 'auto', padding: '20px 24px',
                        fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.85,
                    }}>
                        {isUpdate && (
                            <div style={{ padding: '10px 14px', background: 'rgba(255,181,71,0.07)', border: '1px solid rgba(255,181,71,0.2)', borderRadius: 7, marginBottom: 16, fontSize: 12, color: 'var(--amber)' }}>
                                ⚠ Our Terms & Conditions have been updated since you last accepted them. You must review and accept the new version to continue using HitAPI.
                            </div>
                        )}

                        <p style={{ fontWeight: 600, color: 'var(--text-primary)', marginBottom: 14 }}>
                            By accepting, you agree to the following key points:
                        </p>

                        {[
                            {
                                title: '1. Authorised Testing Only',
                                body: 'You may only use HitAPI to test APIs and systems that you own or have explicit written authorisation to test. Unauthorised API testing may constitute a criminal offence. We are not liable for consequences of unauthorised testing.',
                            },
                            {
                                title: '2. Your Responsibilities',
                                body: 'You are responsible for the configurations you create, the APIs you test, the credentials you provide, and data returned by your APIs. Do not include real production credentials or sensitive personal data in test configurations.',
                            },
                            {
                                title: '3. AI-Generated Content',
                                body: 'Test cases and bug reports are generated by AI and may be inaccurate. Always review AI output before relying on it. Excerpts of API request/response data may be processed by our AI inference provider (Cloudflare Workers AI) to generate bug reports.',
                            },
                            {
                                title: '4. Data Storage',
                                body: 'Test execution results — including API response bodies — are stored in our systems to display your history and reports. Authentication credentials you configure for test execution are stored as part of your flow step configuration.',
                            },
                            {
                                title: '5. Acceptable Use',
                                body: 'Do not use HitAPI to conduct denial-of-service attacks, probe our infrastructure, develop exploits, violate any law, or resell the Service without permission.',
                            },
                            {
                                title: '6. No Warranty & Liability',
                                body: 'The Service is provided "as is". We are not liable for indirect or consequential damages. Our total liability shall not exceed amounts paid to us in the preceding 12 months.',
                            },
                            {
                                title: '7. Governing Law',
                                body: 'These Terms are governed by the laws of India. Disputes are subject to the exclusive jurisdiction of courts in Mumbai, Maharashtra.',
                            },
                        ].map(({ title, body }) => (
                            <div key={title} style={{ marginBottom: 14 }}>
                                <div style={{ fontWeight: 600, color: 'var(--text-primary)', marginBottom: 4 }}>{title}</div>
                                <div>{body}</div>
                            </div>
                        ))}

                        <div style={{ padding: '12px 14px', background: 'rgba(130,100,255,0.06)', border: '1px solid rgba(130,100,255,0.2)', borderRadius: 8, marginTop: 8 }}>
                            <div style={{ fontWeight: 600, color: 'var(--accent)', marginBottom: 6, fontSize: 12 }}>Read the full documents</div>
                            <div style={{ display: 'flex', gap: 16 }}>
                                <a href="/terms" target="_blank" rel="noopener noreferrer" style={{ color: 'var(--accent)', fontSize: 12, display: 'flex', alignItems: 'center', gap: 4 }}>
                                    <ExternalLink size={11} /> Terms & Conditions
                                </a>
                                <a href="/privacy" target="_blank" rel="noopener noreferrer" style={{ color: 'var(--accent)', fontSize: 12, display: 'flex', alignItems: 'center', gap: 4 }}>
                                    <ExternalLink size={11} /> Privacy Policy
                                </a>
                            </div>
                        </div>

                        {!scrolled && (
                            <div style={{ textAlign: 'center', marginTop: 12, fontSize: 11, color: 'var(--text-tertiary)', fontStyle: 'italic' }}>
                                ↓ Scroll to read all terms before accepting
                            </div>
                        )}
                    </div>

                    {/* Footer */}
                    <div style={{ padding: '16px 24px', borderTop: '1px solid var(--border)', background: 'rgba(0,0,0,0.2)' }}>

                        {/* What you're agreeing to */}
                        <div style={{ padding: '10px 12px', background: 'rgba(35,209,139,0.05)', border: '1px solid rgba(35,209,139,0.15)', borderRadius: 7, marginBottom: 12, fontSize: 11, color: 'var(--text-secondary)' }}>
                            <div style={{ display: 'flex', gap: 6, alignItems: 'flex-start' }}>
                                <CheckCircle2 size={13} color="var(--green)" style={{ flexShrink: 0, marginTop: 1 }} />
                                <span>
                                    Your acceptance will be recorded with a timestamp and your IP address as required for legal compliance.
                                    Version <strong style={{ color: 'var(--text-primary)', fontFamily: 'JetBrains Mono, monospace' }}>{CURRENT_TERMS_VERSION}</strong> will be stored against your account.
                                </span>
                            </div>
                        </div>

                        {/* Checkbox */}
                        <label style={{ display: 'flex', alignItems: 'flex-start', gap: 10, cursor: 'pointer', marginBottom: 14 }}>
                            <input
                                type="checkbox"
                                checked={checked}
                                onChange={e => setChecked(e.target.checked)}
                                style={{ width: 16, height: 16, marginTop: 2, accentColor: 'var(--accent)', flexShrink: 0, cursor: 'pointer' }}
                            />
                            <span style={{ fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.6 }}>
                                I have read and agree to the{' '}
                                <a href="/terms" target="_blank" rel="noopener noreferrer" style={{ color: 'var(--accent)' }}>Terms & Conditions</a>
                                {' '}and{' '}
                                <a href="/privacy" target="_blank" rel="noopener noreferrer" style={{ color: 'var(--accent)' }}>Privacy Policy</a>.
                                I confirm that I will only test APIs I am authorised to test.
                            </span>
                        </label>

                        {error && (
                            <div style={{ padding: '8px 12px', background: 'var(--red-bg)', border: '1px solid var(--red-border)', borderRadius: 6, fontSize: 12, color: 'var(--red)', marginBottom: 12 }}>
                                ✗ {error}
                            </div>
                        )}

                        {/* Buttons */}
                        <div style={{ display: 'flex', gap: 10 }}>
                            <button
                                onClick={() => { useStore.getState().logout(); }}
                                style={{
                                    flex: 1, padding: '10px', borderRadius: 8, fontSize: 13, cursor: 'pointer',
                                    background: 'transparent', color: 'var(--text-tertiary)',
                                    border: '1px solid var(--border)',
                                }}
                            >
                                Sign Out
                            </button>
                            <button
                                onClick={handleAccept}
                                disabled={!checked || loading}
                                style={{
                                    flex: 2, padding: '10px', borderRadius: 8, fontSize: 13, fontWeight: 600,
                                    cursor: checked && !loading ? 'pointer' : 'not-allowed',
                                    background: checked ? 'var(--accent)' : 'rgba(130,100,255,0.2)',
                                    color: checked ? '#fff' : 'rgba(255,255,255,0.3)',
                                    border: 'none', transition: 'all .15s',
                                    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                                }}
                            >
                                {loading
                                    ? <><div className="spinner" style={{ width: 14, height: 14 }} /> Recording acceptance…</>
                                    : checked ? '✓ I Accept — Continue to HitAPI' : 'Check the box above to continue'
                                }
                            </button>
                        </div>

                        <div style={{ textAlign: 'center', marginTop: 10, fontSize: 10, color: 'var(--text-tertiary)' }}>
                            Acceptance recorded server-side with timestamp and IP · Scriptimiz Insight LLP, Mumbai, India
                        </div>
                    </div>
                </div>
            </div>
        </>
    );
}