# W5. Tests (assertions)

**Extension feature covered:** 8 Assertions.
**Who:** everyone.
**Status:** ✅ Built.

## Goal
Check every response automatically: status, headers, JSON values, XML, time, body text, JSON Schema — and see at a
glance what passed.

## User stories
1. I add "status equals 200" and "`$.data` is an array" to a request and see ✓/✗ after each send.
2. I click a value in the JSON tree and choose "Add test" to check it.
3. I press "Suggest checks" and get sensible tests for this response.
4. The collection runner (W3) and scenarios (W6) use the tests to decide pass/fail.

## Functional requirements
- R1. **Tests** tab: rows of target (status, header, JSON body, XML body, response time, body), path (JSONPath /
  XPath / header name), operator (equals, not equals, contains, matches regex, exists, type is, less/greater than,
  matches JSON Schema …), expected value; enable/disable; delete. (shared/assert.js `TARGETS`, `OPS`).
- R2. `{{variables}}` in paths and expected values are resolved first (W4).
- R3. After a response: a **Tests** tab in the response viewer with each result (✓/✗, actual value, message) and a
  badge in the status line ("4 tests passed" / "1 of 4 failed").
- R4. "Add test" from the JSON tree (value → equals; object/array → type is).
- R5. "Suggest checks" (shared/assert.js `suggestTests`, no AI): status, time budget, content type, top-level types.
- R6. Pass rule everywhere: all tests pass; with no tests, status < 400 (same as the extension and the CLI).
- R7. XPath uses the browser's DOMParser (works on the web, unlike the CLI).

## Non-functional
- Running 20 tests on a 2 MB JSON response: < 100 ms.

## Backend changes
None.

## Reuse from the extension
`shared/assert.js` (whole file); tests-pane UI ported to React.

## What was built
- **Tests tab** in the request (with a count): each check is target (status, JSON body, header, response time,
  body text, XML body), path (JSONPath / header name / XPath, only where it applies), operator, expected value
  (a type list for "type is", a text box for a JSON Schema), on/off and delete. Two lines per check so long paths
  fit; one column on phones. `{{variables}}` in paths and expected values are filled in first.
- **After a response:** a badge in the status line ("✓ 3 tests passed" / "✗ 1 of 3 tests failed") that opens
  a **Tests** tab in the response with each check: ✓/✗, expected, actual and why it failed. When the request
  itself fails, every check is listed as failed with the reason.
- **"test" in the JSON tree:** a value → "equals" that value; an object or array → "type is object/array";
  the request's Tests tab opens.
- **Suggest checks:** status, a time budget, Content-Type and the top-level JSON fields of the last response;
  checks already there are skipped. Before a response it explains to send first.
- **Pass rule** (runner, and W6 scenarios): all checks pass; with none, status below 400. The runner shows
  "1/1 tests" and the first failure on each request.
- **History** keeps each response's check results (secret values blanked), shows ✓/✗ passed/total on each item,
  has the "Tests failed" filter, and shows the results when you reopen a request.
- Checks are saved with the request (changing them marks a saved request "edited").
- **Files:** `RequestTabs.jsx` (Tests tab), `ResponseView.jsx` (badge, Tests results), `JsonTree.jsx` ("test"),
  `Workbench.jsx` (run checks after send and in runs, "test", Suggest), `history-db.js`, `HistoryPanel.jsx`,
  `workbench.css`. No worker change.

## Acceptance checklist
- [x] Every target × operator combination gives the same result as the extension (the extension's own cases,
  run in the website's browser; the website bundles the same `shared/assert.js`).
- [x] "Add test" from the tree and "Suggest checks" create working tests.
- [x] Runner uses the tests for pass/fail. (Scenarios: W6.)
- [x] 20 checks on a 2 MB JSON response: well under 100 ms.
