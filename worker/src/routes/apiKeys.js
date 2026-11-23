/**
 * routes/apiKeys.js — manage personal API keys (roadmap feature 12).
 *
 *   GET    /api/keys        → { keys: [{ id, name, prefix, created_at, last_used_at, expires_at }] }
 *   POST   /api/keys        { name, expires_in_days? } → { key, id, name, prefix, … }  (the key is shown only here)
 *   DELETE /api/keys/:id    → { deleted: true }   the key stops working at once
 *
 * Creating and deleting keys needs a normal sign-in: a key can't make or remove keys.
 */

import { DatabaseAdapter } from '../db/adapter.js';
import { json, error, success, parseBody } from '../middleware/cors.js';
import { newKey, hashKey } from '../services/apiKeys.js';

export const MAX_KEYS = 20;
const MAX_DAYS = 3650;

const shape = (r) => ({ id: r.id, name: r.name, prefix: r.prefix, created_at: r.created_at, last_used_at: r.last_used_at || null, expires_at: r.expires_at || null });
const noKeys = (user) => (user?.via === 'api_key' ? error('Sign in to HitAPI to manage API keys (an API key can\'t create or delete keys).', 403) : null);

export async function listApiKeys(request, env, { user }) {
    const db = new DatabaseAdapter(env.DB);
    const rows = await db.all('SELECT id, name, prefix, created_at, last_used_at, expires_at FROM api_keys WHERE user_id = ? ORDER BY created_at DESC', [user.sub]);
    return json(success({ keys: rows.map(shape), max: MAX_KEYS }));
}

export async function createApiKey(request, env, { user }) {
    const refused = noKeys(user);
    if (refused) return refused;
    let body;
    try { body = await parseBody(request); } catch { return error('Invalid JSON body'); }
    const name = String(body?.name || '').trim().slice(0, 80);
    if (!name) return error('Give the key a name, e.g. "GitHub Actions"');
    let expiresAt = null;
    if (body?.expires_in_days != null && body.expires_in_days !== '') {
        const days = Number(body.expires_in_days);
        if (!Number.isFinite(days) || days < 1 || days > MAX_DAYS) return error(`expires_in_days must be between 1 and ${MAX_DAYS}`);
        expiresAt = Math.floor(Date.now() / 1000) + Math.round(days * 86400);
    }
    const db = new DatabaseAdapter(env.DB);
    const count = await db.first('SELECT COUNT(*) AS n FROM api_keys WHERE user_id = ?', [user.sub]);
    if ((count?.n || 0) >= MAX_KEYS) return error(`You have ${MAX_KEYS} keys, the most allowed. Delete one you no longer use.`, 409);
    const key = newKey();
    const id = crypto.randomUUID();
    const prefix = key.slice(0, 11);
    const now = Math.floor(Date.now() / 1000);
    await db.run('INSERT INTO api_keys (id, user_id, name, prefix, key_hash, created_at, expires_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
        [id, user.sub, name, prefix, await hashKey(key), now, expiresAt]);
    return json(success({ key, ...shape({ id, name, prefix, created_at: now, expires_at: expiresAt }) }), 201);
}

export async function deleteApiKey(request, env, { params, user }) {
    const refused = noKeys(user);
    if (refused) return refused;
    const db = new DatabaseAdapter(env.DB);
    const row = await db.first('SELECT id FROM api_keys WHERE id = ? AND user_id = ?', [params.id, user.sub]);
    if (!row) return error('Key not found', 404);
    await db.run('DELETE FROM api_keys WHERE id = ? AND user_id = ?', [params.id, user.sub]);
    return json(success({ deleted: true }));
}
