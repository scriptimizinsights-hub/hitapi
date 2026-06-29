import { useState } from 'react';
import { useStore } from '../../store/index.js';
import { CURRENT_TERMS_VERSION } from '../ui/TermsGate.jsx';

export function LoginPage({ onAuth }) {
    const { login, signup } = useStore();
    const [mode, setMode] = useState('login'); // 'login' | 'signup'
    const [name, setName] = useState('');
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [termsChecked, setTermsChecked] = useState(false);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');

    async function handleSubmit(e) {
        e.preventDefault();
        setError('');
        if (mode === 'signup' && !termsChecked) {
            setError('You must accept the Terms & Conditions to create an account');
            return;
        }
        setLoading(true);
        try {
            if (mode === 'login') {
                await login(email, password);
            } else {
                if (!name.trim()) { setError('Name is required'); setLoading(false); return; }
                if (password.length < 8) { setError('Password must be at least 8 characters'); setLoading(false); return; }
                await signup(name, email, password, CURRENT_TERMS_VERSION);
            }
            onAuth?.();
        } catch (err) {
            setError(err.message || 'Something went wrong');
        } finally {
            setLoading(false);
        }
    }

    return (
        <div style={{
            minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center',
            background: 'var(--bg)', padding: 20,
        }}>
            <div style={{ width: '100%', maxWidth: 400 }}>

                {/* Logo */}
                <div style={{ textAlign: 'center', marginBottom: 32 }}>
                    <div style={{ width: 48, height: 48, borderRadius: 14, background: 'var(--accent)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', marginBottom: 12 }}>
                        <span style={{ fontSize: 22 }}>⚡</span>
                    </div>
                    <h1 style={{ fontSize: 22, fontWeight: 700, margin: 0 }}>HitAPI</h1>
                    <p style={{ color: 'var(--text-tertiary)', fontSize: 13, margin: '4px 0 0' }}>AI-powered API Testing</p>
                </div>

                {/* Card */}
                <div className="card" style={{ padding: 28 }}>
                    {/* Tab switcher */}
                    <div style={{ display: 'flex', background: 'rgba(255,255,255,0.04)', borderRadius: 8, padding: 3, marginBottom: 24 }}>
                        {['login', 'signup'].map(m => (
                            <button key={m} onClick={() => { setMode(m); setError(''); }} style={{
                                flex: 1, padding: '7px', borderRadius: 6, fontSize: 13, fontWeight: 600, cursor: 'pointer',
                                background: mode === m ? 'var(--bg-card)' : 'transparent',
                                color: mode === m ? 'var(--text-primary)' : 'var(--text-tertiary)',
                                border: mode === m ? '1px solid var(--border)' : '1px solid transparent',
                                transition: 'all .15s',
                            }}>
                                {m === 'login' ? 'Sign in' : 'Create account'}
                            </button>
                        ))}
                    </div>

                    <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                        {mode === 'signup' && (
                            <div>
                                <label style={{ fontSize: 12, color: 'var(--text-secondary)', display: 'block', marginBottom: 5 }}>Name</label>
                                <input className="input" placeholder="Your name" value={name}
                                    onChange={e => setName(e.target.value)} required autoFocus={mode === 'signup'} />
                            </div>
                        )}

                        <div>
                            <label style={{ fontSize: 12, color: 'var(--text-secondary)', display: 'block', marginBottom: 5 }}>Email</label>
                            <input className="input" type="email" placeholder="you@company.com" value={email}
                                onChange={e => setEmail(e.target.value)} required autoFocus={mode === 'login'} />
                        </div>

                        <div>
                            <label style={{ fontSize: 12, color: 'var(--text-secondary)', display: 'block', marginBottom: 5 }}>Password</label>
                            <input className="input" type="password" placeholder={mode === 'signup' ? 'Min 8 characters' : '••••••••'}
                                value={password} onChange={e => setPassword(e.target.value)} required />
                        </div>

                        {error && (
                            <div style={{ padding: '8px 12px', background: 'var(--red-bg)', borderRadius: 7, fontSize: 12, color: 'var(--red)', border: '1px solid var(--red-border)' }}>
                                ✗ {error}
                            </div>
                        )}


                        {mode === 'signup' && (
                            <label style={{ display: 'flex', alignItems: 'flex-start', gap: 8, cursor: 'pointer' }}>
                                <input type="checkbox" checked={termsChecked} onChange={e => setTermsChecked(e.target.checked)}
                                    style={{ width: 15, height: 15, marginTop: 2, accentColor: 'var(--accent)', flexShrink: 0, cursor: 'pointer' }} />
                                <span style={{ fontSize: 11, color: 'var(--text-secondary)', lineHeight: 1.6 }}>
                                    I agree to the{' '}
                                    <a href="/terms" target="_blank" rel="noopener noreferrer" style={{ color: 'var(--accent)' }}>Terms & Conditions</a>
                                    {' '}and{' '}
                                    <a href="/privacy" target="_blank" rel="noopener noreferrer" style={{ color: 'var(--accent)' }}>Privacy Policy</a>
                                </span>
                            </label>
                        )}

                        <button type="submit" className="btn btn-primary" disabled={loading} style={{ marginTop: 4, padding: '10px', fontSize: 14 }}>
                            {loading
                                ? <><div className="spinner" style={{ width: 14, height: 14 }} /> {mode === 'login' ? 'Signing in…' : 'Creating account…'}</>
                                : mode === 'login' ? 'Sign in' : 'Create account'
                            }
                        </button>
                    </form>
                </div>

                <p style={{ textAlign: 'center', fontSize: 12, color: 'var(--text-tertiary)', marginTop: 16 }}>
                    {mode === 'login' ? "Don't have an account? " : 'Already have an account? '}
                    <button onClick={() => { setMode(mode === 'login' ? 'signup' : 'login'); setError(''); }}
                        style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--accent)', fontSize: 12, padding: 0 }}>
                        {mode === 'login' ? 'Create one' : 'Sign in'}
                    </button>
                </p>
            </div>
        </div>
    );
}