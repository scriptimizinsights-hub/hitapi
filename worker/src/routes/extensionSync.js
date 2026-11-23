/**
 * routes/extensionSync.js — the browser extension's Workbench sync (roadmap feature 11).
 *
 *   GET /api/extension/sync          → { docs: { collections|environments|scenarios: { version, updated_at, device, data } } }
 *   PUT /api/extension/sync/:kind    { data, base_version, device }
 *        → { version, updated_at }                         saved
 *        → { conflict: true, current: { version, … data } }  someone saved first: merge and try again
 *
 * Signed-in users only (the router checks the token). Each user sees only their own rows.
 * The extension removes secrets before it sends anything.
 */

import { DatabaseAdapter } from '../db/adapter.js';
import { json, error, success, parseBody } from '../middleware/cors.js';

export const SYNC_KINDS = ['collections', 'environments', 'scenarios'];
export const MAX_SYNC_BYTES = 900 * 1024;   // per kind; D1 rows stay well under their size limit

const row = (r) => (r ? { version: r.version, updated_at: r.updated_at, device: r.device || '', data: safeParse(r.data) } : null);
const safeParse = (t) => { try { return JSON.parse(t); } catch { return null; } };

export async function getExtensionSync(request, env, { user }) {
  const db = new DatabaseAdapter(env.DB);
  const rows = await db.all('SELECT kind, data, version, device, updated_at FROM extension_sync WHERE user_id = ?', [user.sub]);
  const docs = {};
  for (const r of rows) if (SYNC_KINDS.includes(r.kind)) docs[r.kind] = row(r);
  return json(success({ docs, kinds: SYNC_KINDS, max_bytes: MAX_SYNC_BYTES }));
}

export async function putExtensionSync(request, env, { params, user }) {
  const kind = params.kind;
  if (!SYNC_KINDS.includes(kind)) return error(`Unknown sync kind "${kind}"`, 404);
  let body;
  try { body = await parseBody(request); } catch { return error('Invalid JSON body'); }
  if (!body || body.data === undefined) return error('data is required');
  const text = JSON.stringify(body.data);
  if (text.length > MAX_SYNC_BYTES) return error(`Too much data to sync (${Math.round(text.length / 1024)} KB; the limit is ${Math.round(MAX_SYNC_BYTES / 1024)} KB). Export a backup instead, or remove large items.`, 413);
  const base = Number(body.base_version) || 0;
  const device = String(body.device || '').slice(0, 80);
  const now = Date.now();
  const db = new DatabaseAdapter(env.DB);
  const current = await db.first('SELECT data, version, device, updated_at FROM extension_sync WHERE user_id = ? AND kind = ?', [user.sub, kind]);
  if ((current?.version || 0) !== base) {
    return json(success({ conflict: true, current: row(current) }));
  }
  if (!current) {
    // INSERT OR IGNORE: if another device inserted at the same moment, report a conflict
    const r = await db.run(
      'INSERT OR IGNORE INTO extension_sync (user_id, kind, data, version, device, updated_at) VALUES (?, ?, ?, 1, ?, ?)',
      [user.sub, kind, text, device, now]);
    if (!(r?.meta?.changes ?? r?.changes ?? 1)) {
      const again = await db.first('SELECT data, version, device, updated_at FROM extension_sync WHERE user_id = ? AND kind = ?', [user.sub, kind]);
      return json(success({ conflict: true, current: row(again) }));
    }
    return json(success({ version: 1, updated_at: now }));
  }
  // only replace the version we read (another save in between makes this change nothing)
  const r = await db.run(
    'UPDATE extension_sync SET data = ?, version = version + 1, device = ?, updated_at = ? WHERE user_id = ? AND kind = ? AND version = ?',
    [text, device, now, user.sub, kind, base]);
  if (!(r?.meta?.changes ?? r?.changes ?? 1)) {
    const again = await db.first('SELECT data, version, device, updated_at FROM extension_sync WHERE user_id = ? AND kind = ?', [user.sub, kind]);
    return json(success({ conflict: true, current: row(again) }));
  }
  return json(success({ version: base + 1, updated_at: now }));
}

/** DELETE /api/extension/sync — remove this user's synced data (the "Stop syncing and delete cloud copy" button). */
export async function deleteExtensionSync(request, env, { user }) {
  const db = new DatabaseAdapter(env.DB);
  await db.run('DELETE FROM extension_sync WHERE user_id = ?', [user.sub]);
  return json(success({ deleted: true }));
}
