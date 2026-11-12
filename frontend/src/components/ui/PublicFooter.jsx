import { useNavigate } from 'react-router-dom';
import { Zap, ExternalLink, Mail } from 'lucide-react';
import { LogoMark } from './Logo.jsx';
const CURRENT_YEAR = new Date().getFullYear();

export function PublicFooter() {
    const navigate = useNavigate();

    return (
        <footer className="pub-footer" style={{
            borderTop: '1px solid var(--border)',
            background: 'rgba(255,255,255,0.01)',
        }}>
            <style>{`
                .pub-footer { padding: 40px 40px 28px; }
                .pub-footer-grid { display: grid; grid-template-columns: 200px repeat(3, minmax(0, 1fr)); gap: 40px; margin-bottom: 36px; }
                @media (max-width: 760px) {
                    .pub-footer { padding: 32px 16px 24px; }
                    .pub-footer-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 28px 20px; }
                    .pub-footer-grid > :first-child { grid-column: 1 / -1; }
                }
            `}</style>
            <div style={{ maxWidth: 1100, margin: '0 auto' }}>

                {/* Top row — brand + columns */}
                <div className="pub-footer-grid">

                    {/* Brand */}
                    <div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
                            <LogoMark size={26} />
                            <span style={{ fontSize: 'var(--fs-lg)', fontWeight: 700 }}>HitAPI</span>
                        </div>
                        <p style={{ fontSize: 'var(--fs-base)', color: 'var(--text-tertiary)', lineHeight: 1.7, margin: 0 }}>
                            AI-powered API testing.<br />No setup. Free to start.
                        </p>
                    </div>

                    {/* Product */}
                    <div>
                        <div style={{ fontSize: 'var(--fs-sm)', fontWeight: 700, color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '.08em', marginBottom: 14 }}>Product</div>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                            <FooterLink onClick={() => navigate('/how-it-works')}>How it works</FooterLink>
                            <a href="/demo" style={{ fontSize: 'var(--fs-md)', color: 'var(--text-secondary)' }}>Product demo</a>
                            <a href="/mock-api-server" style={{ fontSize: 'var(--fs-md)', color: 'var(--text-secondary)' }}>Mock API server</a>
                            <a href="/mock-playground" style={{ fontSize: 'var(--fs-md)', color: 'var(--text-secondary)' }}>Mock API Playground</a>
                            <FooterLink onClick={() => window.open('https://chromewebstore.google.com/search/HitAPI', '_blank')}>
                                Chrome Extension <ExternalLink size={10} style={{ marginLeft: 3, verticalAlign: 'middle' }} />
                            </FooterLink>
                            <FooterLink onClick={() => navigate('/login')}>Sign in</FooterLink>
                            <FooterLink onClick={() => navigate('/login')}>Create account</FooterLink>
                        </div>
                    </div>

                    {/* Legal */}
                    <div>
                        <div style={{ fontSize: 'var(--fs-sm)', fontWeight: 700, color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '.08em', marginBottom: 14 }}>Legal</div>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                            <FooterLink onClick={() => navigate('/privacy')}>Privacy Policy</FooterLink>
                            <FooterLink onClick={() => navigate('/terms')}>Terms &amp; Conditions</FooterLink>
                        </div>
                    </div>

                    {/* Support */}
                    <div>
                        <div style={{ fontSize: 'var(--fs-sm)', fontWeight: 700, color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '.08em', marginBottom: 14 }}>Support</div>
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
                    <span style={{ fontSize: 'var(--fs-base)', color: 'var(--text-tertiary)' }}>
                        © {CURRENT_YEAR} Scriptimiz Insight LLP · Mumbai, India
                    </span>
                    <span style={{ fontSize: 'var(--fs-base)', color: 'var(--text-tertiary)' }}>
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
                fontSize: 'var(--fs-md)', color: 'var(--text-secondary)', textAlign: 'left',
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