/**
 * StepAuthConfig — Wizard Step 6
 * Single Responsibility: display detected auth status per endpoint
 * and allow user to override.
 *
 * Receives: annotated endpoints from useAuthDetector
 * Emits: nothing — state managed in hook
 */

import { Lock, Globe, ToggleLeft, ToggleRight, Info } from 'lucide-react';

const METHOD_COLORS = {
    GET: 'var(--green)',
    POST: 'var(--blue)',
    PUT: 'var(--amber)',
    PATCH: 'var(--amber)',
    DELETE: 'var(--red)',
};

export function StepAuthConfig({ annotated, toggleAuth, authCount, publicCount }) {
    if (!annotated.length) {
        return (
            <div style={{ fontSize: 12, color: 'var(--text-tertiary)', textAlign: 'center', padding: 24 }}>
                No endpoints found. Import a Swagger spec first.
            </div>
        );
    }

    return (
        <div>
            {/* Info banner */}
            <div style={{ padding: '10px 14px', background: 'var(--accent-dim)', border: '1px solid rgba(130,100,255,0.2)', borderRadius: 8, marginBottom: 16, fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.6 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                    <Info size={13} color="var(--accent)" />
                    <strong style={{ color: 'var(--accent)' }}>Auto-detected from Swagger security field</strong>
                </div>
                Endpoints marked <span style={{ color: 'var(--red)', fontWeight: 600 }}>🔐 Auth</span> have{' '}
                <code style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 11 }}>security: [bearerAuth]</code> set.
                Toggle any endpoint to override. Auth endpoints will use <code style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 11 }}>{'{{token}}'}</code> from login.
            </div>

            {/* Summary */}
            <div style={{ display: 'flex', gap: 12, marginBottom: 14 }}>
                <div style={{ padding: '6px 12px', borderRadius: 6, background: 'rgba(255,92,92,0.08)', border: '1px solid rgba(255,92,92,0.2)', fontSize: 12, color: 'var(--red)', fontWeight: 500 }}>
                    🔐 {authCount} require auth
                </div>
                <div style={{ padding: '6px 12px', borderRadius: 6, background: 'rgba(35,209,139,0.08)', border: '1px solid rgba(35,209,139,0.2)', fontSize: 12, color: 'var(--green)', fontWeight: 500 }}>
                    🌐 {publicCount} public
                </div>
            </div>

            {/* Endpoint list */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4, maxHeight: 360, overflow: 'auto' }}>
                {annotated.map(ep => (
                    <div key={ep.id} style={{
                        display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px',
                        borderRadius: 7, background: 'rgba(255,255,255,0.02)',
                        border: `1px solid ${ep.requiresAuth ? 'rgba(255,92,92,0.15)' : 'rgba(35,209,139,0.1)'}`,
                    }}>
                        {/* Method badge */}
                        <span className={`method-badge method-${ep.method}`} style={{ fontSize: 9, flexShrink: 0 }}>
                            {ep.method}
                        </span>

                        {/* Path */}
                        <span style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 11, color: 'var(--text-secondary)', flex: 1 }}>
                            {ep.path}
                        </span>

                        {/* Summary */}
                        {ep.summary && (
                            <span style={{ fontSize: 10, color: 'var(--text-tertiary)', maxWidth: 160, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                {ep.summary}
                            </span>
                        )}

                        {/* Override indicator */}
                        {ep.authOverridden && (
                            <span style={{ fontSize: 9, padding: '1px 5px', borderRadius: 3, background: 'var(--amber-bg)', color: 'var(--amber)', border: '1px solid rgba(255,181,71,0.3)' }}>
                                overridden
                            </span>
                        )}

                        {/* Auth toggle */}
                        <button onClick={() => toggleAuth(ep.id)} style={{
                            display: 'flex', alignItems: 'center', gap: 5, padding: '3px 8px',
                            borderRadius: 5, cursor: 'pointer', fontSize: 11, fontWeight: 500, flexShrink: 0,
                            background: ep.requiresAuth ? 'rgba(255,92,92,0.1)' : 'rgba(35,209,139,0.08)',
                            color: ep.requiresAuth ? 'var(--red)' : 'var(--green)',
                            border: `1px solid ${ep.requiresAuth ? 'rgba(255,92,92,0.25)' : 'rgba(35,209,139,0.2)'}`,
                            transition: 'all 0.15s'
                        }}>
                            {ep.requiresAuth
                                ? <><Lock size={10} /> Auth</>
                                : <><Globe size={10} /> Public</>}
                        </button>
                    </div>
                ))}
            </div>
        </div>
    );
}