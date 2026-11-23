# HitAPI Web Workbench — plan

Bring everything the HitAPI extension (v2.0) can do to the **hitapi.dev website**, free, for:

- **Anyone (not signed in):** works in the browser, nothing to install, data kept in this browser.
- **Signed-in users:** the same, plus data saved to their account (the same data as the extension, on every
  device) and things that need a server (scheduled runs when the browser is closed, sharing).

Each feature has its own requirements file. They are built **one at a time, in this order**; before starting the
next one we review what was built.

## What the extension has today (v2.0)

| # | Extension feature | What it does |
|---|---|---|
| 1 | Request Workbench | Any method, URL ↔ params sync, headers, cURL import / copy, Ctrl+Enter, drafts kept |
| 2 | Body editor | JSON, XML, text, form URL-encoded, multipart form (files), binary file, GraphQL |
| 3 | Authentication | Bearer, Basic, API key (header/query), custom header, OAuth 2.0 client credentials, inherit |
| 4 | Response viewer | JSON tree with search, raw, HTML/image/PDF preview, headers, cookies, timing, redirects |
| 5 | History | Every request with its response, search, filters, grouped by day, secrets hidden |
| 6 | Collections | Collections → folders → requests, base URL / headers / auth inherited, drag & drop, runner |
| 7 | Variables & environments | `{{vars}}`, environments, globals, collection vars, dynamic values, "Set vars" from responses |
| 8 | Tests | Status, header, JSONPath, XPath, time, body / regex / JSON Schema checks, suggested checks |
| 9 | Scenarios | Chained requests, delays, repeat, stop/continue on failure, data-driven (CSV/JSON), reports |
| 10 | Import / export | Postman, OpenAPI/Swagger, HAR, Insomnia, cURL; code snippets in 6 languages |
| 11 | Backup & sync | Backup file, import with preview, sync with a HitAPI account across devices |
| 12 | Automation | Scheduled runs + notifications, `hitapi-cli` for CI, personal API keys, Publish to GitHub |

## What the website has today

- **`/playground`** (public, no login): one request at a time; method, URL, params, headers, JSON / text body,
  bearer / basic auth, code snippets, cURL paste, history of the last 25 requests (localStorage). Sends through
  **HitAPI's server** (`POST /api/public/request`: 60 requests/min, 15 s timeout, 1 MB request / 2 MB response,
  private and local addresses refused) or **straight from the browser** (target must allow CORS).
- **Signed-in app:** projects, endpoints, AI-generated tests, executions, flow suites (cloud runs), mock servers,
  Live Fetch, project settings, API keys (`/account/api-keys`). "Monitors" is a placeholder; the worker already has
  a `scheduled()` handler and a `monitors` table.
- **Worker APIs we can reuse:** `/api/public/request` (proxy), `/api/extension/sync` (stores collections,
  environments and scenarios per user — the same format the website will use), `/api/keys`, flow suites.

## Features, in build order

| # | Web feature | Extension features | Anyone | Signed in | Doc |
|---|---|---|---|---|---|
| W1 | Web Workbench: request builder + response viewer ✅ | 1, 2, 3, 4 | ✅ | ✅ | [01-web-workbench.md](01-web-workbench.md) |
| W2 | History | 5 | ✅ browser | ✅ + account (opt-in) | [02-history.md](02-history.md) |
| W3 | Collections + runner | 6 | ✅ browser | ✅ account | [03-collections.md](03-collections.md) |
| W4 | Variables and environments | 7 | ✅ | ✅ | [04-variables-environments.md](04-variables-environments.md) |
| W5 | Tests | 8 | ✅ | ✅ | [05-tests.md](05-tests.md) |
| W6 | Scenarios | 9 | ✅ | ✅ | [06-scenarios.md](06-scenarios.md) |
| W7 | Import and export | 10 | ✅ | ✅ | [07-import-export.md](07-import-export.md) |
| W8 | Account storage, backup and sync with the extension | 11 | backup file | ✅ sync | [08-storage-sync.md](08-storage-sync.md) |
| W9 | Automation: cloud schedules, CLI, API keys, GitHub | 12 | — | ✅ | [09-automation.md](09-automation.md) |

Why this order: W1 is what everything else sits on (and what search traffic lands on). W2–W7 follow the order the
extension was built in, because each one uses the one before (scenarios need saved requests, variables and
tests). W8 and W9 need an account and the server.

## Decisions that apply to every feature

### 1. One codebase for the logic, two UIs
The extension's `hitapi-extension/shared/` is plain JavaScript with no Chrome APIs (requests, body building, auth,
variables, tests, scenarios, collections, import/export, codegen, sync merge). The website **imports the same
files** instead of rewriting them, so a collection behaves the same in the extension, the website and the CLI.
- How: a Vite alias `@hitapi/shared` → `../hitapi-extension/shared` (the frontend is built from the repo by
  `npm run deploy`). Fallback if the build ever runs from `frontend/` alone: a copy script like `cli/scripts/copy-shared.mjs`.
- The UI is new React code in the site's style (the extension's UI is plain DOM code).
- Files that are browser-extension only (`workbench/send.js`, the `*-store.js` files) get small web versions.

### 2. Same data format as the extension
Collections tree, environments, scenarios, history entries and backup files use the extension's formats
(`hitapi-collection`, `hitapi-scenario`, `hitapi-backup`). So: export from one, import into the other; signed-in
users see the same collections in both; the CLI runs files from either.

### 3. Where requests are sent from (the browser can't do everything)
A web page can't do what an extension can (no CORS bypass, no Cookie/Origin headers, no localhost from a
server). Three send modes, chosen per request with a clear label:

| Mode | Reaches | Limits | Default when |
|---|---|---|---|
| **HitAPI cloud** (`/api/public/request`) | public internet APIs, no CORS problems | rate limit, 15 s, 1 MB / 2 MB, no private/local addresses | public URL |
| **This browser** | anything that allows CORS, incl. localhost | target must send CORS headers; browser-forbidden headers dropped | localhost / private IP |
| **HitAPI extension** (if installed) | everything the extension can: localhost, no CORS, protected headers, cookies | needs extension 2.1+ (`externally_connectable` for hitapi.dev) | extension detected and user turned it on |

### 4. Free for everyone, with fair limits
No paywall for any feature in this plan. Limits only protect the server:
- Cloud send: anonymous 60 requests/min per IP (today); signed-in 300/min per user (proposal).
- Account storage: 900 KB per kind (collections / environments / scenarios) as for extension sync; history in
  the browser only (W2 decides whether a small synced history is worth it).
- Cloud schedules (W9): signed-in only, e.g. up to 10 schedules, every 5 minutes at most (proposal).

### 5. Secrets
- In the browser they stay in localStorage / IndexedDB (same warning as the extension: "kept in this browser").
- Anything saved to the account or exported has secrets removed (the extension's `maskDraft` / `sync.js` rules).
- The cloud proxy must **never log** request headers, bodies or responses (check `withRequestLog`); the privacy
  page must say so.

### 6. Pages and SEO
- Public Workbench stays at **`/playground`** (it already ranks; see the pending SEO plan for "api testing online
  free"), with a full-width layout and its own landing copy. Signed-in users get the same Workbench inside the app
  shell at **`/workbench`**, with their account data.
- Every public page must still prerender (the site uses `scripts/prerender.mjs`).

### 7. Quality bar (same as the extension)
Each feature: requirements file → build → automated tests (Playwright against `vite preview` + local worker) →
docs updated → review → next feature. Mobile: usable at 375 px wide (stacked layout). Keyboard: Ctrl/⌘+Enter
sends, every control reachable by Tab.

## Decisions made for W1

1. Public URL stays `/playground`; signed-in users also have `/workbench` in the app.
2. Signed-in cloud limit: 300 requests/min (anonymous: 60 per IP).
3. The website can send through the extension (extension 2.1.0).
4. The old playground UI is replaced (its history is moved to Recent).

## Open questions (later features)

1. Cloud schedules (W9): limits per user (10 schedules, 5-minute minimum)? Email alerts as well as in-app?

## Status

| # | Status |
|---|---|
| W1 | ✅ Built — deploy worker + frontend, publish extension 2.1.0 |
| W2–W9 | 📝 Requirements written, not started |
