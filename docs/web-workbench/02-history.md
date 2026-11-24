# W2. History

**Extension feature covered:** 5 Request history.
**Who:** everyone (kept in this browser). Signed-in: optional account copy (see Open questions).
**Status:** ✅ Built (browser history). Account copy not built (see Open questions).

## Goal
Every request sent from the Workbench is kept with its response, so users can find, reopen and resend it.

## User stories
1. I find "that request from yesterday" by typing part of the URL or response.
2. I reopen a past request with its response and resend it.
3. I see only failed requests (4xx/5xx/errors) to debug.
4. My tokens are not stored in history.

## Functional requirements
- R1. Every send is recorded: request (template, `{{vars}}` kept from W4 on), resolved URL, status, time, size,
  response (body capped at 1 MB per entry), test summary (from W5).
- R2. Sidebar tab **History**: grouped by day (Today, Yesterday, date), newest first, method + path + host +
  status + time.
- R3. Search box (URL, method, status, body text) and filters: status class (2xx, 3xx, 4xx, 5xx, errors, tests
  failed), method, host.
- R4. Click → opens the request and shows the stored response with a "from history" banner; **Resend** button.
- R5. Delete one, clear all, clear older than 7/30 days; settings: on/off, hosts to skip, max entries.
- R6. Secrets hidden by default: Authorization/Cookie/API-key headers and auth fields masked
  (shared/history.js `maskDraft`); secret variable values blanked from stored responses. Reopening fills secrets
  back from the current request where possible (`restoreSecrets`).
- R7. Export / import history (part of the backup file, W8).
- R8. Storage: **IndexedDB** (one record per entry + an index), max 500 entries / 25 MB, oldest dropped first;
  migrate the 25 items from today's `apiforge.playground.history` once.

## Non-functional
- Opening the History tab with 500 entries: < 200 ms. Writing an entry never blocks the UI.
- Works when storage is full or blocked (private mode): Workbench still sends, history shows "not available".

## Backend changes
None for the browser history.

## Reuse from the extension
`shared/history.js` (masking, search text, filters, day groups). New: an IndexedDB store with the same API as
`workbench/history-store.js`.

## What was built
- **Where:** a History panel beside the request (toolbar button **History (n)**). Open by default on wide
  screens (≥ 1280 px); on phones it shows below the request bar. Open/closed is remembered.
- **Storage:** IndexedDB database `hitapi-web` (stores `index` and `entries`). Max 100 / 250 / 500 entries
  (setting, default 500), 25 MB total, 1 MB per response body; oldest dropped first. Binary bodies aren't kept
  (reopening says so). If IndexedDB is unavailable (private mode) the page keeps this tab's requests in memory
  and says history isn't available.
- **Panel:** grouped by Today / Yesterday / date; search over URL, method, status, request and response body;
  filters for status (2xx, 3xx, 4xx, 5xx, Failed), method and host; paged at 150 (Show more); delete one.
- **Reopen:** fills the request, shows the stored response with a "From history · time" banner and a
  **Resend** button. Tokens are filled back from the current request; if there is none it lists what to fill in.
- **Settings:** on/off, keep at most, hosts to skip, clear older than 7 / 30 days, clear all (with confirm).
- **Secrets:** Authorization, cookies, API keys and auth fields are masked (`shared/history.js` `maskDraft`) and
  their values scrubbed from stored responses.
- **Migration:** the W1 "Recent" list (`hitapi:web:recent`) and the old playground history
  (`apiforge.playground.history`) are moved in once (flag `hitapi:web:historyMigrated`).
- **Tabs:** other open tabs update at once (BroadcastChannel).
- **Later features:** the "tests failed" filter arrives with W5; history export/import with the backup file in W8.
- **Files:** `src/components/workbench/history-db.js` (new), `HistoryPanel.jsx` (new), `Workbench.jsx`,
  `ResponseView.jsx`, `core.js`, `workbench.css`.

## Acceptance checklist
- [x] Every send appears at once; search and every filter work; Resend sends the same request.
- [x] No token, password, API key or cookie value is stored (checked in IndexedDB).
- [x] Old playground history is migrated once.
- [x] Entry limit and "clear older than" work; private mode doesn't break the page.

## Open questions
1. Signed-in users: keep history only in the browser (like the extension), or also a small account copy (last
   100, no bodies)? Recommendation: browser only for now — history can contain personal data.
