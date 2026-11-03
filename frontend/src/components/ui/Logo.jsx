import { useId } from 'react';

/**
 * HitAPI logo mark — purple→blue gradient tile with a white lightning bolt.
 * Same artwork as /icon.svg (the browser-tab icon), so the brand looks
 * identical everywhere.
 *
 *   <LogoMark />                 28px (nav bars)
 *   <LogoMark size={48} />       large (login page)
 *   <Logo />                     mark + "HitAPI" wordmark
 */
export function LogoMark({ size = 28, style, title = 'HitAPI' }) {
    const gid = `hitapi-g-${useId().replace(/:/g, '')}`;
    return (
        <svg
            width={size}
            height={size}
            viewBox="0 0 32 32"
            role="img"
            aria-label={title}
            style={{ display: 'block', flexShrink: 0, ...style }}
        >
            <defs>
                <linearGradient id={gid} x1="0" y1="0" x2="1" y2="1">
                    <stop offset="0" stopColor="#8264ff" />
                    <stop offset="1" stopColor="#5ca8ff" />
                </linearGradient>
            </defs>
            <rect width="32" height="32" rx="9" fill={`url(#${gid})`} />
            <path d="M17.6 4.8 8.2 18.2h6.9l-1.6 9 9.4-13.4h-6.9l1.6-9z" fill="#fff" />
        </svg>
    );
}

export function Logo({ size = 28, fontSize = 15, style }) {
    return (
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8, ...style }}>
            <LogoMark size={size} />
            <span style={{ fontSize, fontWeight: 700, letterSpacing: '-0.01em', color: 'var(--text-primary)' }}>HitAPI</span>
        </span>
    );
}