# 1. Request Workbench

**Talend parity:** #1–15 (HTTP request builder, GET/POST/PUT/PATCH/DELETE, custom methods, URL, query
parameters, headers, body slot, dynamic requests, HTML forms, hypermedia, send).
**Status:** ✅ Done in v1.7.0 (user guide: [docs/features/request-workbench](../features/request-workbench/README.md)).

### What was built
- Everything in "What the user gets" below, including protected headers (Cookie, Origin, Referer,
  User-Agent, DNT, Date, Via, Accept-Charset, Accept-Encoding) through a temporary `declarativeNetRequest`
  rule (new permission `declarativeNetRequestWithHostAccess`), so the optional phase 2 is done too.
- Extras: bulk edit for params and headers; readable network errors from `webRequest`; no
  `chrome-extension://` Origin unless you set one; captured browser headers copied in switched off;
  one Workbench tab reused; "Open HitAPI" link; "+ New request".
- **Easy to find (v1.7.0 follow-up):** popup without a sign-in wall and a Workbench card at the top;
  Alt+Shift+H shortcut; Workbench opens with a "Start here" note and a sample request on first install;
  "New" badge after updating; ⇄ Workbench tab inside the DevTools panel; store-friendly naming
  ("Free API client … no account needed"). 31 more automated checks.
- **cURL and JSON paste (v1.7.0 follow-up):** paste a cURL command into the URL bar or **Import cURL**;
  **Copy as cURL**; JSON pasted into the body on GET switches to POST and sets Content-Type; the body editor
  is always visible with a one-click method switch. 28 more automated checks.
- Tested in Chromium with the unpacked extension against a local echo server: 43 automated checks
  (params ↔ URL sync, every protected header, rule removal and no leak to other tabs, custom methods,
  TRACE refused, invalid URL, connection refused, timeout, cancel, redirects on/off, draft kept after
  reload, bulk edit, Open in Workbench from a real capture and resend, popup and context menu entry,
  narrow window).

## What the user gets

- A full-page Workbench tab with: method picker, URL bar, **Send** (and Ctrl/Cmd+Enter), tabs for
  **Params**, **Headers**, **Body**, **Auth** (body and auth are filled in by docs 2 and 3).
- Methods: GET, POST, PUT, PATCH, DELETE, HEAD, OPTIONS, plus any **custom method** typed in (e.g. `PURGE`).
- **Query params** table that stays in sync with the URL both ways (edit the URL → table updates, and back).
  Each row can be switched off without deleting it.
- **Headers** table with on/off per row, autocomplete for common header names and values
  (`Content-Type`, `Accept`, `Authorization`, `Cache-Control`…).
- Open from: popup button, DevTools panel, right-click menu, and **"Open in Workbench"** on any captured
  request (method, URL, headers and body copied in; masked credentials left blank).
- Cancel a running request; timeout setting (default 30 s).
- Minimal response area (status, time, size, body as text) until doc 4 replaces it.

## Design

- New files: `workbench/workbench.html`, `workbench/main.js`, `workbench/views/{request-bar,params-table,
  headers-table,tabs,response-basic}.js`, `workbench/core/send.js`, `shared/http.js` (URL ↔ params helpers).
- `send.js` uses `fetch` with an `AbortController`, `redirect: 'follow'` (option to not follow),
  measures time with `performance.now()`, reads the body as text (binary handled in doc 4).
- Browser-protected headers (`Cookie`, `Origin`, `Referer`, `User-Agent`, `Host`) cannot be set by `fetch`.
  Phase 1: show a clear note on those rows. **Optional phase 2:** set them through `declarativeNetRequest`
  session rules — needs the `declarativeNetRequestWithHostAccess` permission (new Web Store review).
- Draft request auto-saved to `chrome.storage.local` so closing the tab loses nothing.
- **HTML forms (#13)** are covered by doc 2 (form bodies); **hypermedia (#14)** by doc 4 (clickable links
  in responses open a new request).

## Limits and edge cases

- Invalid URL → inline error, Send disabled. Missing scheme → assume `https://` (or `http://` for localhost).
- Network errors (DNS, refused, TLS) shown with the browser's reason, like captured **ERR** rows.
- Very large responses: read up to 10 MB, then stop and say it was cut off.

## Acceptance checklist

- [ ] GET `https://jsonplaceholder.typicode.com/posts?_limit=2` shows 200, time and body.
- [ ] Editing the URL query updates the Params table and vice versa; disabled rows are not sent.
- [ ] Custom method `PURGE` is sent as `PURGE`.
- [ ] `http://localhost:3000/...` works with no CORS error.
- [ ] "Open in Workbench" from a captured request copies it; masked headers are empty, not `••••`.
- [ ] Cancel stops a slow request; timeout shows a clear message.
- [ ] Closing and reopening the Workbench keeps the draft.

## Out of scope here (next features)

Body editors (doc 2), auth helpers (doc 3), rich response views (doc 4), saving (docs 5–6), variables (doc 7).
