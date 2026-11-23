# W8. Account storage, backup and sync with the extension

**Extension feature covered:** 11 Data backup and sync.
**Who:** everyone (backup file); signed-in users (account storage and sync).
**Status:** 📝 Requirements.

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

## Acceptance checklist
- [ ] Extension ↔ website: a collection made on one appears on the other after a refresh (both signed in).
- [ ] Both-sides edits produce a conflict copy, nothing lost.
- [ ] Server copy contains no secret values (checked in D1).
- [ ] First sign-in with local data offers merge; Replace/Merge backup import shows a correct preview.
- [ ] Offline edits sync later.
