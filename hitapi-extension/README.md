# HitAPI browser extension

Chrome extension (Manifest V3) for [HitAPI](https://hitapi.dev). It builds and sends API requests in the Request Workbench, captures a site's API calls, turns them into test steps, imports OpenAPI specs, runs flow suites, and runs localhost test steps through the Local Agent. Planned features: [roadmap](docs/roadmap/README.md).

## Install for development

1. Open `chrome://extensions` and turn on **Developer mode**.
2. Select **Load unpacked** and choose this `hitapi-extension` folder.
3. After changing code, select the reload icon on the extension card.

To point at a local backend, change `API_BASE` in `shared/config.js`.

## Folder structure

```
hitapi-extension/
├── manifest.json
├── shared/                 used by both the background and the UI
│   ├── config.js           API URL, limits, timings
│   ├── messages.js         message, event and error names
│   ├── url.js              origin/path helpers, capture filter, isLocalUrl
│   ├── headers.js          which headers are saved, dropped or masked
│   ├── http.js             Workbench: URL ↔ params, header kinds, methods
│   ├── body.js             Workbench: body types, JSON/XML checks, building the body
│   ├── auth.js             Workbench: auth types and the header/query they add
│   ├── response.js         Workbench: body kinds, cookies, Link headers, JSON paths, timing
│   ├── curl.js             Workbench: parse a cURL command, copy a request as cURL
│   ├── history.js          Workbench: history helpers (hide secrets, filter, group by day)
│   ├── collections.js      Workbench: collection tree, inheritance, export/import, HitAPI endpoints
│   ├── vars.js             Workbench: {{variables}}, environments, dynamic values, Set vars rules
│   ├── assert.js           Workbench: Tests tab checks, JSON Schema and XPath, suggested checks
│   ├── scenarios.js        Workbench: scenario runs, data files, flow suite conversion
│   ├── convert/            Workbench: import/export (Postman, OpenAPI, HAR, Insomnia) and code snippets
│   ├── backup.js           Workbench: backup file (export, preview, merge/replace import)
│   ├── sync.js             Workbench: what syncs across devices, secrets out/in, three-way merge
│   ├── schedules.js        Workbench: scheduled runs (data model, run records, notifications)
│   └── ci.js               Workbench: files for the hitapi CLI and GitHub (scenario export, workflow)
│
├── background/             service worker (no UI)
│   ├── index.js            entry point: registers everything
│   ├── router.js           message type → handler
│   ├── live.js             pushes live updates to open popups/panels
│   ├── storage.js          storage keys; local vs session storage
│   ├── api/client.js       HitAPI HTTP client (throws on every failure)
│   ├── auth/session.js     sign in, sign out, expired sessions
│   ├── capture/
│   │   ├── listeners.js    webRequest listeners (per tab, cross-origin)
│   │   ├── store.js        per-tab state, saved to storage.session
│   │   └── service.js      start / stop / clear / look up a request
│   ├── flows/
│   │   ├── projects.js     list / create projects
│   │   └── flows.js        list / run suites, save captured requests
│   ├── bugs/bugs.js        bug reports with request details
│   ├── openapi/import.js   download + parse JSON/YAML specs
│   ├── agent/local-agent.js  Local Agent job loop
│   ├── workbench/
│   │   ├── open.js         open/focus the Workbench, hand over a captured request
│   │   ├── entry.js        Alt+Shift+H shortcut, welcome tab on install, "New" after update
│   │   ├── protected-headers.js  temporary rules for Cookie/Origin/Referer/User-Agent
│   │   ├── net-errors.js   the real reason a Workbench request failed
│   │   ├── tokens.js       bearer tokens seen while capturing (Auth tab)
│   │   ├── hitapi-sync.js  collections ↔ project endpoints, scenarios ↔ flow suites, data sync
│   │   ├── scheduler.js    scheduled runs: chrome.alarms, runs in the worker, notifications
│   │   └── web-bridge.js   lets hitapi.dev send requests through the extension (after the user allows it)
│   └── ui/
│       ├── badge.js        toolbar badge
│       └── context-menu.js right-click menu
│
├── ui/                     shared app, used by the popup AND the DevTools panel
│   ├── app.js              layout; decides which region redraws when
│   ├── actions.js          everything the UI can do
│   ├── styles.css
│   ├── core/
│   │   ├── bridge.js       call() / subscribe() to the background
│   │   ├── store.js        small observable state
│   │   └── dom.js          h(), toast, withBusy, copy
│   └── views/              one file per part of the screen
│       ├── login.js  header.js  agent-bar.js  monitor-bar.js  tabs.js
│       ├── project-bar.js  openapi-import.js  footer.js
│       ├── workbench-card.js  sign-in-prompt.js   (no sign-in wall)
│       ├── capture-panel.js  request-row.js
│       └── suites-panel.js
│
├── workbench/              Request Workbench (full tab)
│   ├── workbench.html  main.js  workbench.css
│   ├── connect.html  connect.js  allow / remove websites that use the extension (hitapi.dev)
│   ├── state.js            the draft, saved to chrome.storage.local
│   ├── send.js             sends the request, reads the response
│   ├── oauth.js            OAuth 2.0 client-credentials tokens (session cache)
│   ├── history-store.js    request history (index + one entry per request)
│   ├── collections-store.js  saved requests: collections and folders
│   ├── env-store.js        environments and global variables
│   ├── scenarios-store.js  scenarios
│   ├── sync.js             backup & sync with a HitAPI account
│   ├── run-core.js         runs one request like every runner (also used by the service worker)
│   ├── schedules-store.js  scheduled runs
│   ├── github.js           Publish to GitHub (contents API)
│   └── views/              request-bar, request-tabs, kv-table, curl-dialog, auth-pane, history-sidebar,
│       │                   collections-pane, collection-dialogs, runner, env-dialog, vars-table, extract-pane,
│       │                   tests-pane, scenarios-pane, scenario-editor, scenario-dialogs,
│       │                   import-dialog, code-dialog, backup-dialog, schedule-dialog, github-dialog
│       ├── response/       viewer, json-tree, xml-tree
│       └── body/           Body tab: body-pane, code-editor, form-table
│
├── popup/                  toolbar popup: popup.html + main.js
├── devtools/               DevTools page + "HitAPI" panel
├── lib/js-yaml.mjs         YAML parser (js-yaml 4.1.0, MIT)
├── icons/
└── docs/features/          how each feature behaves
```

## How the pieces talk

- **UI → background:** `call(MSG.X, payload)` from `ui/core/bridge.js`. It resolves with data or throws an error with a message the user can read; `err.code` is set for an expired session.
- **Background → UI:** live events (`requests`, `monitor`, `agent`, `auth-expired`) over a port named `hitapi-live`. The UI reconnects by itself if Chrome restarts the background worker.
- **Background → HitAPI:** only through `background/api/client.js`.

## Adding a feature

1. Background logic goes in a module under `background/<area>/`.
2. Add a message name to `shared/messages.js`, and map it in `background/router.js`.
3. Add an action in `ui/actions.js`, and a view (or a change to one) in `ui/views/`.
4. Document it in `docs/features/`.
