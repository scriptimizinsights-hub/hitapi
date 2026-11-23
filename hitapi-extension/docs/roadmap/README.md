# HitAPI Extension Roadmap: API Client Features

Plan for turning the HitAPI extension from a **capture tool** into a full **API client**, using
[Talend API Tester (Free Edition)](https://chromewebstore.google.com/search/Talend%20API%20Tester) as the
feature benchmark. Each feature has its own doc below and is built one at a time, in this order.

Status key: ✅ done · 🟡 partly there · ❌ missing · ⏸ later

## Where the extension stands today (v1.6)

The extension captures a tab's API calls, saves them as flow steps, runs flow suites, imports OpenAPI,
detects bearer tokens, reports bugs and runs localhost jobs (Local Agent). It **cannot build or send a
request, show a response, or keep a history** — which is what most of the Talend list depends on.

## Features, in build order

| # | Feature | Talend entries | Today | Doc |
|---|---------|----------------|-------|-----|
| 1 | Request Workbench (build and send requests) | 1–15 | ✅ v1.7.0 | [01-request-workbench.md](01-request-workbench.md) |
| 2 | Request body editor | 16–22 | ✅ v1.7.0 | [02-request-body.md](02-request-body.md) |
| 3 | Authentication | 23–28 | ✅ v1.7.0 | [03-authentication.md](03-authentication.md) |
| 4 | Response viewer | 29–39 | ✅ v1.7.0 | [04-response-viewer.md](04-response-viewer.md) |
| 5 | Request history | 40–45 | ✅ v1.7.0 | [05-request-history.md](05-request-history.md) |
| 6 | Collections (projects, services, saved requests) | 46–51 | ✅ v1.7.0 | [06-collections.md](06-collections.md) |
| 7 | Variables and environments | 52–58 | ✅ v1.7.0 | [07-variables-environments.md](07-variables-environments.md) |
| 8 | Assertions | 59–66 | ✅ v1.7.0 | [08-assertions.md](08-assertions.md) |
| 9 | Scenarios | 67–70 | ✅ v1.7.0 | [09-scenarios.md](09-scenarios.md) |
| 10 | Import and export (Postman, HAR, cURL, OpenAPI) | 71–76 | ✅ v1.7.0 | [10-import-export.md](10-import-export.md) |
| 11 | Data backup and sync | 77–81 | ✅ v1.7.0 (sync: deploy worker) | [11-data-backup-sync.md](11-data-backup-sync.md) |
| 12 | Automation (schedules, CI runner, API keys, GitHub) | 82–85 | ✅ v2.0.0 (keys: deploy worker + web app; CLI: npm publish) | [12-automation.md](12-automation.md) |

## Shared design (applies to every feature)

- **Where it lives:** a new full-page **Workbench** (`workbench/workbench.html`), opened in its own tab from
  the popup, the DevTools panel, the context menu, and from any captured request ("Open in Workbench").
  The popup is too small for a request editor.
- **Code layout:** follows the existing structure — UI in `workbench/` reusing `ui/core/` (`h()`, store,
  bridge); logic that must survive the page closing in `background/workbench/`; message names in
  `shared/messages.js`; storage keys in `background/storage.js`.
- **Sending requests:** from the Workbench page itself. It is an extension page with `<all_urls>` host
  access, so there are **no CORS limits** and `localhost`/intranet APIs work — the main advantage over web
  tools like ReqBin.
- **Storage:** `chrome.storage.local` (about 10 MB). History is capped; large response bodies are not
  kept in history. Adding the `unlimitedStorage` permission is an option but triggers a new Web Store review.
- **No new permissions** unless a doc says so (doc 1 lists one optional permission for browser-protected
  headers).
- **HitAPI advantages to keep visible:** AI test generation, AI failure explanations, mock servers,
  unlimited scenarios (Talend Free allows one), and optional cloud sync with a HitAPI account.

## Process

For each feature: confirm scope → build → test (manual checklist in the doc + automated checks where
possible) → update the doc's status and `docs/features/` → ask before starting the next one.
