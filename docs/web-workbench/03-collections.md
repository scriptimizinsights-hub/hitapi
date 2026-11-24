# W3. Collections and the collection runner

**Extension feature covered:** 6 Collections.
**Who:** everyone (saved in this browser). Signed-in: saved to the account (W8 makes it the same as the extension's).
**Status:** ✅ Built (saved in the browser). Account storage comes with W8.

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

## What was built
- **Sidebar:** Collections and History share the sidebar (tabs at the top, plus **Collections** and
  **History (n)** buttons in the toolbar). On a wide screen it opens on Collections when you have saved requests,
  otherwise on History. Open/closed and the tab are remembered (`hitapi:web:side`).
- **Tree:** collections → folders → requests with method badges and counts; filter by name or URL; keyboard
  (Enter, arrows, F2 rename, Delete). Tested with 1 000 saved requests (filtering takes well under 0.4 s), so no
  virtual list was needed.
- **Save:** toolbar **Save** or Ctrl/⌘ + S; Ctrl/⌘ + Shift + S = Save as. The dialog picks a collection/folder or
  makes a new collection. New saved requests use **Inherit** auth (like the extension). A bar above the URL shows
  `Collection / Folder / Request`, "● edited" / "✓ saved", **Save**, **Save as…** and **Detach**.
  Opening another request (from the tree, History, a sample, cURL import or New request) with unsaved changes asks
  first. If the open saved request is deleted, its edits stay in the editor, unsaved.
- **⋯ menu:** new request here (opens it with the name ready to type), new folder, run, settings, rename,
  duplicate, move to…, export, send to a HitAPI project, delete (asks first).
- **Drag and drop** to reorder or move (same `canMove` rules: collections only reorder at the top level).
  **Move to…** does the same without dragging (phones, keyboard).
- **Settings:** collection = name, base URL, headers, auth; folder = name, headers, auth (default Inherit).
  Requests show what they inherit: the full URL under the URL box for "/…" URLs, inherited headers in the
  Headers tab (crossed out when the request's own header replaces one), and "Inherited from …" in the Auth tab.
  Send, Code, Copy as cURL and History all use the request as sent (`effectiveDraft`).
  Collection/folder **variables** arrive with W4.
- **Runner:** in place of the response; every request in order with the chosen send mode; ✓/✗, status, time,
  size, totals, progress bar, Stop, Run again, wait between requests (remembered), click a result to open it with
  its response and "← Back to the run results". Pass rule is the extension's: all tests pass, or no tests and a
  status below 400. Results are kept in History. **HitAPI cloud limit:** when the cloud answers "too many
  requests" the run pauses until the next minute (counting down) and carries on with the same request.
- **Export / import** one collection as a HitAPI collection file (`.hitapi.json`), secrets left out unless
  ticked. Postman files get an explanation (Postman import is W7).
- **HitAPI projects (signed in):** "Send to a HitAPI project" (new or existing project; requests outside the
  project's base URL are listed and left out; endpoints already there are skipped; the collection remembers the
  project) and "From HitAPI" (a collection from a project's endpoints). Signed out, both ask you to sign in.
- **Storage:** `localStorage` key `hitapi:web:collections` (same shape as the extension's `wb:collections`);
  other tabs update at once; a warning above 4 MB; a clear message if storage is full or blocked. Signed-in
  users also store in the browser for now, with a note in the sidebar.
- **Files:** `src/components/workbench/collections-store.js`, `CollectionsPanel.jsx`, `CollectionDialogs.jsx`,
  `Runner.jsx` (new); `Workbench.jsx`, `RequestTabs.jsx`, `HistoryPanel.jsx`, `workbench.css` (changed).
  No worker change.

## Acceptance checklist
- [x] Save, Save as, rename, duplicate, delete, move (drag and drop) all persist after reload.
- [x] Base URL, headers and auth inherit exactly like the extension (the same shared code; checked end to end:
  collection base URL + header + bearer, folder header + Basic, request's own header and auth win).
- [x] Runner results match the extension for the same collection (same pass rule).
- [x] A collection exported from the website imports into the extension and the reverse (checked with the
  extension's own export/import code).

## Open questions
1. ~~Limit for anonymous storage~~ Decided: warn at 4 MB and suggest exporting; a full storage gives a clear
   message and nothing is lost from the editor.
