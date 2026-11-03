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

export const ACTIVITY_TYPES = [
    'signup', 'login', 'terms', 'project_created', 'endpoints_imported',
    'tests_generated', 'test_run', 'flow_created', 'flow_run', 'bug_found',
];

function activitySources(withLogin) {
    const s = [
        `SELECT u.created_at AS ts, 'signup' AS type, u.id AS user_id, NULL AS project_id,
            NULL AS label, NULL AS status, NULL AS total, NULL AS passed, NULL AS failed
       FROM hitapi_users u`,
        // terms acceptances, skipping the one recorded at sign-up
        `SELECT t.accepted_at, 'terms', t.user_id, NULL, t.terms_version, NULL, NULL, NULL, NULL
       FROM terms_acceptances t JOIN hitapi_users u ON u.id = t.user_id
      WHERE t.accepted_at - u.created_at > 60`,
        `SELECT p.created_at, 'project_created', p.user_id, p.id, p.name, NULL, NULL, NULL, NULL
       FROM projects p`,
        `SELECT MIN(e.created_at), 'endpoints_imported', p.user_id, e.project_id, NULL, NULL, COUNT(*), NULL, NULL
       FROM endpoints e JOIN projects p ON p.id = e.project_id
      GROUP BY e.project_id, e.created_at / 60`,
        `SELECT MIN(tc.created_at), 'tests_generated', p.user_id, ts.project_id, NULL, NULL, COUNT(*), NULL, NULL
       FROM test_cases tc JOIN test_suites ts ON ts.id = tc.suite_id JOIN projects p ON p.id = ts.project_id
      GROUP BY ts.project_id, tc.created_at / 60`,
        `SELECT COALESCE(x.started_at, x.created_at), 'test_run', p.user_id, x.project_id, x.triggered, x.status, x.total, x.passed, x.failed
       FROM executions x JOIN projects p ON p.id = x.project_id`,
        `SELECT f.created_at, 'flow_created', p.user_id, f.project_id, f.name, NULL, NULL, NULL, NULL
       FROM flow_suites f JOIN projects p ON p.id = f.project_id`,
        `SELECT r.started_at, 'flow_run', p.user_id, r.project_id, f.name, r.status, r.total_steps, r.passed, r.failed
       FROM flow_runs r JOIN flow_suites f ON f.id = r.suite_id JOIN projects p ON p.id = r.project_id`,
        `SELECT b.created_at, 'bug_found', p.user_id, b.project_id, b.title, b.severity, NULL, NULL, NULL
       FROM bugs b JOIN projects p ON p.id = b.project_id`,
    ];
    if (withLogin) {
        s.splice(1, 0, `SELECT u.last_login_at, 'login', u.id, NULL, NULL, NULL, NULL, NULL, NULL
       FROM hitapi_users u WHERE u.last_login_at IS NOT NULL`);
    }
    return s.join('\n UNION ALL \n');
}

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
    if (type && ACTIVITY_TYPES.includes(type)) { where.push('a.type = ?'); args.push(type); }
    if (Number.isFinite(before)) { where.push('a.ts < ?'); args.push(before); }

    const sql = (withLogin) => `
    SELECT a.*, u.name AS user_name, u.email AS user_email, pr.name AS project_name
      FROM (${activitySources(withLogin)}) a
      LEFT JOIN hitapi_users u ON u.id = a.user_id
      LEFT JOIN projects pr ON pr.id = a.project_id
     WHERE ${where.join(' AND ')}
     ORDER BY a.ts DESC
     LIMIT ${limit + 1}`;

    let rows;
    try {
        rows = await db.all(sql(true), args);
    } catch {
        rows = await db.all(sql(false), args); // migration 0013 (last_login_at) not applied yet
    }
    const has_more = rows.length > limit;
    if (has_more) rows = rows.slice(0, limit);

    return json(success({ items: rows, has_more, next_before: has_more ? rows[rows.length - 1].ts : null }), 200, env);
}