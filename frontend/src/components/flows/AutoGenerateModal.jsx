/**
 * Add this component to FlowSuitesPage.jsx (or a new file, imported in)
 * Replaces the window.prompt() approach for Auto-generate auth options
 */
import React, { useState } from 'react';
import { Zap } from 'lucide-react';

export function AutoGenerateModal({ onConfirm, onClose, generating }) {
    const [authType, setAuthType] = useState('flow');
    const [staticToken, setStaticToken] = useState('');
    const [error, setError] = useState('');

    function handleConfirm() {
        if (authType === 'static' && !staticToken.trim()) {
            setError('Enter a static token, or pick a different auth method');
            return;
        }
        onConfirm({ auth_type: authType, static_token: authType === 'static' ? staticToken : null });
    }

    return (
        <div style={{
            position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)',
            display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000,
        }} onClick={onClose}>
            <div onClick={e => e.stopPropagation()} style={{
                width: 440, maxWidth: '90vw', background: 'var(--bg-card)',
                border: '1px solid var(--border)', borderRadius: 12,
                overflow: 'hidden', boxShadow: '0 20px 60px rgba(0,0,0,0.4)',
            }}>
                {/* Header */}
                <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 10 }}>
                    <Zap size={16} color="var(--accent)" />
                    <div style={{ fontSize: 14, fontWeight: 600 }}>Auto-generate suite</div>
                </div>

                {/* Body */}
                <div style={{ padding: '18px 20px' }}>
                    <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 16, lineHeight: 1.6 }}>
                        Choose how HitAPI should authenticate when running this suite.
                    </div>

                    {[
                        { key: 'flow', icon: '🔐', label: 'Auto login flow', hint: 'HitAPI runs signup → login → extracts the token automatically' },
                        { key: 'static', icon: '🔑', label: 'Static API token', hint: 'Provide a fixed token — no login step needed' },
                        { key: 'none', icon: '🌐', label: 'No authentication', hint: 'API is public — no Authorization header needed' },
                    ].map(opt => (
                        <div
                            key={opt.key}
                            onClick={() => { setAuthType(opt.key); setError(''); }}
                            style={{
                                padding: '11px 13px', borderRadius: 8, marginBottom: 8, cursor: 'pointer',
                                border: `1px solid ${authType === opt.key ? 'rgba(130,100,255,0.5)' : 'var(--border)'}`,
                                background: authType === opt.key ? 'rgba(130,100,255,0.08)' : 'transparent',
                                transition: 'all .12s',
                            }}
                        >
                            <div style={{ fontSize: 13, fontWeight: 600, color: authType === opt.key ? 'var(--accent)' : 'var(--text-primary)' }}>
                                {opt.icon} {opt.label}
                            </div>
                            <div style={{ fontSize: 11, color: 'var(--text-tertiary)', marginTop: 3 }}>
                                {opt.hint}
                            </div>
                        </div>
                    ))}

                    {authType === 'static' && (
                        <div style={{ marginTop: 10 }}>
                            <input
                                type="password"
                                value={staticToken}
                                onChange={e => { setStaticToken(e.target.value); setError(''); }}
                                placeholder="Paste API token / Bearer token…"
                                autoFocus
                                style={{
                                    width: '100%', padding: '9px 11px', borderRadius: 7,
                                    background: 'var(--bg-input, rgba(255,255,255,0.03))', border: '1px solid var(--border)',
                                    color: 'var(--text-primary)', fontSize: 12,
                                    fontFamily: 'JetBrains Mono, monospace',
                                }}
                            />
                            <div style={{ fontSize: 10, color: 'var(--text-tertiary)', marginTop: 5 }}>
                                Sent as <code>Authorization: Bearer &lt;token&gt;</code> on every step
                            </div>
                        </div>
                    )}

                    {error && (
                        <div style={{ marginTop: 10, padding: '8px 10px', background: 'var(--red-bg)', borderRadius: 6, fontSize: 11, color: 'var(--red)' }}>
                            {error}
                        </div>
                    )}
                </div>

                {/* Footer */}
                <div style={{ padding: '12px 20px', borderTop: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between' }}>
                    <button onClick={onClose}
                        style={{ padding: '7px 14px', borderRadius: 7, cursor: 'pointer', background: 'rgba(255,255,255,0.05)', color: 'var(--text-secondary)', border: '1px solid var(--border)', fontSize: 13 }}>
                        Cancel
                    </button>
                    <button onClick={handleConfirm} disabled={generating}
                        style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '7px 16px', borderRadius: 7, cursor: generating ? 'not-allowed' : 'pointer', background: 'var(--accent)', color: '#fff', border: 'none', fontSize: 13, fontWeight: 500, opacity: generating ? 0.7 : 1 }}>
                        {generating ? <><div className="spinner" style={{ width: 12, height: 12 }} /> Generating…</> : <><Zap size={13} /> Generate</>}
                    </button>
                </div>
            </div>
        </div>
    );
}