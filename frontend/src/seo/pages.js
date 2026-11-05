/**
 * SEO for public pages — one place for titles, descriptions, canonical URLs
 * and structured data. Used by:
 *   - scripts/prerender.mjs  (writes real HTML for each page at build time)
 *   - seo/RouteMeta.jsx      (keeps <head> right while users navigate)
 * To add a public page: add it here, then add its component in entry-server.jsx.
 */

export const SITE = {
    url: 'https://hitapi.dev',
    name: 'HitAPI',
    image: 'https://hitapi.dev/og-image.png',
    logo: 'https://hitapi.dev/icon-512.png',
    email: 'support@hitapi.dev',
};

export const PAGES = {
    '/': {
        title: 'HitAPI: AI API Testing and Free Online API Tester',
        description: 'Import a Swagger/OpenAPI spec and HitAPI writes API tests with AI, runs them on your live API and explains what broke. Plus a free online API tester.',
        priority: '1.0',
        changefreq: 'weekly',
    },
    '/playground': {
        title: 'Free Online API Tester: Send HTTP Requests & Run cURL | HitAPI',
        description: 'Test any REST API in your browser: send GET, POST, PUT and DELETE requests with headers, auth and JSON, or paste a cURL command. Free, no sign-up.',
        priority: '0.9',
        changefreq: 'weekly',
    },
    '/how-it-works': {
        title: 'How HitAPI Works: AI-Generated API Tests from Swagger | HitAPI',
        description: 'See how HitAPI turns a Swagger/OpenAPI spec into AI-generated test cases, runs them against your live API, and reports bugs with the root cause and a suggested fix.',
        priority: '0.8',
        changefreq: 'monthly',
    },
    '/support': {
        title: 'Help & Support | HitAPI',
        description: 'Answers to common questions about HitAPI: getting started, the Chrome extension, AI test generation and the API Playground. Plus how to contact support.',
        priority: '0.5',
        changefreq: 'monthly',
    },
    '/privacy': {
        title: 'Privacy Policy | HitAPI',
        description: 'How HitAPI collects, uses and protects your data, which service providers we use, and how to exercise your privacy rights.',
        priority: '0.3',
        changefreq: 'yearly',
    },
    '/terms': {
        title: 'Terms & Conditions | HitAPI',
        description: 'The terms for using HitAPI, including authorised-testing-only rules, acceptable use and liability.',
        priority: '0.3',
        changefreq: 'yearly',
    },
};

// App pages behind login: keep them out of Google
const NOINDEX_PREFIXES = ['/projects', '/admin', '/login'];

function normalise(pathname) {
    const p = (pathname || '/').replace(/\/+$/, '');
    return p === '' ? '/' : p;
}

/** Title, description, canonical and robots for any path. */
export function metaFor(pathname) {
    const path = normalise(pathname);
    const page = PAGES[path];
    if (page) {
        return { ...page, path, canonical: SITE.url + (path === '/' ? '/' : path), robots: 'index, follow' };
    }
    const noindex = NOINDEX_PREFIXES.some(p => path === p || path.startsWith(p + '/'));
    return {
        title: 'HitAPI — AI API Testing',
        description: PAGES['/'].description,
        path,
        canonical: SITE.url + path,
        robots: noindex ? 'noindex, nofollow' : 'index, follow',
    };
}

// Product demo video (public/media) — lets Google show it in video results
const DEMO_VIDEO = {
  '@type': 'VideoObject',
  '@id': `${SITE.url}/#demo-video`,
  name: 'HitAPI product demo: AI API testing in about a minute',
  description: 'See HitAPI import a Swagger/OpenAPI spec, write API tests with AI, run them against a live API, explain bugs with a root cause and fix, run multi-step flows, and test any API for free in the API Playground.',
  thumbnailUrl: `${SITE.url}/media/hitapi-demo-poster.jpg`,
  contentUrl: `${SITE.url}/media/hitapi-demo.mp4`,
  uploadDate: '2026-11-05',
  duration: 'PT1M11S',
};

/** schema.org structured data (JSON-LD) for a public page, or null. */
export function jsonLdFor(path) {
    const org = {
        '@type': 'Organization',
        '@id': `${SITE.url}/#organization`,
        name: SITE.name,
        url: `${SITE.url}/`,
        logo: SITE.logo,
        email: SITE.email,
    };
    if (path === '/') {
        return {
            '@context': 'https://schema.org',
            '@graph': [
                org,
                {
                    '@type': 'WebSite',
                    '@id': `${SITE.url}/#website`,
                    name: SITE.name,
                    url: `${SITE.url}/`,
                    publisher: { '@id': `${SITE.url}/#organization` },
                },
                {
                    '@type': 'SoftwareApplication',
                    name: SITE.name,
                    url: `${SITE.url}/`,
                    applicationCategory: 'DeveloperApplication',
                    operatingSystem: 'Web',
                    description: PAGES['/'].description,
                    offers: { '@type': 'Offer', price: '0', priceCurrency: 'USD' },
                    publisher: { '@id': `${SITE.url}/#organization` },
                },
                { ...DEMO_VIDEO, publisher: { '@id': `${SITE.url}/#organization` } },
            ],
        };
    }
    if (path === '/how-it-works') {
        return { '@context': 'https://schema.org', ...DEMO_VIDEO, publisher: org };
    }
    if (path === '/playground') {
        return {
            '@context': 'https://schema.org',
            '@type': 'WebApplication',
            name: 'HitAPI API Playground',
            url: `${SITE.url}/playground`,
            applicationCategory: 'DeveloperApplication',
            operatingSystem: 'Web',
            browserRequirements: 'Requires JavaScript',
            isAccessibleForFree: true,
            description: PAGES['/playground'].description,
            offers: { '@type': 'Offer', price: '0', priceCurrency: 'USD' },
            publisher: org,
        };
    }
    return null;
}

const esc = (s) => String(s)
    .replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/** Full <head> SEO block (used at build time). */
export function buildHead(pathname) {
    const m = metaFor(pathname);
    const ld = jsonLdFor(m.path);
    return [
        `<title>${esc(m.title)}</title>`,
        `<meta name="description" content="${esc(m.description)}" />`,
        `<meta name="robots" content="${m.robots}" />`,
        `<link rel="canonical" href="${m.canonical}" />`,
        `<meta property="og:type" content="website" />`,
        `<meta property="og:site_name" content="${SITE.name}" />`,
        `<meta property="og:title" content="${esc(m.title)}" />`,
        `<meta property="og:description" content="${esc(m.description)}" />`,
        `<meta property="og:url" content="${m.canonical}" />`,
        `<meta property="og:image" content="${SITE.image}" />`,
        `<meta property="og:image:width" content="1200" />`,
        `<meta property="og:image:height" content="630" />`,
        `<meta property="og:image:alt" content="HitAPI — AI API testing and free online API tester" />`,
        `<meta name="twitter:card" content="summary_large_image" />`,
        `<meta name="twitter:title" content="${esc(m.title)}" />`,
        `<meta name="twitter:description" content="${esc(m.description)}" />`,
        `<meta name="twitter:image" content="${SITE.image}" />`,
        ld ? `<script type="application/ld+json">${JSON.stringify(ld).replace(/</g, '\\u003c')}</script>` : '',
    ].filter(Boolean).join('\n  ');
}
