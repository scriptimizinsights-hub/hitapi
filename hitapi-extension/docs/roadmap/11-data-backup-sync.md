# 11. Data Backup and Sync

**Talend parity:** #77–81 (browser storage, local project data, export, import, persistence).
**Talend Free limit:** no cloud storage — data is lost when the extension is removed or on a new device.
**Status:** ✅ Done in v1.7.0 (user guide: [Request Workbench → Backup and sync](../features/request-workbench/README.md#backup-and-sync)). Cloud sync needs worker migration `0017_extension_sync.sql` and the new `/api/extension/sync` routes deployed.

### What was built
- **☁ Backup** button in the Workbench header (shows *☁ Synced* / *☁ Sync ⚠* when sync is on) opens
  *Backup & sync*:
  - **Storage in this browser:** a meter (bytes used of the 10 MB local limit) with a breakdown (collections,
    environments, scenarios, history, other) and **Clear history**.
  - **Export all** → `hitapi-backup-YYYY-MM-DD.json` with collections, environments (+ Globals and the active
    one), scenarios (with their last report) and the history settings. Options: *Include history* (requests
    with responses) and *Include secrets* (with a plain-text warning). Without secrets: auth secrets, secret
    headers and secret variable values are blanked.
  - **Import a backup:** preview per kind (new / updated / kept, or removed for Replace; Globals; history;
    "made without secrets"), then **Merge** (add new, update same id, keep the rest; Globals by name; history
    added) or **Replace** (exactly the backup, after a confirm).
  - **Sync across devices** (signed in, opt-in): collections, environments + Globals and scenarios. Secrets never
    leave the browser: they are removed before upload and filled back in from the device's own copy when a newer
    version arrives. `{{variable}}` references such as `Bearer {{token}}` are kept (they are not secrets; since
    2.1.1 — before, they were blanked too, so a new device or a cloud schedule got an empty token). History, run reports and the chosen environment stay per device. Device name, status
    (last sync, what was sent/received, conflicts, errors), **Sync now**, **Delete the cloud copy**.
  - Sync runs when the Workbench opens, a few seconds after any change, and every 5 minutes while it is open.
    Three-way merge per item (collection, environment, scenario) against the last synced copy: one-sided changes
    win; changed on both → the other device's version is kept and this one saved as "Name (conflict copy)";
    deletes apply unless the other side changed the item. Uploads name the version they replace, so two devices
    can't overwrite each other (the second merges and retries).
- **Worker:** `migrations/0017_extension_sync.sql` (table `extension_sync`, one row per user and kind, version
  counter) and `src/routes/extensionSync.js`: `GET /api/extension/sync`, `PUT /api/extension/sync/:kind`
  (`{ data, base_version, device }` → saved, or `{ conflict, current }`), `DELETE /api/extension/sync`. Signed-in
  only, per user, 900 KB per kind.
- Code: `shared/backup.js`, `shared/sync.js`, `workbench/sync.js`, `workbench/views/backup-dialog.js`,
  `workbench/history-store.js` (history export/import), `background/workbench/hitapi-sync.js`. Tests: 39 checks
  in the Workbench with two browsers as two devices against a local worker (`test13.cjs`) and 13 API checks
  (`sync_api.py`).

## What the user gets

- Everything (collections, environments, scenarios, settings; history optional) is stored locally and
  survives restarts.
- **Export all** → one `hitapi-backup-YYYY-MM-DD.json` file; secrets excluded unless the user ticks
  "include secrets" (with a warning).
- **Import backup** → merge or replace, with a preview of what changes.
- Storage usage meter (MB used of the local limit) and "clear history" shortcut.
- **Cloud sync with a HitAPI account** (HitAPI advantage over Talend Free): collections, environments
  (non-secret values) and scenarios sync across devices; conflict = newest wins, with a copy of the other.
  Optional — works fully offline without an account.

## Design

- `background/workbench/backup.js` (export/import, schema version field for future migrations).
- Sync uses a small worker API (`/api/extension/sync`, per user, stored in D1): see "What was built".

## Acceptance checklist

- [x] Export → remove extension → reinstall → import restores collections, environments, scenarios (tested as export → change the data → import back, merge and replace, in the same browser profile).
- [x] Export without "include secrets" contains no secret values.
- [x] Merge import doesn't duplicate existing items.
- [x] Sync: change on device A appears on device B after refresh.
