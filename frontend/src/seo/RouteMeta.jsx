import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { metaFor } from './pages.js';

function setTag(selector, create, attr, value) {
    let el = document.head.querySelector(selector);
    if (!el) { el = create(); document.head.appendChild(el); }
    el.setAttribute(attr, value);
}
const meta = (key, isProperty) => () => {
    const el = document.createElement('meta');
    el.setAttribute(isProperty ? 'property' : 'name', key);
    return el;
};

/** Keeps title, description, canonical, robots and social tags in sync with the current route. */
export function RouteMeta() {
    const { pathname } = useLocation();
    useEffect(() => {
        const m = metaFor(pathname);
        document.title = m.title;
        setTag('meta[name="description"]', meta('description'), 'content', m.description);
        setTag('meta[name="robots"]', meta('robots'), 'content', m.robots);
        setTag('link[rel="canonical"]', () => { const l = document.createElement('link'); l.rel = 'canonical'; return l; }, 'href', m.canonical);
        setTag('meta[property="og:title"]', meta('og:title', true), 'content', m.title);
        setTag('meta[property="og:description"]', meta('og:description', true), 'content', m.description);
        setTag('meta[property="og:url"]', meta('og:url', true), 'content', m.canonical);
        setTag('meta[name="twitter:title"]', meta('twitter:title'), 'content', m.title);
        setTag('meta[name="twitter:description"]', meta('twitter:description'), 'content', m.description);
    }, [pathname]);
    return null;
}
