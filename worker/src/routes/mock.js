/**
 * routes/mock.js — manage a project's mock server (all behind login; the
 * project-ownership check in src/index.js applies to every /api/projects/:id route).
 *
 *   GET    /api/projects/:id/mock                     mock URL + every route
 *   POST   /api/projects/:id/mock                     create, or regenerate from the spec
 *   PUT    /api/projects/:id/mock                     { enabled }
 *   DELETE /api/projects/:id/mock
 *   POST   /api/projects/:id/mock/ai                  AI-improve the next few routes { limit }
 *   PUT    /api/projects/:id/mock/responses/:rid      edit { status, body, delay_ms }
 *   POST   /api/projects/:id/mock/responses/:rid/ai   AI-regenerate one route
 *
 * The public side (what apps call) is services/mock/serve.js.
 */

import { DatabaseAdapter } from '../db/adapter.js';
import { json, error, success, parseBody } from '../middleware/cors.js';
import { mockFromEndpoint } from '../services/mock/specSamples.js';
import { aiResponseBody } from '../services/mock/aiMock.js';

const AI_BATCH_MAX = 4;

async function body(request) {
    try { return (await parseBody(request)) || {}; } catch { return {}; }
}

function newSlug() {
    const bytes = crypto.getRandomValues(new Uint8Array(9));
    return Array.from(bytes, b => (b % 36).toString(36)).join('') + Date.now().toString(36).slice(-3);
}

const mockUrl = (request, slug) => `${new URL(request.url).origin}/mock/${slug}`;

async function loadMock(db, projectId) {
    return db.first('SELECT * FROM mock_servers WHERE project_id = ?', [projectId]);
}

function shapeRoute(r) {
    return {
        id: r.id,
        method: r.method,
        path: r.path,
        status: r.status,
        body: r.body,
        delay_ms: r.delay_ms,
        source: r.source,
        updated_at: r.updated_at,
    };
}

async function listRoutes(db, mockId) {
    const rows = await db.all(
        'SELECT * FROM mock_responses WHERE mock_id = ? ORDER BY path, method',
        [mockId]
    );
    return rows.map(shapeRoute);
}

async function aiRemaining(db, mockId) {
    const row = await db.first(
        `SELECT COUNT(*) AS n FROM mock_responses
          WHERE mock_id = ? AND source IN ('schema', 'fallback') AND ai_tried = 0 AND body IS NOT NULL`,
        [mockId]
    );
    return row?.n || 0;
}

// ── GET ──────────────────────────────────────────────────────────────────────
export async function getMockServer(request, env, { params }) {
    const db = new DatabaseAdapter(env.DB);
    const mock = await loadMock(db, params.id);
    if (!mock) return json(success({ mock: null, routes: [] }));
    return json(success({
        mock: { id: mock.id, enabled: !!mock.enabled, url: mockUrl(request, mock.slug), created_at: mock.created_at, updated_at: mock.updated_at },
        routes: await listRoutes(db, mock.id),
        ai_remaining: await aiRemaining(db, mock.id),
    }));
}

// ── POST: create or regenerate from the project's endpoints ────────────────
export async function generateMockServer(request, env, { params }) {
    const db = new DatabaseAdapter(env.DB);
    const opts = await body(request);
    const keepEdited = opts.keepEdited !== false;

    const endpoints = await db.all(
        'SELECT id, method, path, summary, responses FROM endpoints WHERE project_id = ?',
        [params.id]
    );
    if (!endpoints.length) return error('This project has no endpoints yet. Import a Swagger/OpenAPI spec first.', 400);

    let mock = await loadMock(db, params.id);
    if (!mock) {
        const id = db.uuid();
        await db.run('INSERT INTO mock_servers (id, project_id, slug) VALUES (?, ?, ?)', [id, params.id, newSlug()]);
        mock = await loadMock(db, params.id);
    } else {
        await db.run('UPDATE mock_servers SET updated_at = unixepoch() WHERE id = ?', [mock.id]);
    }

    const existing = await db.all('SELECT method, path, source FROM mock_responses WHERE mock_id = ?', [mock.id]);
    const edited = new Set(existing.filter(r => r.source === 'manual').map(r => `${r.method} ${r.path}`));

    const seen = new Set();
    const statements = [];
    for (const ep of endpoints) {
        const method = String(ep.method).toUpperCase();
        const key = `${method} ${ep.path}`;
        if (seen.has(key)) continue; // duplicate endpoint rows: one route
        seen.add(key);
        if (keepEdited && edited.has(key)) continue;
        const sample = mockFromEndpoint({ ...ep, method });
        statements.push({
            sql: `INSERT INTO mock_responses (id, mock_id, endpoint_id, method, path, status, body, source, ai_tried, updated_at)
                  VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, unixepoch())
                  ON CONFLICT(mock_id, method, path) DO UPDATE SET
                    endpoint_id = excluded.endpoint_id, status = excluded.status, body = excluded.body,
                    source = excluded.source, ai_tried = 0, updated_at = unixepoch()`,
            params: [db.uuid(), mock.id, ep.id, method, ep.path, sample.status,
                sample.body === null || sample.body === undefined ? null : JSON.stringify(sample.body), sample.source],
        });
    }
    for (let i = 0; i < statements.length; i += 50) await db.batch(statements.slice(i, i + 50));

    // Routes whose endpoint was removed from the project (hand-edited ones stay)
    const stale = existing.filter(r => !seen.has(`${r.method} ${r.path}`) && r.source !== 'manual');
    for (const r of stale) {
        await db.run('DELETE FROM mock_responses WHERE mock_id = ? AND method = ? AND path = ?', [mock.id, r.method, r.path]);
    }

    return json(success({
        mock: { id: mock.id, enabled: !!mock.enabled, url: mockUrl(request, mock.slug) },
        generated: statements.length,
        kept_edited: keepEdited ? edited.size : 0,
        routes: await listRoutes(db, mock.id),
        ai_remaining: await aiRemaining(db, mock.id),
    }), 201);
}

// ── PUT: on/off ─────────────────────────────────────────────────────────────
export async function updateMockServer(request, env, { params }) {
    const db = new DatabaseAdapter(env.DB);
    const mock = await loadMock(db, params.id);
    if (!mock) return error('No mock server for this project yet', 404);
    const { enabled } = await body(request);
    if (typeof enabled !== 'boolean') return error('enabled (true/false) is required', 400);
    await db.run('UPDATE mock_servers SET enabled = ?, updated_at = unixepoch() WHERE id = ?', [enabled ? 1 : 0, mock.id]);
    return json(success({ enabled }));
}

export async function deleteMockServer(request, env, { params }) {
    const db = new DatabaseAdapter(env.DB);
    const mock = await loadMock(db, params.id);
    if (!mock) return error('No mock server for this project', 404);
    await db.run('DELETE FROM mock_responses WHERE mock_id = ?', [mock.id]);
    await db.run('DELETE FROM mock_servers WHERE id = ?', [mock.id]);
    return json(success({ deleted: true }));
}

// ── AI: improve the next few schema-generated routes ───────────────────────
async function improveRoute(env, db, route) {
    const ep = route.endpoint_id
        ? await db.first('SELECT method, path, summary, responses FROM endpoints WHERE id = ?', [route.endpoint_id])
        : null;
    const baseline = route.body ? JSON.parse(route.body) : null;
    const schema = ep ? mockFromEndpoint(ep).schema : null;
    const aiBody = baseline === null ? undefined : await aiResponseBody(env.AI, {
        method: route.method, path: route.path, summary: ep?.summary,
    }, schema, baseline);
    if (aiBody !== undefined) {
        await db.run(
            `UPDATE mock_responses SET body = ?, source = 'ai', ai_tried = 1, updated_at = unixepoch() WHERE id = ?`,
            [JSON.stringify(aiBody), route.id]
        );
        return true;
    }
    await db.run('UPDATE mock_responses SET ai_tried = 1 WHERE id = ?', [route.id]);
    return false;
}

export async function aiImproveMockBatch(request, env, { params }) {
    const db = new DatabaseAdapter(env.DB);
    const mock = await loadMock(db, params.id);
    if (!mock) return error('Create the mock server first', 404);
    if (!env.AI) return error('AI is not available on this server', 503);
    const { limit } = await body(request);
    const n = Math.min(Math.max(Number(limit) || 3, 1), AI_BATCH_MAX);

    const batch = await db.all(
        `SELECT * FROM mock_responses
          WHERE mock_id = ? AND source IN ('schema', 'fallback') AND ai_tried = 0 AND body IS NOT NULL
          ORDER BY path, method LIMIT ?`,
        [mock.id, n]
    );
    const results = await Promise.all(batch.map(r => improveRoute(env, db, r)));
    return json(success({
        processed: batch.length,
        improved: results.filter(Boolean).length,
        remaining: await aiRemaining(db, mock.id),
    }));
}

// ── One route: edit, or regenerate with AI ──────────────────────────────────
async function routeOfProject(db, projectId, rid) {
    return db.first(
        `SELECT r.* FROM mock_responses r JOIN mock_servers m ON m.id = r.mock_id
          WHERE r.id = ? AND m.project_id = ?`,
        [rid, projectId]
    );
}

export async function updateMockRoute(request, env, { params }) {
    const db = new DatabaseAdapter(env.DB);
    const route = await routeOfProject(db, params.id, params.rid);
    if (!route) return error('Mock route not found', 404);
    const b = await body(request);

    const status = b.status === undefined ? route.status : Number(b.status);
    if (!Number.isInteger(status) || status < 100 || status > 599) return error('status must be a number from 100 to 599', 400);
    const delay = b.delay_ms === undefined ? route.delay_ms : Number(b.delay_ms);
    if (!Number.isFinite(delay) || delay < 0 || delay > 10000) return error('delay_ms must be between 0 and 10000', 400);

    let bodyText = route.body;
    if (b.body !== undefined) {
        if (b.body === null || b.body === '') bodyText = null;
        else if (typeof b.body === 'string') {
            try { bodyText = JSON.stringify(JSON.parse(b.body)); }
            catch (e) { return error(`Body is not valid JSON: ${e.message}`, 400); }
        } else bodyText = JSON.stringify(b.body);
    }

    await db.run(
        `UPDATE mock_responses SET status = ?, delay_ms = ?, body = ?, source = 'manual', updated_at = unixepoch() WHERE id = ?`,
        [status, Math.round(delay), bodyText, route.id]
    );
    return json(success(shapeRoute(await db.first('SELECT * FROM mock_responses WHERE id = ?', [route.id]))));
}

export async function aiMockRoute(request, env, { params }) {
    const db = new DatabaseAdapter(env.DB);
    const route = await routeOfProject(db, params.id, params.rid);
    if (!route) return error('Mock route not found', 404);
    if (!env.AI) return error('AI is not available on this server', 503);
    if (!route.body) return error('This route has no body to improve', 400);
    const improved = await improveRoute(env, db, route);
    if (!improved) return error('AI could not produce a valid response this time. Try again.', 502);
    return json(success(shapeRoute(await db.first('SELECT * FROM mock_responses WHERE id = ?', [route.id]))));
}
