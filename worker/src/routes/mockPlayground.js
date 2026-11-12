/**
 * routes/mockPlayground.js — public API behind hitapi.dev/mock-playground (no login).
 *
 *   POST /api/public/mocks                 { routes }          → { id, url, token, expires_at }
 *   PUT  /api/public/mocks/:id             { token, routes }   → { id, url, expires_at }
 *   POST /api/public/mock-tools/generate   { input, seed? }    → { data, from }
 *   POST /api/public/mock-tools/import     { url } | { spec }  → { routes, total, title }
 *
 * The mocks themselves are served by services/mock/serve.js at /mock/t/<id>/...
 */

import { json, error, success } from '../middleware/cors.js';
import { validateRoutes, createTempMock, updateTempMock, generateData, LIMITS, TEMP_PREFIX } from '../services/mock/tempMock.js';
import { mockFromEndpoint } from '../services/mock/specSamples.js';
import { extractEndpoints } from '../services/swagger';

const MAX_SPEC_BYTES = 3 * 1024 * 1024;

async function readJson(request, max = 400 * 1024) {
    const text = await request.text();
    if (text.length > max) throw new Error('Request is too large');
    return text ? JSON.parse(text) : {};
}

function mockUrl(request, id) {
    return `${new URL(request.url).origin}/mock/${TEMP_PREFIX}/${id}`;
}

export async function createPlaygroundMock(request, env) {
    let body;
    try { body = await readJson(request); } catch (e) { return error(e.message || 'Invalid JSON', 400, env); }
    const v = validateRoutes(body.routes);
    if (v.error) return error(v.error, 400, env);
    const ip = request.headers.get('cf-connecting-ip') || null;
    const r = await createTempMock(env, v.json, ip);
    if (r.error) return error(r.error, r.status, env);
    return json(success({ id: r.id, url: mockUrl(request, r.id), token: r.token, expires_at: r.expires_at, routes: v.routes }), 201, env);
}

export async function updatePlaygroundMock(request, env, { params }) {
    let body;
    try { body = await readJson(request); } catch (e) { return error(e.message || 'Invalid JSON', 400, env); }
    const v = validateRoutes(body.routes);
    if (v.error) return error(v.error, 400, env);
    const r = await updateTempMock(env, params.id, body.token, v.json);
    if (r.error) return error(r.error, r.status, env);
    return json(success({ id: r.id, url: mockUrl(request, r.id), expires_at: r.expires_at, routes: v.routes }), 200, env);
}

export async function generateMockData(request, env) {
    let body;
    try { body = await readJson(request, 200 * 1024); } catch (e) { return error(e.message || 'Invalid JSON', 400, env); }
    try {
        const out = generateData(body.input, Number(body.seed) || 0);
        return json(success(out), 200, env);
    } catch (e) {
        return error(e.message, 400, env);
    }
}

export async function importSpecRoutes(request, env) {
    let body;
    try { body = await readJson(request, MAX_SPEC_BYTES); } catch (e) { return error(e.message || 'Invalid JSON', 400, env); }

    let spec = body.spec;
    try {
        if (typeof spec === 'string') spec = JSON.parse(spec);
        if (!spec && body.url) {
            let target;
            try { target = new URL(String(body.url)); } catch { return error('Enter a valid spec URL', 400, env); }
            if (!/^https?:$/.test(target.protocol)) return error('The spec URL must start with http:// or https://', 400, env);
            const res = await fetch(target.toString(), {
                headers: { Accept: 'application/json' },
                signal: AbortSignal.timeout ? AbortSignal.timeout(10000) : undefined,
            });
            if (!res.ok) return error(`Could not fetch the spec: HTTP ${res.status}`, 400, env);
            const text = await res.text();
            if (text.length > MAX_SPEC_BYTES) return error('The spec is larger than 3 MB', 400, env);
            spec = JSON.parse(text);
        }
    } catch (e) {
        return error('Could not read the spec. It must be OpenAPI 3 or Swagger 2 in JSON format.', 400, env);
    }
    if (spec && !spec.paths && spec.result) spec = spec.result;
    if (!spec || typeof spec !== 'object' || (!spec.openapi && !spec.swagger) || !spec.paths) {
        return error('This is not an OpenAPI/Swagger spec (it needs an "openapi" or "swagger" field and "paths")', 400, env);
    }

    let endpoints;
    try { endpoints = extractEndpoints(spec); } catch (e) { return error(`Could not read the endpoints in this spec: ${e.message}`, 400, env); }
    if (!endpoints.length) return error('No endpoints found in this spec', 400, env);

    const routes = endpoints.slice(0, LIMITS.routes).map(ep => {
        const m = mockFromEndpoint(ep);
        let text = m.body === null || m.body === undefined ? '' : JSON.stringify(m.body, null, 2);
        if (text.length > LIMITS.bodyBytes) text = JSON.stringify(Array.isArray(m.body) ? m.body.slice(0, 2) : m.body, null, 2).slice(0, LIMITS.bodyBytes);
        return {
            method: String(ep.method).toUpperCase(),
            path: ep.path,
            status: m.status,
            headers: {},
            delay_ms: 0,
            body: text,
            summary: ep.summary || '',
            source: m.source,
        };
    });
    return json(success({ routes, total: endpoints.length, title: spec.info?.title || null }), 200, env);
}
