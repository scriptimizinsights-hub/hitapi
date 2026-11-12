/**
 * services/mock/serve.js — answers public requests to a project's mock server:
 *
 *   ANY https://services.hitapi.dev/mock/<slug>/<path from the spec>
 *
 * No login needed (frontend apps call it directly). CORS is open.
 *  - Path templates match: /users/{id} answers /users/42
 *  - Path params fill matching fields: GET /users/42 returns "id": 42
 *  - X-Mock-Status: 404 (or ?__status=404) forces an error response
 *  - The stored delay is applied (max 10 s)
 */

import { DatabaseAdapter } from '../../db/adapter.js';
import { DEMO_SLUG, demoRoutes, demoIndex } from './demo.js';

const CORS = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, PUT, PATCH, DELETE, HEAD, OPTIONS',
    'Access-Control-Allow-Headers': '*',
    'Access-Control-Expose-Headers': 'X-Mock-Source, X-Mock-Route',
    'Access-Control-Max-Age': '86400',
};
const MAX_DELAY_MS = 10000;

const STATUS_TEXT = {
    400: 'Bad Request', 401: 'Unauthorized', 403: 'Forbidden', 404: 'Not Found', 405: 'Method Not Allowed',
    409: 'Conflict', 422: 'Unprocessable Entity', 429: 'Too Many Requests', 500: 'Internal Server Error',
    502: 'Bad Gateway', 503: 'Service Unavailable',
};

function reply(status, body, extra = {}) {
    const headers = { ...CORS, 'Cache-Control': 'no-store', 'X-Powered-By': 'HitAPI Mock', ...extra };
    if (body === null || status === 204 || status === 304) return new Response(null, { status, headers });
    headers['Content-Type'] = 'application/json; charset=utf-8';
    return new Response(JSON.stringify(body, null, 2), { status, headers });
}

/** Split a path into segments, ignoring empty ones. */
const segs = (p) => p.split('/').filter(Boolean);

/**
 * Match a request path against stored path templates.
 * @returns {{ route, params } | null}  the most specific match (most literal segments)
 */
export function matchPath(templates, requestPath) {
    const req = segs(requestPath);
    let best = null;
    for (const route of templates) {
        const tpl = segs(route.path);
        if (tpl.length !== req.length) continue;
        const params = {};
        let literal = 0;
        let ok = true;
        for (let i = 0; i < tpl.length; i++) {
            const m = tpl[i].match(/^\{([^}]+)\}$/);
            if (m) params[m[1]] = decodeURIComponent(req[i]);
            else if (tpl[i] === req[i]) literal++;
            else { ok = false; break; }
        }
        if (ok && (!best || literal > best.literal)) best = { route, params, literal };
    }
    return best ? { route: best.route, params: best.params } : null;
}

function coerce(value, like) {
    if (typeof like === 'number' && value !== '' && !Number.isNaN(Number(value))) return Number(value);
    return value;
}

/** Put path params into the body where a field has the same name (or `id`). */
export function applyParams(body, params, query) {
    if (!body || typeof body !== 'object') return body;
    let text = JSON.stringify(body);
    // Explicit templates in edited responses: "{{params.id}}", "{{query.page}}"
    text = text.replace(/\{\{\s*(params|query)\.([\w-]+)\s*\}\}/g, (_, kind, key) => {
        const v = kind === 'params' ? params[key] : query.get(key);
        return v === undefined || v === null ? '' : String(v).replace(/["\\]/g, '');
    });
    let out = JSON.parse(text);
    if (!Array.isArray(out)) {
        const names = Object.keys(params);
        for (const name of names) {
            if (name in out) out[name] = coerce(params[name], out[name]);
        }
        if (names.length === 1 && 'id' in out && !(names[0] in out) && /id$/i.test(names[0])) {
            out.id = coerce(params[names[0]], out.id);
        }
    }
    return out;
}

export async function handleMockRequest(request, env) {
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });

    const url = new URL(request.url);
    const [, , slug, ...rest] = url.pathname.split('/'); // '', 'mock', slug, ...
    const path = '/' + rest.join('/');
    const method = request.method === 'HEAD' ? 'GET' : request.method.toUpperCase();

    if (!slug) return reply(404, { error: 'Mock server not found' });

    let routes;
    if (slug === DEMO_SLUG) {
        // Public demo for hitapi.dev/mock-api-server: built from a bundled spec, no database
        if (path === '/' && method === 'GET') return reply(200, demoIndex(`${url.origin}/mock/${DEMO_SLUG}`));
        routes = demoRoutes();
    } else {
        const db = new DatabaseAdapter(env.DB);
        const mock = await db.first('SELECT id, enabled FROM mock_servers WHERE slug = ?', [slug]);
        if (!mock) return reply(404, { error: 'Mock server not found. Check the mock URL in HitAPI.' });
        if (!mock.enabled) return reply(503, { error: 'This mock server is turned off. Turn it on in HitAPI → Mock Server.' });
        routes = await db.all(
            'SELECT id, method, path, status, body, headers, delay_ms, source FROM mock_responses WHERE mock_id = ?',
            [mock.id]
        );
    }

    // The spec's server URL may carry a base path (e.g. /v1); also try without leading segments.
    let match = null;
    let tried = path;
    const parts = segs(path);
    for (let drop = 0; drop <= Math.min(2, parts.length - 1) && !match; drop++) {
        tried = '/' + parts.slice(drop).join('/');
        match = matchPath(routes.filter(r => r.method === method), tried);
    }

    if (!match) {
        const otherMethods = routes.filter(r => matchPath([r], path)).map(r => r.method);
        if (otherMethods.length) {
            return reply(405, { error: `${method} is not defined for ${path}`, allowed: [...new Set(otherMethods)] },
                { Allow: [...new Set(otherMethods)].join(', ') });
        }
        return reply(404, {
            error: `No mock for ${method} ${path}`,
            available: routes.slice(0, 50).map(r => `${r.method} ${r.path}`),
        });
    }

    const { route, params } = match;
    const delay = Math.min(Math.max(Number(route.delay_ms) || 0, 0), MAX_DELAY_MS);
    if (delay) await new Promise(r => setTimeout(r, delay));

    const forced = Number(request.headers.get('X-Mock-Status') || url.searchParams.get('__status'));
    const extra = { 'X-Mock-Source': route.source, 'X-Mock-Route': `${route.method} ${route.path}` };
    let storedHeaders = {};
    try { storedHeaders = route.headers ? JSON.parse(route.headers) : {}; } catch { /* ignore */ }

    if (forced >= 400 && forced <= 599) {
        return reply(forced, { error: STATUS_TEXT[forced] || 'Error', status: forced, mock: true }, extra);
    }
    if (request.method === 'HEAD') return reply(route.status, null, { ...storedHeaders, ...extra });

    let body = null;
    try { body = route.body === null || route.body === undefined || route.body === '' ? null : JSON.parse(route.body); } catch { body = route.body; }
    body = applyParams(body, params, url.searchParams);
    return reply(route.status, body, { ...storedHeaders, ...extra });
}
