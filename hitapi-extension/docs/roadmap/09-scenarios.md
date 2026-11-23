# 9. Scenarios

**Talend parity:** #67–70 (create, run, organise scenarios; scenario-based testing).
**Talend Free limit:** one scenario at a time. **HitAPI: unlimited** — a headline advantage.
**Status:** ✅ Done in v1.7.0 (user guide: [Request Workbench → Scenarios](../features/request-workbench/README.md#scenarios)). Unlimited scenarios.

### What was built
- Sidebar tab **Scenarios**: + Scenario, filter, last-result badge, ⋯ menu (open, run, rename, duplicate, send
  to HitAPI, delete). A scenario opens in place of the request (← Request goes back; the request is kept).
- **Steps:** a saved request (stays linked: the scenario uses the request's current version, with its
  collection's base URL, headers, auth and variables) or a copy of an unsaved request kept in the scenario
  ("Add the current request"; a saved one is added linked). Reorder by drag or ↑↓, switch off, remove.
  A step whose saved request was deleted is flagged.
- **Per step:** wait before (ms), repeat N times (up to 100), if it fails *stop the run* (default) or *continue*.
  Each step uses its request's **Tests** (pass/fail) and **Set vars** rules, so a login step sets `{{token}}` for
  later steps. Open a copied step to edit it and **Save to step** (Ctrl/⌘ + S).
- **Run** with the environment picked in the header: live progress, each step's status, time, tests, the
  variables it set and the first failure; summary and progress bar; **Stop**; **Re-run N failed** (only the
  steps that failed). Click a result to open the step's request with that response, and go back. Every
  request is also kept in History. The last report is saved with the scenario (without bodies).
- **Data-driven runs:** CSV (header row = variable names; quotes supported) or a JSON array of objects, typed or
  loaded from a file; the scenario runs once per row and each column is a `{{variable}}` that wins over the
  environment. Up to 1,000 rows.
- **HitAPI flow suites** (signed in): *Send to HitAPI as a flow suite* creates a suite in a project with the
  enabled steps (method, full URL with environment values filled in, headers, JSON body, expected status from a
  "Status code equals" test, JSON extract rules as `extract_vars`). Secret headers/values are not sent, and
  variables a step sets (e.g. `{{token}}`) are kept for the cloud run. *⚡ From HitAPI* turns a flow suite into a
  scenario. Steps are added one by one because the bulk create drops steps that share a method.
- Storage: `wb:scenarios`. Code: `shared/scenarios.js` (engine, data parsing, flow conversion),
  `workbench/scenarios-store.js`, `workbench/views/{scenarios-pane,scenario-editor,scenario-dialogs}.js`,
  `background/workbench/hitapi-sync.js`. Tests: 44 checks (`test11.cjs`).

## What the user gets

- A scenario is an **ordered list of steps**, each step a saved request (doc 6) or an inline request.
- Between steps: **extract** values into variables (doc 7), e.g. login → `token` → used by later steps.
- Per step: assertions (doc 8), **delay**, **repeat N times**, **continue or stop on failure**.
- **Run** with live progress: each step's status, time, assertions; a final report (passed/failed, total
  time); re-run only failed steps.
- Run against any environment (Dev/Staging/Prod) from a dropdown.
- **Data-driven runs** (HitAPI extra): run the scenario once per row of a CSV/JSON file.
- **Sync with HitAPI flow suites** (signed-in): push a scenario as a flow suite (so it can run on a schedule
  in the cloud and get AI bug reports), or pull an existing suite down to run locally.

## Design

- `background/workbench/scenarios.js` (storage `wb:scenarios`), runner in the Workbench page
  (`workbench/core/runner.js`) so it can use the same send/assert code; long runs keep the page open.
- Report kept in history with each step's request/response.

## Acceptance checklist

- [x] 3-step scenario: POST login → extract token → GET profile with `Bearer {{token}}` → assert 200. Passes.
- [x] Failing step stops the run when "stop on failure" is set; continues otherwise.
- [x] Two scenarios can exist and run independently (beats Talend Free's limit of one). Any number can exist; one runs at a time per Workbench tab.
- [x] CSV with 3 rows runs the scenario 3 times with each row's values.
- [x] Push to HitAPI creates a flow suite visible in the web app.
