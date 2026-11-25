/**
 * services/requestLog.js — records every request HitAPI receives.
 *
 *   kind 'api'   every call to the API (logged in or not), written by withRequestLog()
 *   kind 'mock'  calls to public mock servers (/mock/...)
 *   kind 'page'  website page views, sent by the frontend to POST /api/public/track
 *
 * Writes happen after the response is sent (ctx.waitUntil), so logging never
 * slows a request down or breaks it. Rows older than RETENTION_DAYS are
 * deleted now and then by the same writes. Query strings are stored with
 * secret-looking values masked.
 */

import { requireAuth } from './auth.js';

export const RETENTION_DAYS = 30;
const CLEANUP_EVERY = 200; // on average, one write in 200 also deletes expired rows

// Not logged as 'api': the page-view beacon writes its own 'page' row, and the
// admin Traffic view would otherwise fill the log with its own refreshes.
const SKIP_PATHS = new Set(['/api/public/track', '/api/admin/traffic', '/health', '/api/health']);
// Polling isn't logged: each logged call costs 4 written rows (the row + 3 indexes), and the
// extension's Local Agent and account sync ask often. See docs/platform/usage-limits.md.
const isPolling = (method, path) => path === '/api/agent/jobs' || path === '/api/agent/status' || path.startsWith('/api/agent/jobs/')
    || (method === 'GET' && path === '/api/extension/sync');
const SECRET_PARAM = /token|key|secret|pass|auth|code|sig|session|jwt/i;

const clip = (s, n) => (s === null || s === undefined ? null : String(s).slice(0, n));

export function redactQuery(search) {
    if (!search || search === '?') return null;
    const params = new URLSearchParams(search);
    const out = new URLSearchParams();
    for (const [k, v] of params) out.append(k, SECRET_PARAM.test(k) ? '•••' : v);
    const s = out.toString();
    return s ? clip(s, 500) : null;
}

async function userIdOf(request, env) {
    try { return (await requireAuth(request, env))?.sub || null; } catch { return null; }
}

function clientOf(request) {
    const cf = request.cf || {};
    return {
        ip: request.headers.get('cf-connecting-ip') || request.headers.get('x-real-ip') || null,
        country: cf.country || request.headers.get('cf-ipcountry') || null,
        city: cf.city || null,
        userAgent: clip(request.headers.get('user-agent'), 400),
    };
}

/** Insert one row. Never throws. */
export async function writeLog(env, row) {
    if (!env.DB) return;
    try {
        await env.DB.prepare(
            `INSERT INTO request_logs
               (ts, kind, method, host, path, query, status, duration_ms, user_id, ip, country, city, user_agent, referer)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
        ).bind(
            row.ts, row.kind, row.method, clip(row.host, 120), clip(row.path, 500), row.query,
            row.status ?? null, row.duration_ms ?? null, row.user_id ?? null, row.ip, row.country, row.city,
            row.user_agent, clip(row.referer, 500),
        ).run();
        if (Math.random() < 1 / CLEANUP_EVERY) {
            await env.DB.prepare('DELETE FROM request_logs WHERE ts < ?')
                .bind(Date.now() - RETENTION_DAYS * 86400000).run();
        }
    } catch (e) {
        // e.g. the request_logs table hasn't been created yet
        console.warn('[RequestLog] write failed:', e.message);
    }
}

/**
 * Wraps the worker's fetch handler: runs it, then logs the request.
 * @param {Function} handler  (request, env, ctx) => Response
 */
export async function withRequestLog(request, env, ctx, handler) {
    const started = Date.now();
    const response = await handler(request, env, ctx);
    try {
        const url = new URL(request.url);
        const path = url.pathname.replace(/\/$/, '') || '/';
        // calls to mock URLs (/mock/...) aren't logged either: apps can call them very often
        if (request.method !== 'OPTIONS' && !SKIP_PATHS.has(path) && !isPolling(request.method, path) && !path.startsWith('/mock/')) {
            const client = clientOf(request);
            const task = (async () => writeLog(env, {
                ts: started,
                kind: path.startsWith('/mock/') ? 'mock' : 'api',
                method: request.method,
                host: url.host,
                path,
                query: redactQuery(url.search),
                status: response?.status ?? null,
                duration_ms: Date.now() - started,
                user_id: path.startsWith('/mock/') ? null : await userIdOf(request, env),
                ip: client.ip,
                country: client.country,
                city: client.city,
                user_agent: client.userAgent,
                referer: request.headers.get('referer'),
            }))();
            if (ctx?.waitUntil) ctx.waitUntil(task); else await task;
        }
    } catch (e) {
        console.warn('[RequestLog]', e.message);
    }
    return response;
}

/**
 * POST /api/public/track — a page view from the website, logged in or not.
 * Body: { path, referrer?, host? }. The frontend sends the user's token when
 * signed in, so page views are linked to the user.
 */
export async function trackPageView(request, env, { ctx }) {
    let body = {};
    try { body = await request.json(); } catch { /* empty */ }
    const raw = String(body.path || '');
    if (!raw.startsWith('/') || raw.length > 500) {
        return new Response(JSON.stringify({ success: false, error: 'path must start with /' }), {
            status: 400, headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
        });
    }
    const [path, search = ''] = raw.split('?');
    let host = null;
    try { host = new URL(request.headers.get('origin') || '').host; } catch { /* no origin */ }
    const client = clientOf(request);
    const task = (async () => writeLog(env, {
        ts: Date.now(),
        kind: 'page',
        method: 'GET',
        host: host || clip(body.host, 120) || 'hitapi.dev',
        path,
        query: redactQuery(search),
        status: null,
        duration_ms: null,
        user_id: await userIdOf(request, env),
        ip: client.ip,
        country: client.country,
        city: client.city,
        user_agent: client.userAgent,
        referer: body.referrer || null,
    }))();
    if (ctx?.waitUntil) ctx.waitUntil(task); else await task;
    return new Response(null, { status: 204, headers: { 'Access-Control-Allow-Origin': '*' } });
}
