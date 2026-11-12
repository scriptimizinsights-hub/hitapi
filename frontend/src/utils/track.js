/**
 * utils/track.js — tells HitAPI about each page view (Super Admin → Traffic).
 *
 * Runs on every route change, including in-app navigation that never reaches
 * the server. Signed-in visitors send their token so the view is linked to
 * them. Fire-and-forget: a failure is ignored and never affects the page.
 */
import { getToken } from '../store/index.js';

const BASE = import.meta.env.VITE_API_URL ?? 'https://services.hitapi.dev/api';
let last = { path: null, at: 0 };

export function trackPageView(path) {
    if (typeof window === 'undefined' || !path) return;
    const now = Date.now();
    if (last.path === path && now - last.at < 2000) return; // same view reported twice (e.g. React dev double effects)
    last = { path, at: now };

    const token = getToken();
    const referrer = document.referrer && !document.referrer.startsWith(window.location.origin) ? document.referrer : null;
    try {
        fetch(`${BASE}/public/track`, {
            method: 'POST',
            keepalive: true,
            headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
            body: JSON.stringify({ path, referrer }),
        }).catch(() => { });
    } catch { /* never break the page */ }
}
