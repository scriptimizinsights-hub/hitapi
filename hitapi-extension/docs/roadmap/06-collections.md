# 6. Collections: Projects, Services, Saved Requests

**Talend parity:** #46–51 (project management, services, request organisation, repository, navigation,
saved requests).
**Status:** ✅ Done in v1.7.0 (user guide: [Request Workbench → Collections](../features/request-workbench/README.md#collections)).

### What was built
- Sidebar with two tabs, **Collections** and **History** (☰ Collections & History in the header shows/hides it).
- **Collections → folders (any depth) → saved requests.** + Collection, ⋯ menu on every row (new request,
  new folder, run, settings, rename, duplicate, export, send to HitAPI, delete), double-click or F2 to rename,
  Delete key, arrow keys to open/close. **Drag and drop** to reorder or move into another folder/collection.
  Filter box. Open/closed folders remembered.
- **Save** (Ctrl/⌘+S) / **Save as** (Ctrl/⌘+Shift+S): dialog with name and "Save in" (any collection/folder
  or a new collection). The open saved request shows a breadcrumb with "● edited" / "✓ saved", Save, Save as,
  Detach. Switching away from unsaved changes asks first; opening a saved request over an unsaved one has Undo.
- **Collection settings:** base URL, headers, auth. **Folder settings:** headers, auth (Inherit by default).
  Requests: URL starting with "/" goes after the base URL (shown under the URL bar), folder and collection
  headers are added (own header wins, shown crossed out), Auth tab **Inherit** (default for saved requests)
  uses the nearest folder/collection auth. History and Copy as cURL get the full request.
- **Runner:** run a collection or folder in order; pass = status below 400; progress bar, Stop, Run again,
  optional wait between requests; click a result to open the request with that response, then back.
- **Export/import** HitAPI collection files (`.hitapi.json`), secrets left out unless ticked. Postman files
  get a clear message (Postman import is feature 10).
- **HitAPI projects** (signed in): *Send to a HitAPI project* adds saved requests as endpoints (path relative
  to the project base URL; existing method+path skipped; requests outside the base URL left out and listed;
  no secrets), or creates a new project. *⚡ From HitAPI* builds a collection from a project's endpoints
  (folder per tag, query params, example JSON body, base URL).
- Storage: `wb:collections` in `chrome.storage.local`, shared live between open Workbenches. Code:
  `shared/collections.js`, `workbench/collections-store.js`, `workbench/views/{collections-pane,
  collection-dialogs,runner}.js`, `background/workbench/hitapi-sync.js`. Tests: 71 checks (`test8.cjs`).
- Not done here: variables in URLs (feature 7) and assertions in the runner (features 8 and 9).

## What the user gets

- A **Repository** sidebar: **Projects → Services (folders) → Requests**, drag and drop to reorder or move,
  rename, duplicate, delete.
- **Save** (Ctrl/Cmd+S) a Workbench request into any folder; "Save as" for a copy.
- Project- and service-level settings inherited by requests: **base URL**, **headers**, **auth**
  ("Inherit from collection" in doc 3).
- Run a whole folder in order (simple runner; full scenarios in doc 9).
- **Link to a HitAPI project** (signed-in users): push saved requests as HitAPI endpoints so the web app can
  generate AI tests and mocks for them; pull a project's endpoints into a collection. This is HitAPI's edge
  over a purely local client.

## Design

- `background/workbench/collections.js`, storage key `wb:collections` (tree in `chrome.storage.local`).
- Model: `{ id, type: 'project'|'service'|'request', name, children, settings, request }`.
- Sync uses existing HitAPI API endpoints (`/projects`, `/projects/:id/endpoints`) via `background/api/client.js`;
  secrets masked before upload (same rules as flow suites).

## Acceptance checklist

- [x] Create project → service → save 2 requests; reload; tree is unchanged.
- [x] Drag a request to another service; rename; delete with confirm.
- [x] Base URL `https://api.example.com` on the project + request path `/users` sends to the full URL.
- [x] Signed-in: push a collection to a HitAPI project; endpoints appear in the web app.
