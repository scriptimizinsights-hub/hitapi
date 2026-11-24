# W6. Scenarios

**Extension feature covered:** 9 Scenarios.
**Who:** everyone (browser). Signed-in: saved to the account; can be sent to HitAPI as a cloud flow suite.
**Status:** ✅ Built (saved in the browser). Account storage comes with W8.

## Goal
Run requests one after another as a user journey (log in → create order → check it → delete it), sharing
variables between steps, repeating with data rows, with a clear report.

## User stories
1. I build "Checkout flow" from saved requests and run it; each step's tests decide pass/fail.
2. Step 1 saves `{{token}}`, the next steps use it.
3. I paste a CSV of 20 users and run the scenario once per row.
4. I re-run only the steps that failed.
5. Signed in, I push the scenario to HitAPI as a flow suite and run it in the cloud.

## Functional requirements
- R1. Sidebar tab **Scenarios**: list with step count and last result badge; new, rename, duplicate, delete.
- R2. Editor: steps from saved requests (stay linked) or copies of the current request; reorder (drag / ↑↓),
  enable/disable, delay before, repeat N times, on failure stop / continue.
- R3. Data-driven runs: CSV or JSON rows (paste or file); one run per row; row values are variables (top scope).
- R4. Run / Stop / Re-run failed; live report: per step and row — status, time, tests, variables set; totals;
  click a result to open the request with that response. Last report kept with the scenario (no bodies).
- R5. Engine: shared/scenarios.js `runScenario` with the Workbench's send modes (cloud rate limit respected).
- R6. Signed in: **Send to HitAPI as a flow suite** / **From HitAPI** (existing flow suite APIs, same conversion as
  the extension: `toFlowStep`, `fromFlowSuite`).
- R7. Export for the CLI (`hitapi-scenario` file, shared/ci.js `exportScenario`).
- R8. Storage: browser localStorage (`wb:scenarios`); signed-in account kind `scenarios` (W8).

## Non-functional
- A 20-row × 5-step run (100 requests) completes with the UI responsive; progress shown.

## Backend changes
None (flow suite APIs exist).

## Reuse from the extension
`shared/scenarios.js`, `shared/ci.js`; scenario editor ported to React.

## What was built
- **Scenarios** in the sidebar (tab and toolbar button): each with its step count and last result
  ("✓ 3", "✗ 1 failed", "running…"); + Scenario, From HitAPI; ⋯ menu: open, run, rename, duplicate, export for
  the CLI, send to HitAPI as a flow suite, delete (asks first).
- **Editor** (in place of the request and response): name, Run / Stop / "Re-run N failed", "← Request".
  Steps: saved requests (stay linked) picked from a list, or "+ Add the current request" (a saved one stays
  linked, an unsaved one is copied in). Each step: on/off, Open, ↑ ↓, drag to reorder, remove, wait before (ms),
  repeat (1–100), if it fails stop / continue, and how many tests and set-vars it has. A step whose saved
  request was deleted says so.
- **Data-driven runs:** CSV or JSON rows (paste or load a file); says how many runs and which variables, or
  what is wrong with the data. Row values are the top variable scope.
- **Report** (live): per step, row and repeat — ✓/✗, status, time, size, tests, variables set, the error or
  first failed check; totals, progress bar, environment, "Stopped at the first failed step" / "You stopped the
  run". Click a result to open its request with that response ("← Back to the scenario"). The last report is kept
  with the scenario, without bodies.
- **Engine:** `shared/scenarios.js` `runScenario` (the extension's), each step sent like a collection-run request
  (collection settings, variables, tests, Set vars, History) with the chosen "Send from". HitAPI cloud's
  per-minute limit pauses the run (counting down) and sends the same step again.
- **A copied step** opens in the request editor with a bar "Step N of the scenario … (a copy kept in the
  scenario)", **Save to step** (Ctrl/⌘ + S) and "Back to the scenario".
- **Export for the CLI:** a `hitapi-scenario` file (`shared/ci.js` `ciFile`), with the variables CI must give
  named in the message.
- **HitAPI flow suites (signed in):** "Send to HitAPI as a flow suite" (environment values filled in except
  secrets and variables an earlier step sets; lists the steps, what is not sent, and what stays a variable)
  and "From HitAPI" (a suite → a scenario), the same conversion as the extension (`toFlowStep`,
  `fromFlowSuite`). Signed out, both ask you to sign in.
- **Storage:** `localStorage` key `hitapi:web:scenarios` (same shape as the extension's `wb:scenarios`).
- **Files:** `scenarios-store.js`, `ScenariosPanel.jsx`, `ScenarioEditor.jsx`, `ScenarioDialogs.jsx` (new);
  `Workbench.jsx`, `CollectionsPanel.jsx` (shared menu), `workbench.css`. No worker change.

## Acceptance checklist
- [x] Same report as the extension for the same scenario and data (same `runScenario` engine and pass rule).
- [x] Stop, Re-run failed, onFail stop/continue, repeat and delay behave as in the extension.
- [x] Push to a flow suite and pull back give the same steps (checked against the local worker).
- [x] Exported scenario file runs with `hitapi-cli` (3 passed).
- [x] 20 rows × 5 steps (100 requests) run with the page responsive.
