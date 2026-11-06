/**
 * Super admin — platform-wide visibility.
 *
 * Who is a super admin: any user whose email is in the `admins` table.
 * The check looks the user up by ID (the token's `sub`) instead of trusting
 * the email inside the token.
 *
 * What a super admin can do:
 *   - GET /api/admin/stats     platform totals
 *   - GET /api/admin/users     every user with project / run counts
 *   - GET /api/admin/projects  every project with its owner and counts
 *   - open ANY project's pages read-only (see the middleware in src/index.js);
 *     stored credentials are always redacted with redactSecrets().
 */

import { DatabaseAdapter } from '../db/adapter.js';
import { json, error, success } from '../middleware/cors.js';
// ─── Who is a super admin ────────────────────────────────────────────────────

export async function isSuperAdminDb(db, user) {
    if (!user?.sub) return false;
    const row = await db.first(
        `SELECT a.id FROM admins a
       JOIN hitapi_users u ON lower(u.email) = lower(a.email)
      WHERE u.id = ? LIMIT 1`,
        [user.sub]
    );
    return !!row;
}

export async function isSuperAdmin(env, user) {
    return isSuperAdminDb(new DatabaseAdapter(env.DB), user);
}

export async function getProjectOwnerId(env, projectId) {
    const db = new DatabaseAdapter(env.DB);
    const row = await db.first('SELECT user_id FROM projects WHERE id = ?', [projectId]);
    return row?.user_id || null;
}

// ─── Hide stored credentials from admin views ────────────────────────────────

const MASK = '••••••';
const SENSITIVE_KEY = /^(password|passwd|pwd|pass|secret|client_secret|token|access_token|refresh_token|id_token|static_token|bearer|api_?key|x-api-key|authorization|proxy-authorization|cookie|set-cookie|auth_config|private_key)$/i;

/**
 * Deep-copies `value`, replacing anything that looks like a credential.
 * Also looks inside JSON stored as strings (e.g. auth_config, input_payload,
 * request_headers, context) and header lists like [{ key, value }].
 */
export function redactSecrets(value, depth = 0) {
    if (depth > 25 || value === null || value === undefined) return value;

    if (typeof value === 'string') {
        const t = value.trim();
        if ((t.startsWith('{') && t.endsWith('}')) || (t.startsWith('[') && t.endsWith(']'))) {
            try { return JSON.stringify(redactSecrets(JSON.parse(t), depth + 1)); } catch { /* not JSON */ }
        }
        return value;
    }

    if (Array.isArray(value)) return value.map(v => redactSecrets(v, depth + 1));

    if (typeof value === 'object') {
        // header rows such as { key: 'Authorization', value: 'Bearer …' }
        const label = value.key ?? value.name ?? value.header;
        const isSecretRow = typeof label === 'string' && SENSITIVE_KEY.test(label.trim());

        const out = {};
        for (const [k, v] of Object.entries(value)) {
            if (SENSITIVE_KEY.test(k) && v !== null && v !== '' && v !== undefined) out[k] = MASK;
            else if (isSecretRow && k === 'value' && v) out[k] = MASK;
            else out[k] = redactSecrets(v, depth + 1);
        }
        return out;
    }

    return value;
}

/** Re-write a JSON Response with credentials redacted. */
export async function redactResponse(response) {
    const type = response.headers.get('content-type') || '';
    if (!type.includes('application/json')) return response;
    let data;
    try { data = await response.clone().json(); } catch { return response; }
    return new Response(JSON.stringify(redactSecrets(data)), {
        status: response.status,
        headers: response.headers,
    });
}

// ─── Guard ───────────────────────────────────────────────────────────────────

async function guard(env, user) {
    const db = new DatabaseAdapter(env.DB);
    if (!(await isSuperAdminDb(db, user))) return { db, denied: error('Super admin access required', 403, env) };
    return { db };
}

// ─── GET /api/admin/stats ────────────────────────────────────────────────────

export async function adminStats(request, env, { user }) {
    const { db, denied } = await guard(env, user);
    if (denied) return denied;

    const stats = await db.first(`
    SELECT
      (SELECT COUNT(*) FROM hitapi_users)                                              AS users,
      (SELECT COUNT(*) FROM hitapi_users WHERE created_at >= unixepoch() - 7 * 86400)  AS users_7d,
      (SELECT COUNT(*) FROM projects)                                                  AS projects,
      (SELECT COUNT(*) FROM endpoints)                                                 AS endpoints,
      (SELECT COUNT(*) FROM test_cases)                                                AS test_cases,
      (SELECT COUNT(*) FROM executions)                                                AS executions,
      (SELECT COUNT(*) FROM executions WHERE created_at >= unixepoch() - 86400)        AS executions_24h,
      (SELECT COUNT(*) FROM flow_suites)                                               AS flow_suites,
      (SELECT COUNT(*) FROM flow_runs)                                                 AS flow_runs,
      (SELECT COUNT(*) FROM bugs WHERE status = 'open')                                AS open_bugs
  `);
    return json(success(stats), 200, env);
}

// ─── GET /api/admin/users ────────────────────────────────────────────────────

export async function adminListUsers(request, env, { user }) {
    const { db, denied } = await guard(env, user);
    if (denied) return denied;

    const query = (lastLogin) => `
    SELECT u.id, u.email, u.name, u.created_at, ${lastLogin} AS last_login_at,
           u.terms_version_accepted,
           (SELECT COUNT(*) FROM projects p WHERE p.user_id = u.id) AS project_count,
           (SELECT COUNT(*) FROM executions e JOIN projects p ON p.id = e.project_id
             WHERE p.user_id = u.id) AS execution_count,
           (SELECT MAX(e.created_at) FROM executions e JOIN projects p ON p.id = e.project_id
             WHERE p.user_id = u.id) AS last_run_at,
           EXISTS (SELECT 1 FROM admins a WHERE lower(a.email) = lower(u.email)) AS is_admin
      FROM hitapi_users u
     ORDER BY u.created_at DESC
     LIMIT 1000`;

    let users;
    try {
        users = await db.all(query('u.last_login_at'));
    } catch {
        // migration 0013 (last_login_at) not applied yet
        users = await db.all(query('NULL'));
    }
    return json(success(users), 200, env);
}

// ─── GET /api/admin/projects[?user_id=] ──────────────────────────────────────

export async function adminListProjects(request, env, { user }) {
    const { db, denied } = await guard(env, user);
    if (denied) return denied;

    const userId = new URL(request.url).searchParams.get('user_id');
    const rows = await db.all(`
    SELECT p.*, u.email AS owner_email, u.name AS owner_name,
           (SELECT COUNT(*) FROM endpoints e WHERE e.project_id = p.id) AS endpoint_count,
           (SELECT COUNT(*) FROM test_cases tc JOIN test_suites ts ON ts.id = tc.suite_id
             WHERE ts.project_id = p.id) AS test_count,
           (SELECT COUNT(*) FROM executions x WHERE x.project_id = p.id) AS execution_count,
           (SELECT MAX(x.created_at) FROM executions x WHERE x.project_id = p.id) AS last_run_at,
           (SELECT COUNT(*) FROM flow_suites f WHERE f.project_id = p.id) AS flow_count,
           (SELECT COUNT(*) FROM bugs b WHERE b.project_id = p.id AND b.status = 'open') AS open_bugs
      FROM projects p
      LEFT JOIN hitapi_users u ON u.id = p.user_id
     ${userId ? 'WHERE p.user_id = ?' : ''}
     ORDER BY p.created_at DESC
     LIMIT 1000`, userId ? [userId] : []);

    return json(success(redactSecrets(rows)), 200, env);
}

// ─── GET /api/admin/activity[?user_id=&type=&before=&limit=] ─────────────────
// A timeline built from data the app already stores. Imports and test
// generation create many rows at once, so those are grouped per project per
// minute ("imported 24 endpoints").
//
// Each activity type is a separate query whose results are merged here.
// (One big UNION ALL of all types fails on Cloudflare D1 with
// "too many terms in compound SELECT".)

export const ACTIVITY_TYPES = [
    'signup', 'login', 'terms', 'project_created', 'endpoints_imported',
    'tests_generated', 'test_run', 'flow_created', 'flow_run', 'bug_found',
];

// Every query returns: ts, type, user_id, project_id, label, status, total, passed, failed
const ACTIVITY_SOURCES = {
    signup: `SELECT u.created_at AS ts, 'signup' AS type, u.id AS user_id, NULL AS project_id,
                    NULL AS label, NULL AS status, NULL AS total, NULL AS passed, NULL AS failed
               FROM hitapi_users u`,
    login: `SELECT u.last_login_at AS ts, 'login' AS type, u.id AS user_id, NULL AS project_id,
                   NULL AS label, NULL AS status, NULL AS total, NULL AS passed, NULL AS failed
              FROM hitapi_users u WHERE u.last_login_at IS NOT NULL`,
    // terms acceptances, skipping the one recorded at sign-up
    terms: `SELECT t.accepted_at AS ts, 'terms' AS type, t.user_id AS user_id, NULL AS project_id,
                   t.terms_version AS label, NULL AS status, NULL AS total, NULL AS passed, NULL AS failed
              FROM terms_acceptances t JOIN hitapi_users u ON u.id = t.user_id
             WHERE t.accepted_at - u.created_at > 60`,
    project_created: `SELECT p.created_at AS ts, 'project_created' AS type, p.user_id AS user_id, p.id AS project_id,
                             p.name AS label, NULL AS status, NULL AS total, NULL AS passed, NULL AS failed
                        FROM projects p`,
    endpoints_imported: `SELECT MIN(e.created_at) AS ts, 'endpoints_imported' AS type, p.user_id AS user_id, e.project_id AS project_id,
                                NULL AS label, NULL AS status, COUNT(*) AS total, NULL AS passed, NULL AS failed
                           FROM endpoints e JOIN projects p ON p.id = e.project_id
                          GROUP BY e.project_id, e.created_at / 60`,
    tests_generated: `SELECT MIN(tc.created_at) AS ts, 'tests_generated' AS type, p.user_id AS user_id, ts.project_id AS project_id,
                             NULL AS label, NULL AS status, COUNT(*) AS total, NULL AS passed, NULL AS failed
                        FROM test_cases tc JOIN test_suites ts ON ts.id = tc.suite_id JOIN projects p ON p.id = ts.project_id
                       GROUP BY ts.project_id, tc.created_at / 60`,
    test_run: `SELECT COALESCE(x.started_at, x.created_at) AS ts, 'test_run' AS type, p.user_id AS user_id, x.project_id AS project_id,
                      x.triggered AS label, x.status AS status, x.total AS total, x.passed AS passed, x.failed AS failed
                 FROM executions x JOIN projects p ON p.id = x.project_id`,
    flow_created: `SELECT f.created_at AS ts, 'flow_created' AS type, p.user_id AS user_id, f.project_id AS project_id,
                          f.name AS label, NULL AS status, NULL AS total, NULL AS passed, NULL AS failed
                     FROM flow_suites f JOIN projects p ON p.id = f.project_id`,
    flow_run: `SELECT r.started_at AS ts, 'flow_run' AS type, p.user_id AS user_id, r.project_id AS project_id,
                      f.name AS label, r.status AS status, r.total_steps AS total, r.passed AS passed, r.failed AS failed
                 FROM flow_runs r JOIN flow_suites f ON f.id = r.suite_id JOIN projects p ON p.id = r.project_id`,
    bug_found: `SELECT b.created_at AS ts, 'bug_found' AS type, p.user_id AS user_id, b.project_id AS project_id,
                       b.title AS label, b.severity AS status, NULL AS total, NULL AS passed, NULL AS failed
                  FROM bugs b JOIN projects p ON p.id = b.project_id`,
};

export async function adminActivity(request, env, { user }) {
    const { db, denied } = await guard(env, user);
    if (denied) return denied;

    const qs = new URL(request.url).searchParams;
    const userId = qs.get('user_id');
    const type = qs.get('type');
    const before = parseInt(qs.get('before') || '', 10);
    const limit = Math.min(Math.max(parseInt(qs.get('limit') || '100', 10) || 100, 1), 500);

    const where = ['a.ts IS NOT NULL'];
    const args = [];
    if (userId) { where.push('a.user_id = ?'); args.push(userId); }
    if (Number.isFinite(before)) { where.push('a.ts < ?'); args.push(before); }

    const types = type && ACTIVITY_TYPES.includes(type) ? [type] : ACTIVITY_TYPES;

    // Newest `limit + 1` rows of each type, then the newest overall.
    const perType = await Promise.all(types.map(async (t) => {
        const sql = `
            SELECT a.*, u.name AS user_name, u.email AS user_email, pr.name AS project_name
              FROM (${ACTIVITY_SOURCES[t]}) a
              LEFT JOIN hitapi_users u ON u.id = a.user_id
              LEFT JOIN projects pr ON pr.id = a.project_id
             WHERE ${where.join(' AND ')}
             ORDER BY a.ts DESC
             LIMIT ${limit + 1}`;
        try {
            return await db.all(sql, args);
        } catch (e) {
            // e.g. migration 0013 (last_login_at) not applied yet: skip that type, keep the rest
            console.warn(`[Admin] activity "${t}" skipped:`, e.message);
            return [];
        }
    }));

    let rows = perType.flat().sort((a, b) => (b.ts || 0) - (a.ts || 0));
    const has_more = rows.length > limit;
    if (has_more) rows = rows.slice(0, limit);

    return json(success({ items: rows, has_more, next_before: has_more ? rows[rows.length - 1].ts : null }), 200, env);
}
