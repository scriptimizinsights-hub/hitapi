# W10 — Visual flow builder (drag and drop, connect, pass data)

**Status:** ✅ Built in the Workbench (scenarios). Website only: no worker or extension change. The project Flow Suites page is the next part (see the end).

## Goal
Build an API test by **dragging requests onto a canvas, one after another**. The step that needs data from an earlier
step gets it **on the connection between them**: "Login → `token` → Get profile (Authorization)". The flow shows what
is still missing before it runs, runs in place and shows each step's result on its card.

Today the same thing is possible in a Scenario, but by hand: write a "Set vars" rule (`token = $.data.token`) in one
request, then type `{{token}}` in the next one. You have to know the response's shape and keep the names in step. The
builder makes that visible and point-and-click.

## Who can use it
Everyone who can open the Workbench (signed out too). Signed-in users also get:
- the endpoints of their HitAPI projects (from Swagger imports) in the palette, with their parameters and body schema;
- the flow in their account (W8 sync), cloud schedules (W9), CI and Publish to GitHub.

## A flow is a Scenario
The builder is a second **view of a Scenario**, not a new kind of thing. A flow saves as a scenario's steps plus
"Set vars" rules plus `{{variables}}`, so the runner, data rows, schedules, the CLI, sync and export keep working
unchanged, and a flow can be opened as a list (the W6 editor) or as a canvas.
Only the canvas layout and the connection labels are new (`scenario.flow = { links: […] }`; old readers ignore it).

## What was built (as in the approved mockup)
- **List / Canvas** switch at the top of every scenario; the choice is saved with it. The canvas gets the whole width
  (the Collections / Scenarios panel steps aside while it's open).
- **Left — steps to add:** saved requests by collection, search, and (signed in) the endpoints of a HitAPI project
  (project picker), plus "New request". Drag one onto the canvas (dropped on a card: it runs right after that card),
  or press **+** to add it at the end. A project endpoint becomes a copy kept in the flow, with the project's base
  URL, a "status is 2xx" check, and what the Swagger spec says it needs (path / required header and query
  parameters) and gives (response example or schema).
- **Middle — the canvas:** cards placed anywhere (positions saved), dot grid, pan by dragging the background, zoom
  (buttons, Ctrl/⌘ + wheel), **Fit**, **Arrange** (a grid by run order). A green line with an arrow joins each step
  to the next: that is the run order. **Drag from a card's right port onto another card** and that card runs right
  after it. Where data skips steps (step 1's token used in step 3) a dashed blue line is drawn. Each line is labelled
  with the values it passes on (click it to edit). New cards never land on top of others.
- **Each card:** method, name, step number, URL, a badge (READY, n MISSING, the status after a run, ERROR, OFF), time,
  tests passed, and chips: what it still needs (red), what is filled (blue), what it gives (green). The toolbar shows
  "n inputs missing" (click: the first one).
- **Right — the selected step:** *Configure*: the request (Open to edit), **Inputs this request needs** — each path
  parameter (`/users/{id}`, `/users/:id`), each `{{variable}}` and each required Swagger header/query parameter, with
  where it comes from; pick from **any earlier step's** last-response fields (tree with sample values), response
  headers, status, or type a path; or a fixed value, an environment variable, a data-row column, a generated value
  (`{{$uuid}}` …). **+ Pass another value** puts a value into the Bearer token, a header, a query parameter or a JSON
  body field. Then checks, run / stop-or-continue / wait / repeat, run earlier / later, remove, **Run up to here**.
  *Preview / Output*: status, time, size, tests, values passed on, the fields later steps can use, the body.
  Nothing selected: data-driven runs and the last run's report.
- **Saved the scenario way:** connecting adds a "Set vars" rule on the giving step (reused if it already reads that
  field) and writes `{{name}}` where it's needed. A saved request is changed itself (the panel says so); a copy is
  changed in the flow. So list view, runs, export for the CLI, cloud schedules (W9) and account sync (W8) work
  unchanged. Only `scenario.flow = { view, pos }` and a project endpoint step's `spec` are new; older readers ignore
  them.
- **Run** warns when inputs are missing ("2 inputs are missing (id, token). Run anyway?").
- **Phone:** one column of cards in run order, "+ Add a step…" list, tap a card for its settings below; every drag
  has a button (+, Run earlier / later), and cards are keyboard reachable (Tab, Enter).
### A flow on its own page, and Flow settings (added after review)
- **Its own page:** opening a scenario (click it, "Run" in its menu, a new scenario, "Back to the scenario") goes to
  `/playground/flows/:id` (signed in: `/workbench/flows/:id`, without the app sidebar). The whole window is the flow:
  ← Workbench, name, List / Canvas, environment, Schedule… (signed in), Flow settings, Run, and "Send from" above.
  The address can be bookmarked, reloaded or opened in another tab; the tab is named after the flow; an unknown
  address says "This flow isn't here". "Open to edit" / a result goes back to the Workbench with that request open;
  "Back to the scenario" returns. Changes made just before leaving are written first; leaving during a run asks.
- **Flow settings** (⚙ in the flow's top bar, also in the box): **Open flows** — on their own page (default), in a
  new browser tab (edits there show in the Workbench tab), or inside the Workbench (the box, as before);
  **Canvas** — snap cards to the grid (22 px), show what each line passes on, show the mini-map (click to go there),
  cards per row when arranging (as many as fit, or 1–6), and whether a flow without a saved view opens as a canvas
  (default) or a list. Saved in this browser (`hitapi:web:flowPrefs`), not in the account.
- **Files:** `flow-prefs.js`, `FlowSettings.jsx` (new); `Workbench.jsx` (flow page mode, opening by the setting,
  hand-off back to the Workbench, saving before leaving), `ScenarioEditor.jsx` (Flow settings button, back label,
  default view), `FlowCanvas.jsx` (snap, labels, mini-map, cards per row), `workbench.css`; `App.jsx` (routes),
  `seo/pages.js` (`/playground/flows` not indexed).

- **Files:** `flow-model.js`, `FlowCanvas.jsx` (new); `ScenarioEditor.jsx` (switch, Run check), `Workbench.jsx`
  (changing several drafts at once), `workbench.css`.

## Not in this step
- Branches (if / else) and loops over a response list. The data model leaves room (`flow.links`), but steps run in order.
- Running project Flow Suites on this canvas (they live on the server and are edited on the project's Flows page). Later,
  the same canvas could edit them too.

## Acceptance checklist
- [x] Drag a saved request onto the canvas; reorder by drawing a line from a port and by buttons. (Project endpoints:
      built and unit-checked; the browser test uses saved requests.)
- [x] Login → Get profile: connect `user.id` → `{id}` and `token` → Bearer by clicking; the run passes
      (`/v1/users/7`, `Bearer tok-…`); list view shows the same steps.
- [x] A required path parameter not connected is flagged, and Run warns before sending.
- [x] Fields come from the last response (or from the Swagger example/schema before the first run).
- [x] Saved as an ordinary scenario, so sync, schedules and CLI export are unchanged (their tests still pass).
- [x] Works signed out and on a phone (single column, buttons instead of drag).
- [x] A flow opens on its own page by default (signed out and in); Flow settings switch to a new tab or the box,
      and change snap, labels, mini-map, cards per row and the default view.

## Decisions
1. Where: both — the Workbench first (done), then the project Flow Suites page with the same canvas (next).
2. A straight chain (steps run in order); branches later.
3. A step can take data from any earlier step (dashed line when it skips steps).

## Next: the same canvas for project Flow Suites
Flow Suites live on the server (`flow_suites`, `flow_steps` with `extract_vars`, run by the worker). The plan: open a
suite on the canvas, map `extract_vars` / `{{vars}}` the same way, save with the existing flow API. It touches the
Flows page (and, for running, your uncommitted worker flow files), so it is a separate step.
