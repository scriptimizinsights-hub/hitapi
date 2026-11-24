# W4. Variables and environments

**Extension feature covered:** 7 Variables and environments.
**Who:** everyone (browser). Signed-in: environments saved to the account (secret values stay in the browser).
**Status:** ✅ Built (saved in the browser). The account copy of environments comes with W8.

## Goal
Write `{{baseUrl}}` and `{{token}}` once, switch between Development / Staging / Production in one click, and
let a login request save the token for the next ones.

## User stories
1. I create Dev and Prod environments with `baseUrl` and `token`, and switch with a dropdown in the header.
2. I see what each `{{variable}}` resolves to, and which ones are missing, before I send.
3. My login request saves `{{token}}` from the response ("Set vars"), and the next requests use it.
4. I use `{{$uuid}}`, `{{$timestamp}}`, `{{$randomEmail}}` for test data.
5. Secret values (token, password) are hidden on screen and never leave my browser.

## Functional requirements
- R1. `{{name}}` works in URL, params, headers, body, auth fields, and (W5) test paths/expected values.
- R2. Scope order (first wins): data row (W6) → environment → folder → collection → globals (shared/vars.js
  `buildScope`).
- R3. Header: environment picker ("No environment" / list / "Manage…"). Manage dialog: Globals + environments,
  add / rename / duplicate / delete / export as Postman environment; variable rows with enabled, secret flag;
  names matching token/secret/password/key are marked secret automatically.
- R4. Under the URL: chips for every variable used, with its value (secrets masked) or "missing"; clicking a
  missing one opens the dialog to add it. Sending with missing variables is blocked with a message naming them.
- R5. Dynamic variables (the extension's `DYNAMIC` list) with a reference list in the dialog.
- R6. **Set vars** tab: rules "name ← body JSONPath / header / status", run after each response, write to the active
  environment (or Globals); results shown ("token set", "orderId not set: path not found").
- R7. History stores templates (`{{vars}}` kept) and redacts secret values from stored responses (W2 R6).
- R8. Storage: browser → localStorage (`wb:environments`, `wb:activeEnv`). Signed-in → account kind
  `environments` with **secret values removed** before upload and filled back from this browser (extension sync rules).

## Non-functional
- Resolving variables adds < 5 ms per request. Missing-variable check runs as you type without lag.

## Backend changes
None (account storage via W8).

## Reuse from the extension
`shared/vars.js` (whole file), env store logic (`workbench/env-store.js` → web version).

## What was built
- **Environment picker** in the toolbar: "No environment", your environments, "Manage environments…"
  ("+ Add an environment…" when there are none). The choice is remembered and other open tabs follow it.
- **Environments and variables dialog:** Globals and environments; add (a new environment gets the same variable
  names with empty values), rename, Use this one / Stop using, duplicate (secret values not copied), export as a
  Postman environment or globals file (secret values left out, marked `secret`), delete (asks first). Two
  environments can't share a name. Variable rows: on/off, name (checked), value, Secret. Names like token,
  secret, password, key or auth are marked secret as you type (unless you change the box). Secret values are
  hidden except while you edit them. A reference list of the dynamic variables is at the bottom.
- **Under the URL:** the URL as it will be sent (secrets hidden) and a chip for every `{{variable}}` the request
  uses: its value, "not defined" (amber) or "new each send" (dynamic). Clicking a chip opens where it is set
  (missing → the dialog with a row ready for it; environment / Globals → the dialog; collection / folder →
  its settings).
- **Sending with missing variables** is blocked with a message naming them: "Add variables" when one is in the
  URL, otherwise "Send anyway" (sends them as written).
- **`{{name}}` works** in the URL, params, headers, body (JSON, XML, text, form, URL-encoded, GraphQL), auth
  fields and a collection's base URL. Scope order: environment → folder → collection → globals
  (`buildScope`). Values may themselves use variables.
- **Collection and folder variables** in their settings dialogs (left out of exports when secret).
- **Set vars tab:** rules `name ← JSON body path / header / status code`, run after each response, written to the
  environment in use (or Globals); results shown in the tab ("✓ token set", "✗ x not set: $.x is not in the
  response") and as a message. The runner applies them in order, so a Login request can set `{{token}}` for
  the next requests of the same run.
- **History** keeps the request as written (`{{token}}` kept, so reopening works) and the URL as sent; secret
  values (secret variables, auth fields, auth headers) are blanked from the stored URL, request and response.
- **Code / Copy as cURL** use the request with variables filled in (secrets included, as before).
- **Storage:** `localStorage` keys `hitapi:web:environments` (same shape as the extension's `wb:environments`)
  and `hitapi:web:activeEnv`.
- **Files:** `src/components/workbench/env-store.js`, `VarsTable.jsx`, `EnvDialog.jsx` (new);
  `Workbench.jsx`, `RequestTabs.jsx` (Set vars tab), `CollectionDialogs.jsx` (variables in settings),
  `history-db.js` (templates and secret values), `workbench.css`. No worker change.

## Acceptance checklist
- [x] Same resolution results as the extension for the same scope cases (same shared code; environment, folder,
  collection and globals checked end to end).
- [x] Switching environment changes the resolved URL chips at once.
- [x] Login → Set vars → next request uses the token (by hand and in a collection run).
- [x] Secret values masked on screen and absent from exports and History. (Account copy: W8.)
- [ ] Postman environment export imports into Postman (manual check — the file follows Postman's environment
  format: `values` with `key`, `value`, `type`, `enabled`).
