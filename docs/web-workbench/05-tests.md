# W5. Tests (assertions)

**Extension feature covered:** 8 Assertions.
**Who:** everyone.
**Status:** 📝 Requirements.

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

## Acceptance checklist
- [ ] Every target × operator combination gives the same result as the extension (unit tests reuse its cases).
- [ ] "Add test" from the tree and "Suggest checks" create working tests.
- [ ] Runner and scenarios use the tests for pass/fail.
