# 7. Variables and Environments

**Talend parity:** #52–58 (custom variables, variables in URL/headers/body, environments, reuse, dynamic execution).
**Status:** ✅ Done in v1.7.0 (user guide: [Request Workbench → Variables and environments](../features/request-workbench/README.md#variables-and-environments)).

### What was built
- `{{name}}` in the URL, headers (names and values), body (JSON, XML, text, URL-encoded, form-data text fields,
  GraphQL query and variables) and every auth field, and in a collection's base URL. Values may contain other
  `{{vars}}` (up to 5 levels).
- **Environments** picker in the Workbench header (No environment / your environments / Manage…). The
  *Environments and variables* dialog: Globals plus any number of environments; add, rename, duplicate
  (secret values not copied), delete, "Use this one". A new environment starts with the same names as the one
  shown, values empty. Every open Workbench follows the switch.
- **Collection and folder variables** (in their settings dialogs).
- Most specific wins: **environment → folder → collection → globals** (changed from the plan's order so the
  environment you pick overrides a collection's defaults, as in Postman).
- **Secret** flag per variable: value shown as dots (visible while editing), dots in the variables line, left
  out of collection exports, and never stored in history: history keeps the request with `{{vars}}`, and secret
  values are blanked in the kept response too (an API that echoes the request back).
- **Variables line** under the URL: each variable used, its value and where it comes from (hover); undefined
  ones in red ("not defined", click to add); dynamic ones dashed; and the URL as it will be sent.
- **Before sending:** undefined variables are listed with *Send anyway* (or *Add variables* when the URL needs
  them). The runner reports them as a failed request.
- **Dynamic variables:** `$uuid`/`$guid`, `$timestamp`, `$timestampMs`, `$isoDate`/`$isoTimestamp`,
  `$randomInt`, `$randomEmail`, `$randomName`, `$randomFirstName`, `$randomBoolean`; new value at every use.
- **Set vars** tab on each request: rules *variable ← JSON body path / header / status code*, run after every
  response (also in the runner, in order, so a login request can set `{{token}}` for the next ones). Values go
  to the active environment, or Globals when none is picked; names like token/secret/password/key become
  secret. Results shown under the rules; failures explained.
- Copy as cURL fills the variables in. History shows and searches the URL that was actually sent.
- Not done: request-level variables (use the collection or folder) and `{{` autocomplete in inputs.
- Storage: `wb:environments`, `wb:activeEnv`. Code: `shared/vars.js`, `workbench/env-store.js`,
  `workbench/views/{env-dialog,vars-table,extract-pane}.js`. Tests: 44 checks (`test9.cjs`).

## What the user gets

- `{{name}}` works everywhere: URL, params, headers, body, auth fields. Variables are highlighted;
  unknown ones are underlined red with "not defined in this environment".
- **Environments** (e.g. Development, Staging, Production), switched from a dropdown in the Workbench
  header. Each has its own values for the same names (`baseUrl`, `token`, `userId`…).
- Scopes, most specific wins: **request → service → project → environment → global**.
- **Secret** flag per variable: value hidden in the UI and masked in history and exports.
- **Dynamic variables:** `{{$uuid}}`, `{{$timestamp}}`, `{{$isoDate}}`, `{{$randomInt}}`, `{{$randomEmail}}`,
  `{{$randomName}}` (HitAPI extra).
- **Set variables from responses** ("extract"): e.g. save `$.token` from a login response into `token`.
  Used heavily by scenarios (doc 9).
- Hover a variable to see its current value and where it came from.

## Design

- `shared/vars.js` — pure `resolve(template, scopes)` function (unit-tested), dynamic generators.
- `background/workbench/environments.js`, storage key `wb:environments`, active env in `wb:activeEnv`.
- Resolution happens just before sending; the history entry stores both the template and the resolved request.

## Acceptance checklist

- [x] `{{baseUrl}}/users/{{userId}}` sends to the right URL in Dev and in Staging after switching.
- [x] Undefined variable is flagged and Send warns before sending.
- [x] Secret variable never appears in clear text in history or export.
- [x] `{{$uuid}}` is different on every send.
- [x] Extracting `$.token` from a login response sets `token` for the next request.
