import { useState, useEffect } from 'react';
import {
    Search, ChevronDown
} from 'lucide-react';

export function safeJSON(str) {
    if (!str) return null;
    if (typeof str === 'object') return str;
    try { return JSON.parse(str); } catch { return null; }
}

export function Label({ children, hint }) {
    return (
        <div style={{ marginBottom: 6 }}>
            <span style={{ fontSize: 12, fontWeight: 500, color: 'var(--text-secondary)' }}>{children}</span>
            {hint && <span style={{ fontSize: 11, color: 'var(--text-tertiary)', marginLeft: 6 }}>{hint}</span>}
        </div>
    );
}

export function Input({ value, onChange, placeholder, type = 'text', style = {} }) {
    return (
        <input className="input" type={type} value={value} onChange={e => onChange(e.target.value)}
            placeholder={placeholder} style={{ width: '100%', boxSizing: 'border-box', ...style }} />
    );
}

export function Textarea({ value, onChange, placeholder, rows = 4 }) {
    return (
        <textarea className="input" value={value} onChange={e => onChange(e.target.value)}
            placeholder={placeholder} rows={rows}
            style={{ width: '100%', boxSizing: 'border-box', fontFamily: 'JetBrains Mono, monospace', fontSize: 11, resize: 'vertical' }} />
    );
}

export function EndpointPicker({ endpoints, value, onChange, placeholder = 'Select endpoint…' }) {
    const [search, setSearch] = useState('');
    const [open, setOpen] = useState(false);
    const ref = useState(() => ({ current: null }))[0];
    const selected = endpoints.find(e => e.id === value);
    const filtered = endpoints.filter(e =>
        `${e.method} ${e.path} ${e.summary || ''}`.toLowerCase().includes(search.toLowerCase())
    );

    // Close on outside click
    useEffect(() => {
        if (!open) return;
        function handleClick(e) {
            if (ref.current && !ref.current.contains(e.target)) setOpen(false);
        }
        document.addEventListener('mousedown', handleClick);
        return () => document.removeEventListener('mousedown', handleClick);
    }, [open]);

    return (
        <div style={{ position: 'relative' }} ref={el => ref.current = el}>
            <button onClick={() => setOpen(o => !o)} style={{
                width: '100%', padding: '8px 12px', borderRadius: 8, cursor: 'pointer', textAlign: 'left',
                background: 'var(--bg-input)', border: '1px solid var(--border)',
                color: selected ? 'var(--text-primary)' : 'var(--text-tertiary)',
                display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: 13
            }}>
                <span>
                    {selected
                        ? <><span className={`method-badge method-${selected.method}`} style={{ fontSize: 9, marginRight: 6 }}>{selected.method}</span>{selected.path}</>
                        : placeholder}
                </span>
                <ChevronDown size={14} color="var(--text-tertiary)" />
            </button>

            {open && (
                <div style={{
                    position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 200,
                    background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 8,
                    boxShadow: '0 8px 24px rgba(0,0,0,0.5)', marginTop: 4, maxHeight: 280, overflow: 'hidden',
                    display: 'flex', flexDirection: 'column'
                }}>
                    {/* Search — stopPropagation prevents dropdown closing */}
                    <div style={{ padding: '8px 10px', borderBottom: '1px solid var(--border)', flexShrink: 0 }}
                        onMouseDown={e => e.stopPropagation()}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'rgba(0,0,0,0.25)', borderRadius: 6, padding: '6px 10px' }}>
                            <Search size={12} color="var(--text-tertiary)" />
                            <input
                                autoFocus
                                value={search}
                                onChange={e => setSearch(e.target.value)}
                                placeholder="Search by method, path or name…"
                                onMouseDown={e => e.stopPropagation()}
                                onClick={e => e.stopPropagation()}
                                style={{ background: 'none', border: 'none', outline: 'none', fontSize: 12, color: 'var(--text-primary)', flex: 1 }}
                            />
                            {search && (
                                <button onClick={e => { e.stopPropagation(); setSearch(''); }}
                                    style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-tertiary)', padding: 0, lineHeight: 1 }}>
                                    ×
                                </button>
                            )}
                        </div>
                    </div>

                    <div style={{ overflow: 'auto', flex: 1 }}>
                        <div onClick={() => { onChange(null); setOpen(false); setSearch(''); }}
                            style={{ padding: '8px 12px', cursor: 'pointer', fontSize: 12, color: 'var(--text-tertiary)', borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                            — None / Skip this step
                        </div>
                        {endpoints.length === 0 ? (
                            <div style={{ padding: '20px 12px', fontSize: 12, color: 'var(--text-tertiary)', textAlign: 'center', lineHeight: 1.6 }}>
                                No endpoints imported yet.<br />
                                <span style={{ color: 'var(--accent)' }}>Import a Swagger spec first</span>
                            </div>
                        ) : filtered.length === 0 ? (
                            <div style={{ padding: '16px 12px', fontSize: 12, color: 'var(--text-tertiary)', textAlign: 'center', lineHeight: 1.6 }}>
                                No results for "<strong>{search}</strong>"<br />
                                <span style={{ fontSize: 11 }}>Try searching by method (GET, POST) or path keyword</span>
                            </div>
                        ) : filtered.map(ep => (
                            <div key={ep.id} onClick={() => { onChange(ep.id); setOpen(false); setSearch(''); }}
                                style={{
                                    padding: '8px 12px', cursor: 'pointer', fontSize: 12,
                                    display: 'flex', alignItems: 'center', gap: 8,
                                    background: value === ep.id ? 'var(--accent-dim)' : 'transparent',
                                    borderBottom: '1px solid rgba(255,255,255,0.03)'
                                }}
                                onMouseEnter={e => { if (value !== ep.id) e.currentTarget.style.background = 'rgba(255,255,255,0.03)'; }}
                                onMouseLeave={e => { if (value !== ep.id) e.currentTarget.style.background = ''; }}>
                                <span className={`method-badge method-${ep.method}`} style={{ fontSize: 9, flexShrink: 0 }}>{ep.method}</span>
                                <span style={{ color: value === ep.id ? 'var(--accent)' : 'var(--text-secondary)', flex: 1 }}>{ep.path}</span>
                                {ep.summary && <span style={{ fontSize: 10, color: 'var(--text-tertiary)', flexShrink: 0, maxWidth: 120, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{ep.summary}</span>}
                            </div>
                        ))}
                    </div>
                </div>
            )}
        </div>
    );
}