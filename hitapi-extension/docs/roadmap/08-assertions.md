# 8. Assertions

**Talend parity:** #59–66 (response assertions; status, header, JSON body, XML body, response time; API
behaviour and third-party API validation).
**Status:** ✅ Done in v1.7.0 (user guide: [Request Workbench → Tests](../features/request-workbench/README.md#tests)).

### What was built
- **Tests** tab on each request: rows of *what · path · check · expected*, switch on/off, delete.
  - Status code: equals, is not, in range (`2xx`, `200-299`), one of (`200, 201`).
  - Header (name case-insensitive): exists, does not exist, equals, contains (case-insensitive), matches regex.
  - JSON body at a JSONPath: equals (`5`, `true`, `"text"`, `{"a":1}` read as JSON when possible), is not,
    exists, does not exist, contains (text, array item or object key), type is (string, number, boolean,
    object, array, null; `integer` too), length is, greater than, less than, matches regex.
  - XML body at an XPath: exists, equals, contains (the browser's own XPath, so `count(/a/b)` works too).
  - Response time below N ms. Body text: contains, does not contain, matches regex (`/…/i` flags work),
    **matches JSON Schema** (type, required, properties, items, enum, const, min/max, lengths, pattern,
    additionalProperties false).
- `{{variables}}` work in paths and expected values.
- After each send: a badge in the status line ("✓ 4 tests passed" / "✗ 1 of 4 tests failed") and a **Tests**
  tab in the response with each check, expected vs actual, and why it failed. A failed request fails every
  check with the reason.
- **One click from the response:** hover a JSON value → **test** (or right-click the row) adds "equals this
  value" (or "type is object/array" for objects and arrays).
- **✨ Suggest checks** from the last response: status, time (3× this one, at least 1000 ms), Content-Type and
  the type of each top-level JSON field. Rule-based, no AI: the AI version needs a new HitAPI API endpoint and
  is left for later.
- Saved with the request (collections, export) and part of "edited". The **runner** decides pass/fail from the
  tests when a request has any (else status below 400) and shows "1/1 tests" and the first failure.
- **History** shows ✓/✗ passed/total per entry, has a "Tests failed" filter, and reopening an entry shows its
  results.
- Code: `shared/assert.js`, `workbench/views/tests-pane.js`, response viewer and JSON tree. Tests: 36 checks
  (`test10.cjs`).

## What the user gets

- **Tests** tab on each request: a list of checks, each `target · operator · expected value`:
  - **Status code** equals / in range (2xx) / not equals
  - **Header** exists / equals / contains (e.g. `Content-Type contains json`)
  - **JSON body** at a JSONPath (`$.user.id`) equals / contains / exists / type is / length / matches regex
  - **XML body** at an XPath (`/user/name`) equals / exists
  - **Response time** below N ms
  - **Body** contains text / matches JSON Schema (HitAPI extra)
- After each send: a pass/fail list with expected vs actual, and a summary badge on the request and in history.
- Add a check in one click from the response viewer: right-click a JSON value → "Assert equals this value".
- **AI suggest checks** (HitAPI extra, signed-in): generate sensible assertions from the response
  using the HitAPI AI endpoint.
- Assertions are saved with the request (doc 6) and run in scenarios (doc 9).

## Design

- `shared/assert.js` — pure evaluator (unit-tested), small JSONPath and XPath helpers (no big libraries;
  XPath via the browser's `DOMParser` + `document.evaluate`).
- `workbench/views/tests-tab.js`, `workbench/views/test-results.js`.

## Acceptance checklist

- [x] `status = 200`, `$.id exists`, `time < 2000` all pass on a normal GET; changing expected value fails with a clear diff.
- [x] Header contains check is case-insensitive on the header name.
- [x] XPath check passes on `https://httpbin.org/xml`.
- [x] Right-click a JSON value creates the matching assertion.
- [x] Results appear in history.
