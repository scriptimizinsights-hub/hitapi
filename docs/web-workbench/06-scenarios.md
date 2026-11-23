# W6. Scenarios

**Extension feature covered:** 9 Scenarios.
**Who:** everyone (browser). Signed-in: saved to the account; can be sent to HitAPI as a cloud flow suite.
**Status:** 📝 Requirements.

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

## Acceptance checklist
- [ ] Same report as the extension for the same scenario and data.
- [ ] Stop, Re-run failed, onFail stop/continue, repeat and delay behave as in the extension.
- [ ] Push to a flow suite and pull back give the same steps.
- [ ] Exported scenario file runs with `hitapi-cli`.
