/**
 * services/apiKeys.js — personal API keys (roadmap feature 12).
 *
 * A key looks like "hk_" + 40 random base62 characters. Only its SHA-256 hash
 * is stored. requireAuth (services/auth.js) accepts a key as
 * "Authorization: Bearer hk_…" or "X-API-Key: hk_…" and acts as the key's user,
 * marked via: 'api_key' so a few routes can refuse keys (creating keys, admin).
 */

import { isDailyLimit } from './dailyLimit.js';
export const KEY_PREFIX = 'hk_';
const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
const TOUCH_EVERY_S = 60;   // last_used_at is written at most once a minute per key

export function newKey() {
    const bytes = crypto.getRandomValues(new Uint8Array(40));
    let s = '';
    for (const b of bytes) s += ALPHABET[b % 62];
    return KEY_PREFIX + s;
}

export async function hashKey(key) {
    const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(String(key)));
    return [...new Uint8Array(digest)].map(b => b.toString(16).padStart(2, '0')).join('');
}

export const looksLikeKey = (s) => typeof s === 'string' && s.startsWith(KEY_PREFIX) && /^hk_[A-Za-z0-9]{20,80}$/.test(s);

/** The key's user as a token payload, or null (unknown, expired, deleted user). */
export async function verifyApiKey(key, env) {
    if (!looksLikeKey(key) || !env?.DB) return null;
    const { DatabaseAdapter } = await import('../db/adapter.js');
    const db = new DatabaseAdapter(env.DB);
    const row = await db.first(
        `SELECT k.id, k.user_id, k.expires_at, k.last_used_at, u.email, u.name
           FROM api_keys k JOIN hitapi_users u ON u.id = k.user_id
          WHERE k.key_hash = ?`,
        [await hashKey(key)]
    ).catch((e) => { if (isDailyLimit(e?.message)) throw e; return null; });   // D1's daily limit: say so, not "Unauthorized"
    if (!row) return null;
    const now = Math.floor(Date.now() / 1000);
    if (row.expires_at && row.expires_at < now) return null;
    if (!row.last_used_at || now - row.last_used_at > TOUCH_EVERY_S) {
        await db.run('UPDATE api_keys SET last_used_at = ? WHERE id = ?', [now, row.id]).catch(() => {});
    }
    return { sub: row.user_id, email: row.email, name: row.name, via: 'api_key', key_id: row.id };
}
