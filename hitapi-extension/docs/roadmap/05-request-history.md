# 5. Request History

**Talend parity:** #40–45 (store, view, search, edit, resend, inspect historical responses).
**Status:** ✅ Done in v1.7.0 (user guide: [Request Workbench → History](../features/request-workbench/README.md#history)).

### What was built
- Every Workbench send is recorded (success and failure; cancelled sends and requests that could not be built
  are not): the full request and the response (body up to 256 KB; image, PDF and binary bodies are not kept).
- History column at the left of the Workbench (open by default in a wide tab, closed in the DevTools panel,
  floating over the page in narrow windows; shown/hidden from the header button, remembered). Since feature 6 it is the History tab of the sidebar.
  Grouped by day; each row shows method, path, host, time, duration, size and status.
- Search (URL, method, status, request body, start of the response) and filters by method, status
  (2xx/3xx/4xx/5xx/failed) and host. Long lists are drawn 150 at a time.
- Click a row: the request opens for editing, with Undo; the old response is shown greyed with a
  "Response from history" note until you send again.
- Secrets are not kept by default (Authorization, Cookie, API-key headers and the Auth tab's token,
  password, API key, header value and client secret). When an entry is opened they are filled in from the
  request you have open now; anything still missing is named in the note.
- Delete one (✕ on hover), **Clear older than 7 days**, **Clear all**. Kept to 500 entries and about 5 MB;
  the oldest go first.
- ⚙ settings: keep history on/off, don't keep secrets on/off, hosts not to record (`bank.com, *.internal`).
- Captured requests (popup and DevTools) got **↻ Resend**: opens the Workbench and sends at once, so the
  result lands in history.
- Storage: an index (`wb:history`) plus one key per entry (`wb:h:<id>`), so the sidebar never loads bodies;
  settings in `wb:historySettings`. Several Workbench tabs stay in sync. Code: `shared/history.js`,
  `workbench/history-store.js`, `workbench/views/history-sidebar.js`.
- Tests: 53 checks (`test7.cjs`).

## What the user gets

- Every request sent from the Workbench is added to **History** automatically: method, URL, status, time,
  date, plus the full request and a copy of the response (body up to 256 KB).
- History sidebar grouped by day (Today, Yesterday, …), **search** by URL/method/status/body text,
  filters (method, status 2xx/4xx/5xx, host).
- Click an entry → opens it in the Workbench to **edit and resend**; the old response is shown greyed until
  you send again (#45).
- Captured requests get **"Resend"** and **"Open in Workbench"** buttons (closes the gap with the capture feature).
- Delete one entry, clear all, or "clear older than 7 days". Keeps the latest 500 entries.
- Setting to **not** record history for selected hosts (e.g. banking sites).

## Design

- `background/workbench/history.js` (add / list / search / delete), storage key `wb:history` in
  `chrome.storage.local`; entries stored newest-first with a size cap (~5 MB total).
- Credentials in history: kept locally (needed for resend); a setting **"mask secrets in history"** (on by
  default) stores auth headers masked and re-asks on resend.
- `workbench/views/history-sidebar.js`.

## Acceptance checklist

- [x] Sending 3 requests shows 3 history entries with correct status/time.
- [x] Search "users" finds matching URLs; status filter 4xx works.
- [x] Opening an entry, editing the URL and resending creates a new entry.
- [x] History survives closing Chrome; 501st entry drops the oldest.
- [x] "Resend" on a captured request works.
