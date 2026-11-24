# W8. Account storage, backup and sync with the extension

**Extension feature covered:** 11 Data backup and sync.
**Who:** everyone (backup file); signed-in users (account storage and sync).
**Status:** ✅ Built. No worker change (the website uses the existing `/api/extension/sync` route).

## Goal
Anonymous users can back up and restore everything with one file. Signed-in users have their collections,
environments and scenarios saved to their HitAPI account — **the same data in the website and the extension**,
on every device.

## User stories
1. Not signed in: I export everything to one file and import it on another computer (or into the extension).
2. I sign in on the website: the collections I made in the extension are there, and the reverse.
3. I made collections on the website before signing in: when I sign in, I'm asked whether to add them to my account.
4. I edit the same collection in the extension and on the website: nothing is lost (conflict copy).
5. My tokens and passwords never reach the server.

## Functional requirements
- R1. **Backup** dialog (header): storage used in this browser; **Export all** (`hitapi-backup` file: collections,
  environments, scenarios, settings; optional history; optional secrets with a warning); **Import a backup** with
  a preview (new / updated / kept / removed) and Merge or Replace (shared/backup.js).
- R2. Signed in: account storage is on by default for the website (opt-out in the dialog). Uses the existing
  `GET/PUT/DELETE /api/extension/sync` (kinds `collections`, `environments`, `scenarios`; 900 KB per kind;
  version check, conflict response).
- R3. Merge: the extension's three-way per-item merge (shared/sync.js `merge3`): one-sided changes win, both
  changed → the other side kept + "(conflict copy)", deletes applied unless changed on the other side.
- R4. Secrets stripped before upload and filled back from this browser (shared/sync.js `itemsOf` / `applyItems`).
  A new device shows empty secret fields with a "fill in" hint.
- R5. When to sync: on load, a few seconds after a change, every 5 minutes while open, on tab focus.
- R6. First sign-in with local data: dialog "Add the N collections from this browser to your account?" → merge /
  keep separate (stay local) / discard.
- R7. Sign out: account data removed from this browser (keep secrets? ask), local-only data kept.
- R8. Status in the header: ☁ Saved / Saving… / Offline / Conflict, with last sync time; "Delete the cloud copy".
- R9. The worker route is renamed in docs to "Workbench sync" (`/api/extension/sync` stays as is for the
  extension; the website uses the same route).

## Non-functional
- Sync of 500 requests (~300 KB) < 1 s on a normal connection; never blocks typing.
- Works offline: changes queue and sync when back online.

## Backend changes
- None required (route and table exist: migration 0017). Optional: rename `device` labels so the website shows as
  "Website (Chrome on macOS)".

## Reuse from the extension
`shared/backup.js`, `shared/sync.js`, `workbench/sync.js` (→ web version with localStorage).

## What was built
- **Toolbar button:** signed out "Backup"; signed in the account status — "Saved · 2 min ago", "Saving…",
  "Offline", "Not saved", "Not in account" — opening **Backup and sync**.
- **Backup and sync dialog:**
  - *Your HitAPI account* (signed in): "Keep my Workbench in my HitAPI account" (on by default), status with the
    last save and any conflict copies, this browser's name ("Website (Chrome on Mac)"), Save now, Delete the account
    copy (every device keeps its own copy). Signed out: a note and a sign-in link.
  - *In this browser:* space used by collections, environments, scenarios and history.
  - *Export everything:* a `hitapi-backup-YYYY-MM-DD.json` file (`shared/backup.js`), optionally with history and
    with secrets (warning).
  - *Import a backup:* preview per kind (new / updated / kept / removed, history, whether it has secrets), Merge or
    Replace (asks first). Backups from the extension import, and the extension reads the website's.
- **Account storage** (`sync.js`, the extension's algorithm): per kind (collections, environments + Globals,
  scenarios) download, three-way merge per item (`merge3`), save here, upload with the version it replaces
  (conflict → merge again). Secrets are removed before upload and filled back in from this browser
  (`itemsOf` / `applyItems`); a new computer gets empty secret fields. Scenario run reports stay in the browser.
- **When it saves:** on load, 3 s after a change, every 5 minutes, on tab focus, when back online. Offline
  changes stay here and are saved later.
- **First sign-in with data in this browser:** "Keep your Workbench in your account?" → Add them to my account
  (merged with what the account has) / Keep them in this browser only / Use only my account's (asks first).
  Without local data it just turns on.
- **Signed out:** "You signed out" → Remove it from this browser (still in the account) / Keep a copy here.
- **Files:** `sync.js`, `BackupDialog.jsx` (new); `Workbench.jsx`, `history-db.js` (`exportAll` / `importAll`),
  `workbench.css`.

## Acceptance checklist
- [x] Extension ↔ website: a collection made on one appears on the other (a real extension with sync on and the
  website, same account).
- [x] Both-sides edits produce a conflict copy, nothing lost.
- [x] Server copy contains no secret values (checked in the stored copy the server returns).
- [x] First sign-in with local data offers merge; Replace/Merge backup import shows a correct preview.
- [x] Offline edits sync later.
- [x] 500 requests (~300 KB) saved in well under a second.
