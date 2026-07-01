import { useNavigate } from 'react-router-dom';
import { Zap, ExternalLink, Mail } from 'lucide-react';

const CURRENT_YEAR = new Date().getFullYear();

export function PublicFooter() {
    const navigate = useNavigate();

    return (
        <footer style={{
            borderTop: '1px solid var(--border)',
            background: 'rgba(255,255,255,0.01)',
            padding: '40px 40px 28px',
        }}>
            <div style={{ maxWidth: 1100, margin: '0 auto' }}>

                {/* Top row — brand + columns */}
                <div style={{ display: 'grid', gridTemplateColumns: '200px 1fr 1fr 1fr', gap: 40, marginBottom: 36 }}>

                    {/* Brand */}
                    <div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
                            <div style={{ width: 26, height: 26, borderRadius: 7, background: 'linear-gradient(135deg,#8264ff,#5ca8ff)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                                <Zap size={13} color="#fff" />
                            </div>
                            <span style={{ fontSize: 15, fontWeight: 700 }}>HitAPI</span>
                        </div>
                        <p style={{ fontSize: 12, color: 'var(--text-tertiary)', lineHeight: 1.7, margin: 0 }}>
                            AI-powered API testing.<br />No setup. Free to start.
                        </p>
                    </div>

                    {/* Product */}
                    <div>
                        <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '.08em', marginBottom: 14 }}>Product</div>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                            <FooterLink onClick={() => navigate('/how-it-works')}>How it works</FooterLink>
                            <FooterLink onClick={() => window.open('https://chromewebstore.google.com/search/HitAPI', '_blank')}>
                                Chrome Extension <ExternalLink size={10} style={{ marginLeft: 3, verticalAlign: 'middle' }} />
                            </FooterLink>
                            <FooterLink onClick={() => navigate('/login')}>Sign in</FooterLink>
                            <FooterLink onClick={() => navigate('/login')}>Create account</FooterLink>
                        </div>
                    </div>

                    {/* Legal */}
                    <div>
                        <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '.08em', marginBottom: 14 }}>Legal</div>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                            <FooterLink onClick={() => navigate('/privacy')}>Privacy Policy</FooterLink>
                            <FooterLink onClick={() => navigate('/terms')}>Terms &amp; Conditions</FooterLink>
                        </div>
                    </div>

                    {/* Support */}
                    <div>
                        <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '.08em', marginBottom: 14 }}>Support</div>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                            <FooterLink onClick={() => navigate('/support')}>Help &amp; Support</FooterLink>
                            <FooterLink onClick={() => window.location.href = 'mailto:support@hitapi.dev'}>
                                <Mail size={11} style={{ verticalAlign: 'middle', marginRight: 4 }} />
                                support@hitapi.dev
                            </FooterLink>
                        </div>
                    </div>
                </div>

                {/* Bottom row — copyright */}
                <div style={{
                    borderTop: '1px solid var(--border)',
                    paddingTop: 20,
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                    flexWrap: 'wrap', gap: 8,
                }}>
                    <span style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>
                        © {CURRENT_YEAR} Scriptimiz Insight LLP · Mumbai, India
                    </span>
                    <span style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>
                        Made with ⚡ on Cloudflare
                    </span>
                </div>
            </div>
        </footer>
    );
}

function FooterLink({ onClick, children }) {
    return (
        <button
            onClick={onClick}
            style={{
                background: 'none', border: 'none', cursor: 'pointer',
                fontSize: 13, color: 'var(--text-secondary)', textAlign: 'left',
                padding: 0, display: 'flex', alignItems: 'center',
                transition: 'color .15s',
            }}
            onMouseEnter={e => e.currentTarget.style.color = 'var(--text-primary)'}
            onMouseLeave={e => e.currentTarget.style.color = 'var(--text-secondary)'}
        >
            {children}
        </button>
    );
}