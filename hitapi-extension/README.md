# HitAPI browser extension

Chrome extension (Manifest V3) for [HitAPI](https://hitapi.dev). It captures a site's API calls, turns them into test steps, imports OpenAPI specs, runs flow suites, and runs localhost test steps through the Local Agent.

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
│   └── headers.js          which headers are saved, dropped or masked
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
│       ├── capture-panel.js  request-row.js
│       └── suites-panel.js
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
