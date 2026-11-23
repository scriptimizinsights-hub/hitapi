# 4. Response Viewer

**Talend parity:** #29–39 (status, headers, body, JSON/XML/HTML/image viewers, raw, pretty, preview, formatting).
**Status:** ✅ Done in v1.7.0 (user guide: [Request Workbench → Response](../features/request-workbench/README.md#response)).

### What was built
- Pretty (JSON tree with lazy children, 200-item pages, search with next/previous, copy path/value, Expand/Collapse
  all; XML element tree; coloured HTML source), Raw (wrap switch), Preview (sandboxed HTML without scripts,
  images with pixel size, PDF), Headers (raw list incl. duplicates and Set-Cookie via `chrome.webRequest`, filter,
  size), Cookies (parsed Set-Cookie), Timing (total / first byte / body; DNS, connect, TLS, server when the server
  sends Timing-Allow-Origin; redirect chain).
- Clickable links in JSON values and Link/Location headers open as a new GET request with Undo.
- Save body to a file; Copy; remembered tab; JSON/XML over 2 MB falls back to text.
- 45 automated checks against an echo server (sandbox proven by a page script that must not run, saved PNG checked
  byte for byte, 3 MB JSON); all earlier suites updated and passing.
- Not done: a separate "Cookies" view of cookies *sent* (they are in the request headers).

## What the user gets

- Status line: **status code + text** (coloured), **time** (with a breakdown: wait/download where
  available), **size** (body + headers), redirect count.
- Tabs: **Pretty · Raw · Preview · Headers · Cookies**.
  - **Pretty:** JSON as a collapsible tree with line numbers, search (Ctrl+F), copy value / copy path
    (e.g. `$.data[0].id` — reused by assertions in doc 8); XML formatted and collapsible.
  - **Raw:** exact text as received.
  - **Preview:** HTML rendered in a **sandboxed iframe** (no scripts); images (PNG/JPG/GIF/SVG/WebP)
    displayed with dimensions; PDF via the browser viewer.
  - **Headers:** table, searchable, copy all.
  - **Cookies:** `Set-Cookie` headers parsed into name/value/attributes.
- **Hypermedia (#14):** URLs in JSON/XML/headers (`Link`, `Location`) are clickable → open as a new GET request.
- Actions: copy body, **save body to file**, copy as cURL (of the request).
- Large bodies: Pretty view limited to 2 MB (Raw still available); never freezes the page.

## Design

- `workbench/views/response/{status-bar,pretty-json,pretty-xml,raw,preview,headers,cookies}.js`.
- Body read once as `ArrayBuffer`; decoded as text by charset, or shown as image/binary by content type.
- JSON tree rendered lazily (only expanded nodes) for speed.

## Acceptance checklist

- [ ] JSON response shows a tree; collapsing/expanding works; copy path gives a valid JSONPath.
- [ ] XML response (e.g. `https://httpbin.org/xml`) is pretty-printed.
- [ ] HTML preview renders but scripts don't run.
- [ ] `https://httpbin.org/image/png` shows the image.
- [ ] 5 MB JSON doesn't freeze the page.
- [ ] Clicking a URL in a response opens a new request.
