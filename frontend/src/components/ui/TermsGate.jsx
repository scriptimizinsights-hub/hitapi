import { useState, useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { FileText, ExternalLink, CheckCircle2 } from 'lucide-react';
import { useStore } from '../../store/index.js';

// Must match CURRENT_TERMS_VERSION in worker/src/services/auth.js
export const CURRENT_TERMS_VERSION = '2026-06-30';

// Pages that must always be accessible without terms acceptance
const PUBLIC_PATHS = ['/terms', '/privacy', '/how-it-works', '/support'];

export function TermsGate({ children }) {
    const { user, acceptTerms } = useStore();
    const location = useLocation();
    const [needsAcceptance, setNeedsAcceptance] = useState(false);
    const [checked, setChecked] = useState(false);
    const [scrolled, setScrolled] = useState(false);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');

    useEffect(() => {
        if (!user) { setNeedsAcceptance(false); return; }
        setNeedsAcceptance(user.terms_version_accepted !== CURRENT_TERMS_VERSION);
    }, [user]);

    async function handleAccept() {
        if (!checked) return;
        setLoading(true);
        setError('');
        try {
            await acceptTerms(CURRENT_TERMS_VERSION);
            setNeedsAcceptance(false);
        } catch (err) {
            setError(err.message || 'Failed to record acceptance. Please try again.');
        } finally {
            setLoading(false);
        }
    }

    function handleScroll(e) {
        const el = e.currentTarget;
        if (el.scrollTop + el.clientHeight >= el.scrollHeight - 40) setScrolled(true);
    }

    // Always render children first
    // Only show modal on top if: user is logged in, needs acceptance, AND not on a public page
    const isPublicPath = PUBLIC_PATHS.includes(location.pathname);
    const showModal = needsAcceptance && !isPublicPath;

    const isUpdate = user?.terms_version_accepted != null;

    return (
        <>
            {/* Always render children — public pages work without terms */}
            {children}

            {/* Modal overlaid on top when needed */}
            {showModal && (
                <>
                    <div style={{ position: 'fixed', inset: 0, zIndex: 9998, background: 'rgba(0,0,0,0.75)', backdropFilter: 'blur(4px)' }} />
                    <div style={{ position: 'fixed', inset: 0, zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
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
                                            ? `Our terms have been updated (v${CURRENT_TERMS_VERSION}). Please review and accept to continue.`
                                            : 'Please read and accept before using HitAPI'}
                                    </div>
                                </div>
                                <span style={{ fontSize: 11, fontFamily: 'JetBrains Mono, monospace', color: 'var(--text-tertiary)', background: 'rgba(255,255,255,0.04)', padding: '3px 8px', borderRadius: 5 }}>
                                    v{CURRENT_TERMS_VERSION}
                                </span>
                            </div>

                            {/* Scrollable content */}
                            <div onScroll={handleScroll} style={{ flex: 1, overflowY: 'auto', padding: '20px 24px', fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.85 }}>
                                {isUpdate && (
                                    <div style={{ padding: '10px 14px', background: 'rgba(255,181,71,0.07)', border: '1px solid rgba(255,181,71,0.2)', borderRadius: 7, marginBottom: 16, color: 'var(--amber)' }}>
                                        ⚠ Our Terms & Conditions have been updated since you last accepted. Review and accept the new version to continue.
                                    </div>
                                )}

                                <p style={{ fontWeight: 600, color: 'var(--text-primary)', marginBottom: 14 }}>Key points you are agreeing to:</p>

                                {[
                                    { title: '1. Authorised Testing Only', body: 'You may only test APIs you own or have explicit written permission to test. Unauthorised testing may be a criminal offence. We are not liable for consequences of unauthorised use.' },
                                    { title: '2. Credential Storage', body: 'Authentication credentials you configure for test execution (e.g. email/password for your API) are stored in our database, encrypted at rest using AES-256-GCM. Use dedicated test accounts — never production credentials.' },
                                    { title: '3. API Response Storage', body: 'Full API response bodies from your test runs are stored to display your execution history. Do not test endpoints that return real personal data, payment info, or medical records.' },
                                    { title: '4. AI Processing', body: 'Truncated excerpts (up to 200 chars) of failed step request/response data are sent to Cloudflare Workers AI for bug analysis. Ensure your API error responses do not echo sensitive secrets.' },
                                    { title: '5. Acceptable Use', body: 'Do not use HitAPI for denial-of-service attacks, to develop exploits, to violate any law, or to probe our infrastructure.' },
                                    { title: '6. No Warranty & Liability', body: 'The service is provided "as is". AI-generated content may be inaccurate. We are not liable for indirect or consequential damages.' },
                                    { title: '7. Governing Law', body: 'These Terms are governed by the laws of India. Disputes are subject to courts in Mumbai, Maharashtra.' },
                                ].map(({ title, body }) => (
                                    <div key={title} style={{ marginBottom: 14 }}>
                                        <div style={{ fontWeight: 600, color: 'var(--text-primary)', marginBottom: 4 }}>{title}</div>
                                        <div>{body}</div>
                                    </div>
                                ))}

                                <div style={{ padding: '12px 14px', background: 'rgba(130,100,255,0.06)', border: '1px solid rgba(130,100,255,0.2)', borderRadius: 8, marginTop: 8 }}>
                                    <div style={{ fontWeight: 600, color: 'var(--accent)', marginBottom: 6 }}>Read the full documents</div>
                                    <div style={{ display: 'flex', gap: 16 }}>
                                        <a href="/terms" target="_blank" rel="noopener noreferrer" style={{ color: 'var(--accent)', display: 'flex', alignItems: 'center', gap: 4 }}>
                                            <ExternalLink size={11} /> Terms & Conditions
                                        </a>
                                        <a href="/privacy" target="_blank" rel="noopener noreferrer" style={{ color: 'var(--accent)', display: 'flex', alignItems: 'center', gap: 4 }}>
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
                                <div style={{ padding: '10px 12px', background: 'rgba(35,209,139,0.05)', border: '1px solid rgba(35,209,139,0.15)', borderRadius: 7, marginBottom: 12, fontSize: 11, color: 'var(--text-secondary)' }}>
                                    <div style={{ display: 'flex', gap: 6, alignItems: 'flex-start' }}>
                                        <CheckCircle2 size={13} color="var(--green)" style={{ flexShrink: 0, marginTop: 1 }} />
                                        <span>
                                            Your acceptance is recorded server-side with a timestamp and IP address.
                                            Version <strong style={{ color: 'var(--text-primary)', fontFamily: 'JetBrains Mono, monospace' }}>{CURRENT_TERMS_VERSION}</strong> will be saved to your account.
                                        </span>
                                    </div>
                                </div>

                                <label style={{ display: 'flex', alignItems: 'flex-start', gap: 10, cursor: 'pointer', marginBottom: 14 }}>
                                    <input type="checkbox" checked={checked} onChange={e => setChecked(e.target.checked)}
                                        style={{ width: 16, height: 16, marginTop: 2, accentColor: 'var(--accent)', flexShrink: 0, cursor: 'pointer' }} />
                                    <span style={{ fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.6 }}>
                                        I have read and agree to the{' '}
                                        <a href="/terms" target="_blank" rel="noopener noreferrer" style={{ color: 'var(--accent)' }}>Terms & Conditions</a>
                                        {' '}and{' '}
                                        <a href="/privacy" target="_blank" rel="noopener noreferrer" style={{ color: 'var(--accent)' }}>Privacy Policy</a>.
                                        I confirm I will only test APIs I am authorised to test.
                                    </span>
                                </label>

                                {error && (
                                    <div style={{ padding: '8px 12px', background: 'var(--red-bg)', border: '1px solid var(--red-border)', borderRadius: 6, fontSize: 12, color: 'var(--red)', marginBottom: 12 }}>
                                        ✗ {error}
                                    </div>
                                )}

                                <div style={{ display: 'flex', gap: 10 }}>
                                    <button onClick={() => useStore.getState().logout()}
                                        style={{ flex: 1, padding: '10px', borderRadius: 8, fontSize: 13, cursor: 'pointer', background: 'transparent', color: 'var(--text-tertiary)', border: '1px solid var(--border)' }}>
                                        Sign Out
                                    </button>
                                    <button onClick={handleAccept} disabled={!checked || loading}
                                        style={{
                                            flex: 2, padding: '10px', borderRadius: 8, fontSize: 13, fontWeight: 600,
                                            cursor: checked && !loading ? 'pointer' : 'not-allowed',
                                            background: checked ? 'var(--accent)' : 'rgba(130,100,255,0.2)',
                                            color: checked ? '#fff' : 'rgba(255,255,255,0.3)',
                                            border: 'none', transition: 'all .15s',
                                            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                                        }}>
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
            )}
        </>
    );
}