# W1. Web Workbench — request builder and response viewer

**Extension features covered:** 1 Request Workbench, 2 Body editor, 3 Authentication, 4 Response viewer.
**Who:** everyone (no sign-in). Signed-in users get the same page inside the app at `/workbench`.
**Status:** ✅ Built (website + worker + extension 2.1). Deploy: worker, frontend; publish extension 2.1.0 for "HitAPI extension" mode.

### What was built
- **`/playground` is now the HitAPI Web Workbench** (`frontend/src/components/workbench/`), free and without sign-in:
  method (standard or custom), URL ↔ params, headers with suggestions and bulk edit, all 8 body types (none, JSON,
  XML, text, multipart form with files, URL-encoded, binary file, GraphQL), all auth types (Bearer, Basic, API key
  in header or query, custom header, OAuth 2.0 client credentials with token caching), settings (timeout, redirects,
  cookies), cURL paste / Import cURL / Copy as cURL, Code (cURL, fetch, axios, Python, Go, PHP), draft kept in the
  browser, Ctrl/⌘+Enter, a Recent list (25, no secrets; the old playground history is moved over once).
- **Response viewer:** status/time/size, warnings, Pretty (JSON tree with search, expand/collapse, copy value /
  JSONPath, clickable links, paging for big arrays; formatted XML), Raw, Preview (sandboxed HTML, images, PDF),
  Headers (all, incl. duplicates and Set-Cookie in cloud/extension mode), Cookies, Timing (first byte, download,
  redirect hops), Copy and Save body.
- **Three send modes**, picked automatically per URL and switchable: **HitAPI cloud** (public URLs), **This browser**
  (localhost; CORS and mixed-content failures explained), **HitAPI extension** (localhost, no CORS, any header). The
  extension asks the user once on its own page before a website may use it.
- **Same logic as the extension:** the website imports `hitapi-extension/shared` through a Vite alias
  (`@hitapi/shared`), so requests, bodies, auth, cURL and code are identical.
- **Signed in:** the same Workbench inside the app at `/workbench` (sidebar link "API Workbench", noindex) and a
  higher cloud limit.
- **Worker (`services/proxy.js`, `publicRequest`):** custom methods (not CONNECT/TRACE), binary (`body_base64`) and
  multipart (`form`) bodies, redirects followed hop by hop with the private-address check on every hop (and
  Authorization/Cookie dropped on cross-origin hops), `header_list` with every Set-Cookie, `ttfb_ms`, binary
  responses as `body_base64`, 300 requests/min for signed-in users (token or API key) instead of 60 per IP.
  `DEV_PROXY_ALLOW_HOSTS` (local development only) lets the proxy reach listed hosts. Request content is not logged.
- **Extension 2.1.0:** `externally_connectable` for `https://hitapi.dev/*` and subdomains;
  `background/workbench/web-bridge.js` (ping, connect, send, cancel, disconnect); approval page
  `workbench/connect.html` (also lists connected websites; linked from ☁ Backup → Connected websites…).
- **SEO:** new title and description, one H1 ("Free Online API Tester"), the tool in the prerendered HTML, sections
  "Everything you need to test an API", "How to test an API online", "Three ways to send a request", "From one
  request to automated API tests" (links to the extension, how it works, mock server) and a 7-question FAQ;
  JSON-LD `WebApplication` (with featureList) + `BreadcrumbList` + `FAQPage` from the same text
  (`seo/apiTesterContent.js`); `/workbench` and `/account` are noindex.
- Tests: 55 checks (`test17.cjs`) — SEO HTML, every body and auth type in cloud mode, redirects, custom method,
  browser mode (localhost, CORS, mixed content, header limits), extension mode (approval page, Cookie/User-Agent,
  no CORS, file upload, image), JSON tree on 30 000 items, search, copy JSONPath, sandboxed preview, cURL paste,
  Copy as cURL, code, draft, Recent, 375 px layout, signed-in `/workbench`, rate limits.

## Goal
Turn `/playground` into the full HitAPI Workbench: build any HTTP request, send it, and read the response as well
as in the extension — free, in the browser, nothing to install.

## Today vs. after W1

| | `/playground` today | After W1 |
|---|---|---|
| Methods | 7 standard | 7 standard + custom (e.g. `PROPFIND`) |
| URL ↔ params | yes | yes, two-way, with bulk edit |
| Headers | key/value | key/value + suggestions, bulk edit, disabled rows, "Auth tab replaces Authorization" note |
| Body | JSON, text | JSON, XML, text, form URL-encoded, multipart form (text + files), binary file, GraphQL (query + variables) |
| Auth | bearer, basic | none, bearer, basic, API key (header or query), custom header, OAuth 2.0 client credentials |
| Send from | HitAPI server or browser | HitAPI cloud / this browser / HitAPI extension (see README §3) |
| Response | body, headers | pretty JSON tree (search, collapse, copy path), raw, preview (HTML sandboxed, images, PDF), headers, cookies, timing, redirects, size |
| cURL | paste | paste (auto-detected) + "Copy as cURL" |
| Code | snippets | curl, fetch, axios, Python requests, Go, PHP (extension's `codegen.js`) |
| Draft | lost on reload | kept in the browser as you type |

## User stories
1. As a visitor, I paste a URL, press Send and see a readable response in under 10 seconds, without signing up.
2. As a developer, I paste a cURL command from DevTools and the whole request fills in.
3. As a developer, I test my **localhost** API from the website (via this browser or the extension) and I'm told
   clearly why it failed if CORS blocks it.
4. As a developer, I send a multipart form with a file, or a GraphQL query with variables.
5. As a developer, I get an OAuth 2.0 client-credentials token automatically before the request.
6. As a developer, I copy the request as cURL / fetch / Python to put in my code.
7. As a signed-in user, the same Workbench opens inside the app, with my account's data (from W3 on).

## Functional requirements

### Request
- R1. Method: dropdown with the 7 standard methods; typing any other valid token is allowed (shared/http.js
  `methodProblem`).
- R2. URL: free text; `https://` added if missing; invalid URLs explained before sending (`urlProblem`).
  Query params table stays in sync with the URL both ways (`paramsFromUrl`, `buildUrl`).
- R3. Headers table: enable/disable rows, autocomplete for common names and values (`COMMON_HEADERS`,
  `COMMON_VALUES`), bulk edit (`Name: value` lines).
- R4. Body tab: the 7 body types from shared/body.js, with the extension's checks (invalid JSON/XML shown inline,
  Format button, automatic Content-Type unless the user set one, body ignored for GET/HEAD with a note).
  Files (multipart / binary) stay in memory only; size limit shown for the cloud mode (1 MB).
- R5. Auth tab: the types from shared/auth.js. OAuth 2.0 token fetched before the request and cached in
  `sessionStorage` until it expires; "Get new token" button; token request goes through the same send mode.
- R6. Settings tab: timeout, follow redirects (browser mode can only follow), send cookies (extension mode only).
- R7. cURL: pasting a cURL command into the URL box fills the request (shared/curl.js `parseCurl`); Import cURL
  dialog; Copy as cURL (`toCurl`).
- R8. Code: dialog with the 6 languages from `codegen.js`, copy button.
- R9. Draft: saved to localStorage as you type (debounced), restored on reload; "New request" clears it.
- R10. Keyboard: Ctrl/⌘+Enter sends, Esc cancels a running request.

### Sending (send modes, README §3)
- R11. Mode picker next to Send: **HitAPI cloud** / **This browser** / **HitAPI extension**. Default: cloud for
  public hosts, browser for `localhost`, `*.local`, private IPs; extension when detected and enabled.
- R12. Cloud mode uses `POST /api/public/request`. It must be extended to accept everything W1 sends:
  - body as text, or base64 for files/binary, or multipart parts (proposal: `{ body_base64 }` and `{ form: [...] }`);
  - return response headers as a list (duplicates kept, incl. `Set-Cookie`), redirect hops, timing split
    (time to first byte / download), size, and `truncated`;
  - signed-in users: higher rate limit (README §4).
- R13. Browser mode: `fetch` with `mode: 'cors'`; on failure explain the likely cause (CORS, mixed content
  http→https, DNS, refused) and offer the other modes.
- R14. Extension mode: the page talks to the HitAPI extension with `chrome.runtime.sendMessage(EXTENSION_ID, …)`
  (needs `externally_connectable: { matches: ["https://hitapi.dev/*", "https://*.hitapi.dev/*"] }` in the extension
  — extension 2.1). The extension runs the request with its own `send()` and returns the same response record.
  The page detects the extension (ping) and shows "Install the extension" when it is missing.
- R15. Cancel button while sending; timeout from Settings (cloud mode capped at 15 s, shown).
- R16. Warnings are shown above the response (header replaced by auth, body not sent for GET, header dropped by
  the browser, etc.).

### Response viewer
- R17. Status line: status + text (coloured), time, size; "Tests" summary appears from W5.
- R18. Tabs: **Pretty** (JSON tree with search, expand/collapse all, copy value / copy path; XML tree; plain
  text with wrap), **Raw**, **Preview** (HTML in a sandboxed iframe with scripts off, images, PDF), **Headers**
  (all, with filter), **Cookies** (`Set-Cookie` parsed), **Timing** (total, TTFB, download, redirects).
  Logic from shared/response.js; tree views ported to React.
- R19. Large responses: bodies over 2 MB truncated (cloud) / 10 MB (browser/extension) with a note; JSON tree
  renders lazily (no freeze on 30 000 items).
- R20. Copy body, Save body to a file.

### Layout
- R21. Desktop: request on the left, response on the right (resizable); sidebar (history, later collections) on
  the far left, collapsible. Mobile (≤ 768 px): stacked, response below.
- R22. Public `/playground`: site header and footer, a short intro above the fold for SEO (kept from today's
  page), sample requests. In-app `/workbench`: inside the app shell, no marketing copy.

## Non-functional
- Page load: Workbench interactive in < 2 s on a mid-range laptop; shared modules code-split from the landing page.
- Security: the HTML preview is sandboxed (`sandbox=""`), no scripts; responses are never rendered as HTML
  elsewhere. Cloud proxy keeps its SSRF protection and must not log headers/bodies.
- Accessibility: all controls labelled, tabs are real tablists, colour is not the only status signal.
- SEO: `/playground` stays prerendered with its title/description; the app part hydrates after.

## Backend changes
- `services/proxy.js` / `publicRequest`: binary and multipart bodies, header list + redirects + timing in the
  result, `truncated`, per-user limit when an auth token or API key is present.
- No new tables.

## Reuse from the extension
`shared/http.js`, `body.js`, `auth.js`, `curl.js`, `response.js`, `convert/codegen.js`, `headers.js`.
New web code: React components, a web `send()` with the three modes, draft storage.

## Out of scope (later features)
History (W2), saving requests (W3), variables (W4), tests (W5).

## Acceptance checklist
- [x] Every body type and auth type sends correctly (cloud mode, all types; browser and extension modes for the types they allow), checked against an echo server.
- [x] Pasting a cURL command fills method, URL, headers, body.
- [x] A localhost request in cloud mode explains why and switches to browser/extension in one click.
- [x] Browser-mode CORS failure is explained, not just "Failed to fetch".
- [x] Extension mode works with extension 2.1 (tested with the unpacked build) and asks to connect first. "Install" is shown without it (not tested in CI: needs a browser without the extension).
- [x] 30 000-item JSON response opens without freezing; HTML preview can't run scripts.
- [x] Draft survives a reload; Ctrl/⌘+Enter sends; works at 375 px wide.
- [x] `/playground` still prerenders with its SEO title and description.

## Open questions
1. Keep `/playground` as the public URL? (Recommended.)
2. Ship extension mode in W1 (needs extension 2.1 published) or as W1.1?
