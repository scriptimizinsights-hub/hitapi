# 2. Request Body Editor

**Talend parity:** #16–22 (JSON, XML, text, form data, URL-encoded, dynamic payloads, custom content types)
plus #13 HTML forms.
**Status:** ✅ Done in v1.7.0 (user guide: [Request Workbench → Body](../features/request-workbench/README.md#body)).

### What was built
- All eight body types, each keeping its own content; automatic Content-Type with manual override (empty
  header ignored; boundary-less multipart header replaced); JSON check with line/column and Go to error,
  Format, Minify; XML check and Format; form-data with files; URL-encoded rows; binary file; GraphQL with
  variables check and operationName; `{{variables}}` highlighted and allowed unquoted.
- Code editor without a library: transparent textarea over a highlighted `<pre>`, line numbers, Tab and
  auto-indent through `execCommand('insertText')` so undo keeps working, no colours above 150 KB.
- Files live in memory only; drafts keep the file name and ask to pick it again.
- Captured requests, cURL imports and older single-body drafts are mapped to the right type.
- Copy as cURL writes the right flags per type.
- 53 automated checks in Chromium (every type sent to an echo server and checked byte for byte, Content-Type
  rules, editor keys and undo, persistence and re-picking files, 300 KB JSON stays responsive), plus the
  earlier suites updated (43 + 28 + 31 checks).

## What the user gets

Body type picker: **None · JSON · XML · Text · Form data (multipart) · URL-encoded · Binary file · GraphQL**.

- **JSON:** editor with syntax highlighting, live "valid / invalid JSON" check with line number,
  **Format** and **Minify** buttons.
- **XML / Text:** plain editor; XML has a well-formed check and Format.
- **Form data:** key/value rows, each row text **or file** (file picker); sent as `multipart/form-data`
  (the browser sets the boundary).
- **URL-encoded:** key/value rows, sent as `application/x-www-form-urlencoded`.
- **Binary:** pick a file, sent as-is with its type.
- **GraphQL** (HitAPI extra): query + variables editors, sent as JSON.
- `Content-Type` is set automatically from the body type, shown in Headers as "auto", and can be
  overridden by a manual header (**custom content types**, #22).
- **Dynamic payloads (#21):** `{{variables}}` in the body are replaced at send time (doc 7 adds the
  variables; this doc reserves the syntax and highlights it).
- Switching type keeps each type's content, so switching back loses nothing.

## Design

- `workbench/views/body/{body-tabs,json-editor,kv-editor,file-picker,graphql}.js`, `shared/body.js`
  (builds the `fetch` body + content type).
- Editor: a lightweight textarea with line numbers and highlighting (no heavy editor library; keep the
  extension small). Revisit CodeMirror 6 only if needed.
- Files are kept in memory only (not saved in drafts/history); the saved request records the file name
  and asks to re-pick it.

## Acceptance checklist

- [ ] POST JSON to `https://httpbin.org/post` → `json` field echoes the body; Content-Type is `application/json`.
- [ ] Invalid JSON shows the line and column; Format fixes indentation of valid JSON.
- [ ] Form data with a file uploads (httpbin `files` shows it).
- [ ] URL-encoded rows arrive in httpbin `form`.
- [ ] Manual `Content-Type: application/vnd.api+json` overrides the automatic one.
- [ ] GET/HEAD show "this method doesn't send a body" instead of the editor.
