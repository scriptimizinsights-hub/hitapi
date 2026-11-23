# W4. Variables and environments

**Extension feature covered:** 7 Variables and environments.
**Who:** everyone (browser). Signed-in: environments saved to the account (secret values stay in the browser).
**Status:** 📝 Requirements.

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

## Acceptance checklist
- [ ] Same resolution results as the extension for the same scope cases.
- [ ] Switching environment changes the resolved URL chips at once.
- [ ] Login → Set vars → next request uses the token.
- [ ] Secret values masked on screen, absent from exports and from the account copy.
- [ ] Postman environment export imports into Postman (manual check).
