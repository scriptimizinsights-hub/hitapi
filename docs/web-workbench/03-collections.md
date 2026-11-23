# W3. Collections and the collection runner

**Extension feature covered:** 6 Collections.
**Who:** everyone (saved in this browser). Signed-in: saved to the account (W8 makes it the same as the extension's).
**Status:** 📝 Requirements.

## Goal
Save requests in collections and folders, share settings (base URL, headers, auth) down the tree, and run a whole
collection or folder.

## User stories
1. I save the request I'm working on into "Shop API / Orders".
2. I set the base URL and a bearer token once on the collection; every request uses them.
3. I reorganise by drag and drop, rename, duplicate, delete.
4. I run a folder and see which requests passed or failed.
5. Signed in, I open the website on another computer and my collections are there.

## Functional requirements
- R1. Sidebar tab **Collections**: tree of collections → folders → requests with method badges, counts, filter.
- R2. Save / Save as… (choose collection/folder or a new collection); breadcrumb + "saved / edited" state; unsaved
  changes warned before leaving a request (shared/collections.js `isDirty`).
- R3. ⋯ menu: new request here, new folder, rename, duplicate, delete (confirm), settings, run, export.
- R4. Drag and drop to move requests and folders (collections stay at the top level: `canMove`).
- R5. Collection settings: base URL (requests starting with `/` use it), headers, auth, variables (from W4).
  Folder settings: headers, auth (default "inherit"), variables. Request auth "Inherit" shows what it uses.
  (`effectiveDraft`, `inheritedAuth`, `inheritedHeaders`).
- R6. Runner: runs every request in a collection/folder in order, with the chosen send mode; shows each result
  (status, time, pass/fail), totals, a progress bar, stop, run again, open a result in the editor; optional delay.
- R7. Import / export of a single collection in the HitAPI format (full import/export is W7).
- R8. Signed in: "Send to a HitAPI project" (create endpoints from a collection) and "From HitAPI" (collection from a
  project's endpoints) — the extension's push/pull, using the existing project APIs.
- R9. Storage: anonymous → localStorage (`wb:collections` shape, one JSON value); signed-in → account
  (`/api/extension/sync` kind `collections`, secrets removed, per-item merge — W8). Until W8 is built, signed-in
  users also store in the browser, with a note.

## Non-functional
- 1 000 requests in the tree: tree renders and filters without lag (virtualised list if needed).
- Runner: 100 requests run with the cloud mode's rate limit respected (pauses and says so instead of failing).

## Backend changes
None for anonymous. Signed-in storage uses the existing sync endpoint (W8 adds the merge UI).

## Reuse from the extension
`shared/collections.js` (tree, move, inheritance, export/import, endpoints conversion), runner pass/fail rule.

## Acceptance checklist
- [ ] Save, Save as, rename, duplicate, delete, move (drag and drop) all persist after reload.
- [ ] Base URL, headers and auth inherit exactly like the extension (same cases as the extension's tests).
- [ ] Runner results match the extension for the same collection.
- [ ] A collection exported from the website imports into the extension and the reverse.

## Open questions
1. Limit for anonymous storage (localStorage ~5 MB): warn at 4 MB and suggest signing in or exporting?
