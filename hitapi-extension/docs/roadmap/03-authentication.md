# 3. Authentication

**Talend parity:** #23–28 (auth configuration, Basic, Bearer, custom authorization headers, custom
security parameters, auth variables).
**Status:** ✅ Done in v1.7.0 (user guide: [Request Workbench → Auth](../features/request-workbench/README.md#auth)).

### What was built
- Auth tab with No auth, Bearer (prefix, **Use detected token** from captured traffic), Basic (UTF-8 safe),
  API key (header or query), Custom header (protected headers work through the browser rule), OAuth 2.0 client
  credentials (body or Basic client auth, Get token, cached in `chrome.storage.session`, renewed 30 s before
  expiry, Forget, server errors shown).
- Summary in the Auth tab and a read-only note in the Headers tab; the Auth header replaces a same-name header
  with a warning; missing values block sending with an explanation.
- `curl -u` fills Basic auth; Copy as cURL includes auth.
- "Inherit from collection" waits for feature 6 (collections); `{{variables}}` in auth fields wait for feature 7.
- Also in this round: the body editor is ~16 lines tall, grows with its content to ~65% of the window, and the
  line-number column always matches the editor's height.
- 34 automated checks (fake OAuth server counts issued tokens to prove caching), all earlier suites still pass.

## What the user gets

Auth tab with types:

- **No auth** · **Inherit from collection** (doc 6)
- **Bearer token** — with a **"Use detected token"** picker listing tokens the extension has seen on
  this site (existing detection feature), newest first, showing where each came from.
- **Basic auth** — username + password → `Authorization: Basic base64(user:pass)`.
- **API key** — key name + value, sent as a **header** or a **query parameter** (#27 custom security parameters).
- **Custom header** — any header name/value (#26), e.g. `X-Auth-Token`.
- **OAuth 2.0 (client credentials)** — token URL, client id/secret, scope; fetches and caches the token,
  refreshes on expiry. (HitAPI extra; Talend Free doesn't advertise it.)
- Every field accepts `{{variables}}` (#28), so secrets can live in an environment (doc 7).
- The generated header is shown read-only in the Headers tab ("from Auth") so it is never a mystery.

## Design

- `workbench/views/auth/*.js`, `shared/auth.js` (applies auth to a request object, pure function — easy to test).
- Secrets are stored in `chrome.storage.local`, **never** sent to HitAPI unless the user saves the request
  to a HitAPI project (then masked, same rules as flow-suite saving today).
- Detected tokens come from the existing token-detection store via a new message `LIST_DETECTED_TOKENS`.

## Acceptance checklist

- [ ] Basic auth against `https://httpbin.org/basic-auth/u/p` → 200.
- [ ] Bearer against `https://httpbin.org/bearer` → 200 with the token echoed.
- [ ] API key as query param appears in the URL sent, not in the visible URL bar.
- [ ] "Use detected token" lists a token captured from a site the user just used.
- [ ] OAuth client-credentials fetches a token once and reuses it until it expires.
