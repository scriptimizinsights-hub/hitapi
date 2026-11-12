/**
 * routes/traffic.js — GET /api/admin/traffic (super admins only)
 *
 * Query: kind (page|api|mock), user_id, user (anonymous|signed_in), q (path contains),
 *        status (2xx|3xx|4xx|5xx), ip, country, before (ms), limit
 * Returns the newest matching requests plus a 24-hour summary.
 */

import { DatabaseAdapter } from '../db/adapter.js';
import { json, error, success } from '../middleware/cors.js';
import { isSuperAdminDb } from './admin.js';

const STATUS_RANGES = { '2xx': [200, 299], '3xx': [300, 399], '4xx': [400, 499], '5xx': [500, 599] };

export async function adminTraffic(request, env, { user }) {
    const db = new DatabaseAdapter(env.DB);
    if (!(await isSuperAdminDb(db, user))) return error('Super admin access required', 403, env);

    const qs = new URL(request.url).searchParams;
    const limit = Math.min(Math.max(parseInt(qs.get('limit') || '100', 10) || 100, 1), 500);
    const where = ['1 = 1'];
    const args = [];
    const kind = qs.get('kind');
    if (['page', 'api', 'mock'].includes(kind)) { where.push('l.kind = ?'); args.push(kind); }
    if (qs.get('user_id')) { where.push('l.user_id = ?'); args.push(qs.get('user_id')); }
    if (qs.get('user') === 'anonymous') where.push('l.user_id IS NULL');
    if (qs.get('user') === 'signed_in') where.push('l.user_id IS NOT NULL');
    if (qs.get('q')) { where.push('l.path LIKE ?'); args.push(`%${qs.get('q').slice(0, 200)}%`); }
    const range = STATUS_RANGES[qs.get('status')];
    if (range) { where.push('l.status BETWEEN ? AND ?'); args.push(range[0], range[1]); }
    if (qs.get('ip')) { where.push('l.ip = ?'); args.push(qs.get('ip')); }
    if (qs.get('country')) { where.push('l.country = ?'); args.push(qs.get('country').toUpperCase()); }
    const before = parseInt(qs.get('before') || '', 10);
    if (Number.isFinite(before)) { where.push('l.ts < ?'); args.push(before); }

    let rows;
    try {
        rows = await db.all(
            `SELECT l.*, u.name AS user_name, u.email AS user_email
               FROM request_logs l
               LEFT JOIN hitapi_users u ON u.id = l.user_id
              WHERE ${where.join(' AND ')}
              ORDER BY l.ts DESC
              LIMIT ${limit + 1}`,
            args
        );
    } catch (e) {
        if (/no such table/i.test(e.message)) {
            return error('The request_logs table does not exist yet. Run migration 0015_request_logs.sql.', 503, env);
        }
        throw e;
    }
    const has_more = rows.length > limit;
    if (has_more) rows = rows.slice(0, limit);

    const since = Date.now() - 86400000;
    const [totals, topPaths, topCountries] = await Promise.all([
        db.first(
            `SELECT COUNT(*) AS requests,
                    SUM(kind = 'page') AS page_views,
                    SUM(kind = 'api') AS api_calls,
                    SUM(kind = 'mock') AS mock_calls,
                    SUM(status >= 500) AS server_errors,
                    SUM(status BETWEEN 400 AND 499) AS client_errors,
                    COUNT(DISTINCT ip) AS unique_ips,
                    COUNT(DISTINCT user_id) AS signed_in_users,
                    ROUND(AVG(CASE WHEN kind = 'api' THEN duration_ms END)) AS avg_api_ms
               FROM request_logs WHERE ts >= ?`, [since]),
        db.all(
            `SELECT path, COUNT(*) AS n FROM request_logs
              WHERE ts >= ? AND kind = 'page' GROUP BY path ORDER BY n DESC LIMIT 6`, [since]),
        db.all(
            `SELECT COALESCE(country, '??') AS country, COUNT(*) AS n FROM request_logs
              WHERE ts >= ? GROUP BY country ORDER BY n DESC LIMIT 6`, [since]),
    ]);

    return json(success({
        items: rows,
        has_more,
        next_before: has_more ? rows[rows.length - 1].ts : null,
        summary: { ...totals, top_pages: topPaths, top_countries: topCountries },
    }), 200, env);
}
