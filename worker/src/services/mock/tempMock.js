/**
 * services/mock/tempMock.js — mock servers made on the public Mock Playground
 * (hitapi.dev/mock-playground) without an account.
 *
 *   https://services.hitapi.dev/mock/t/<id>/<path>
 *
 * Stored in D1 (temp_mocks) for 7 days after the last save. Whoever creates one
 * gets an edit token; only a SHA-256 hash of it is stored. Visitors control the
 * whole response, so limits are strict and every response carries headers that
 * stop a browser from running it as a page (CSP sandbox + nosniff).
 */

import { sampleFromSchema } from './fakeData.js';

export const TEMP_PREFIX = 't';
export const TTL_MS = 7 * 86400000;

export const LIMITS = {
    routes: 25,
    pathLength: 300,
    bodyBytes: 64 * 1024,
    totalBytes: 256 * 1024,
    headers: 15,
    headerValue: 500,
    delayMs: 10000,
    createsPerHour: 30,
};

// HEAD is answered from the GET route and OPTIONS by CORS, so neither is set per route.
const METHODS = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'];

// Content types a playground mock may answer with. HTML is not allowed: a
// visitor-made page on our domain could be used for phishing.
const CONTENT_TYPES = [
    'application/json', 'text/plain', 'application/xml', 'text/xml', 'text/csv',
    'application/problem+json', 'application/hal+json', 'application/ld+json', 'application/x-ndjson',
];

// Headers a visitor may not set (security, CORS, framing, cookies, redirects, transport).
const BLOCKED_HEADER = /^(set-cookie|location|refresh|content-length|transfer-encoding|connection|keep-alive|upgrade|host|content-security-policy.*|x-content-type-options|x-frame-options|strict-transport-security|access-control-.*|cross-origin-.*|permissions-policy|service-worker-allowed|link|content-encoding|x-powered-by|x-mock-.*)$/i;

/** Headers added to every playground response, after the visitor's own. */
export const SAFETY_HEADERS = {
    'Content-Security-Policy': "default-src 'none'; sandbox",
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'DENY',
    'X-Robots-Tag': 'noindex',
};

const bytes = (s) => new TextEncoder().encode(s).length;

/**
 * Check and tidy the routes a visitor sent.
 * @returns {{ routes } | { error }}
 */
export function validateRoutes(input) {
    if (!Array.isArray(input) || input.length === 0) return { error: 'Add at least one route' };
    if (input.length > LIMITS.routes) return { error: `A playground mock can have up to ${LIMITS.routes} routes` };
    const routes = [];
    const seen = new Set();
    for (const [i, r] of input.entries()) {
        const n = `Route ${i + 1}`;
        const method = String(r?.method || 'GET').toUpperCase();
        if (!METHODS.includes(method)) return { error: `${n}: method must be one of ${METHODS.join(', ')}` };
        let path = String(r?.path || '').trim();
        if (!path.startsWith('/')) path = '/' + path;
        path = path.split('?')[0].replace(/\/{2,}/g, '/');
        if (path.length > LIMITS.pathLength) return { error: `${n}: path is too long` };
        if (/\s/.test(path)) return { error: `${n}: the path cannot contain spaces` };
        const key = `${method} ${path}`;
        if (seen.has(key)) return { error: `${n}: ${key} is defined twice` };
        seen.add(key);
        const status = Number(r?.status ?? 200);
        if (!Number.isInteger(status) || status < 200 || status > 599) return { error: `${n}: status must be 200–599` };
        if (status >= 300 && status < 400) return { error: `${n}: redirects (3xx) are not available in the playground` };
        const delay = Number(r?.delay_ms || 0);
        if (!Number.isFinite(delay) || delay < 0 || delay > LIMITS.delayMs) return { error: `${n}: delay must be 0–${LIMITS.delayMs} ms` };

        const headers = {};
        const rawHeaders = r?.headers && typeof r.headers === 'object' ? r.headers : {};
        const list = Array.isArray(rawHeaders) ? rawHeaders.map(h => [h?.name, h?.value]) : Object.entries(rawHeaders);
        for (const [name, value] of list) {
            const k = String(name || '').trim();
            if (!k) continue;
            if (!/^[A-Za-z0-9-]{1,64}$/.test(k)) return { error: `${n}: "${k}" is not a valid header name` };
            if (BLOCKED_HEADER.test(k)) return { error: `${n}: the ${k} header can't be set in the playground` };
            const v = String(value ?? '');
            if (v.length > LIMITS.headerValue || /[\r\n]/.test(v)) return { error: `${n}: the ${k} header value is too long or has line breaks` };
            headers[k] = v;
        }
        if (Object.keys(headers).length > LIMITS.headers) return { error: `${n}: up to ${LIMITS.headers} headers` };
        const ctKey = Object.keys(headers).find(h => h.toLowerCase() === 'content-type');
        if (ctKey) {
            const ct = headers[ctKey].split(';')[0].trim().toLowerCase();
            if (!CONTENT_TYPES.includes(ct)) return { error: `${n}: Content-Type must be one of ${CONTENT_TYPES.join(', ')}` };
        }

        const body = r?.body === null || r?.body === undefined ? '' : (typeof r.body === 'string' ? r.body : JSON.stringify(r.body, null, 2));
        if (bytes(body) > LIMITS.bodyBytes) return { error: `${n}: the response body is over ${LIMITS.bodyBytes / 1024} KB` };
        routes.push({ method, path, status, headers, delay_ms: Math.round(delay), body });
    }
    const json = JSON.stringify(routes);
    if (bytes(json) > LIMITS.totalBytes) return { error: `The whole mock is over ${LIMITS.totalBytes / 1024} KB` };
    return { routes, json };
}

function randomId(len) {
    const alphabet = 'abcdefghijkmnopqrstuvwxyz23456789';
    const b = crypto.getRandomValues(new Uint8Array(len));
    return Array.from(b, x => alphabet[x % alphabet.length]).join('');
}

async function sha256(text) {
    const d = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
    return Array.from(new Uint8Array(d), x => x.toString(16).padStart(2, '0')).join('');
}

/** Constant-time string compare (hex hashes of equal length). */
function same(a, b) {
    if (typeof a !== 'string' || typeof b !== 'string' || a.length !== b.length) return false;
    let diff = 0;
    for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
    return diff === 0;
}

/** Create a playground mock. @returns {{ id, token, expires_at } | { error, status }} */
export async function createTempMock(env, routesJson, ip) {
    const now = Date.now();
    if (Math.random() < 0.05) {
        await env.DB.prepare('DELETE FROM temp_mocks WHERE expires_at < ?').bind(now).run().catch(() => { });
    }
    if (ip) {
        const row = await env.DB.prepare('SELECT COUNT(*) AS n FROM temp_mocks WHERE ip = ? AND created_at > ?')
            .bind(ip, now - 3600000).first();
        if ((row?.n || 0) >= LIMITS.createsPerHour) {
            return { error: 'Too many mocks created from your network in the last hour. Try again later, or sign up to create mock servers without this limit.', status: 429 };
        }
    }
    const id = randomId(10);
    const token = randomId(32);
    await env.DB.prepare(
        `INSERT INTO temp_mocks (id, token_hash, routes, ip, created_at, updated_at, expires_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`
    ).bind(id, await sha256(token), routesJson, ip || null, now, now, now + TTL_MS).run();
    return { id, token, expires_at: now + TTL_MS };
}

/** Replace a playground mock's routes (needs its edit token). Each save keeps it 7 more days. */
export async function updateTempMock(env, id, token, routesJson) {
    const row = await env.DB.prepare('SELECT token_hash, expires_at FROM temp_mocks WHERE id = ?').bind(id).first();
    if (!row || row.expires_at < Date.now()) return { error: 'This playground mock has expired. Save again to get a new URL.', status: 404 };
    if (!same(row.token_hash, await sha256(String(token || '')))) return { error: 'You can only edit mocks made in this browser', status: 403 };
    const now = Date.now();
    await env.DB.prepare('UPDATE temp_mocks SET routes = ?, updated_at = ?, expires_at = ? WHERE id = ?')
        .bind(routesJson, now, now + TTL_MS, id).run();
    return { id, expires_at: now + TTL_MS };
}

/** Routes of a live playground mock, shaped like mock_responses rows, or null. */
export async function loadTempRoutes(env, id) {
    if (!id || !/^[a-z0-9]{6,20}$/.test(id)) return null;
    const row = await env.DB.prepare('SELECT routes, expires_at FROM temp_mocks WHERE id = ?').bind(id).first();
    if (!row || row.expires_at < Date.now()) return null;
    let list = [];
    try { list = JSON.parse(row.routes); } catch { return null; }
    return list.map((r, i) => ({
        id: `${id}-${i}`, method: r.method, path: r.path, status: r.status,
        body: r.body, headers: JSON.stringify(r.headers || {}), delay_ms: r.delay_ms || 0,
        source: 'playground', raw: true,
    }));
}

/** Fill {{params.x}} and {{query.x}} in a text body. */
export function fillTemplates(text, params, query) {
    return String(text).replace(/\{\{\s*(params|query)\.([\w-]+)\s*\}\}/g, (_, kind, key) => {
        const v = kind === 'params' ? params[key] : query.get(key);
        return v === undefined || v === null ? '' : String(v);
    });
}

// ── Generate data from a JSON Schema or a sample ────────────────────────────

const looksLikeSchema = (v) => v && typeof v === 'object' && !Array.isArray(v) &&
    (typeof v.type === 'string' || Array.isArray(v.type) || v.$schema || v.oneOf || v.anyOf || v.allOf ||
        (v.properties && typeof v.properties === 'object' && Object.values(v.properties).every(p => p && typeof p === 'object')));

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const ISO_DATETIME = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** A JSON Schema that describes a sample value (so new data can be made in its shape). */
export function inferSchema(value, depth = 0) {
    if (depth > 10) return {};
    if (value === null) return { type: 'string' };
    if (Array.isArray(value)) {
        const n = Math.min(Math.max(value.length, 1), 10);
        return { type: 'array', minItems: n, maxItems: n, items: value.length ? inferSchema(value[0], depth + 1) : { type: 'string' } };
    }
    switch (typeof value) {
        case 'object': {
            const properties = {};
            for (const [k, v] of Object.entries(value)) properties[k] = inferSchema(v, depth + 1);
            return { type: 'object', properties };
        }
        case 'number': return { type: Number.isInteger(value) ? 'integer' : 'number' };
        case 'boolean': return { type: 'boolean' };
        default: {
            const s = String(value);
            if (/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(s)) return { type: 'string', format: 'email' };
            if (ISO_DATETIME.test(s)) return { type: 'string', format: 'date-time' };
            if (ISO_DATE.test(s)) return { type: 'string', format: 'date' };
            if (UUID.test(s)) return { type: 'string', format: 'uuid' };
            if (/^https?:\/\//.test(s)) return { type: 'string', format: 'uri' };
            return { type: 'string' };
        }
    }
}

/**
 * New realistic data from a JSON Schema, or from a sample JSON value.
 * @param {*} input  schema or sample (object/array), or JSON text of either
 * @param {number} seed  change it to get different values
 */
export function generateData(input, seed = 0) {
    let value = input;
    if (typeof value === 'string') {
        try { value = JSON.parse(value); } catch { throw new Error('That is not valid JSON'); }
    }
    if (value === null || typeof value !== 'object') throw new Error('Paste a JSON Schema, or a sample JSON object or array');
    const schema = looksLikeSchema(value) ? value : inferSchema(value);
    return { data: sampleFromSchema(schema, '', `playground:${seed}`), from: looksLikeSchema(value) ? 'schema' : 'sample' };
}
