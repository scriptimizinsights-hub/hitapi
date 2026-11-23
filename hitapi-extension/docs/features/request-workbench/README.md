# Request Workbench

Build, send and inspect any HTTP request in a full browser tab. Works without signing in.

## Open it

- **Toolbar popup:** the **Workbench** card at the top → **Open**. No account needed (the popup has no
  sign-in wall). After updating from an older version the card shows **New** until you open it once.
- **Keyboard shortcut:** **Alt+Shift+H** on any page (change it at `chrome://extensions/shortcuts`; the popup
  card shows the current one). Chrome reserves Alt+Shift+W, so H (for HitAPI) is used.
- **DevTools:** the **⇄ Workbench** tab in the HitAPI panel (its own draft, see [DevTools panel](../devtools-panel/README.md)).
- **Right-click** on any page or on the toolbar icon: **Open Workbench (send any API request)**.
- **From a captured request:** open it in the **Capture** list → **⇄ Open in Workbench**. Method, URL, headers
  and body are copied in. Browser headers (User-Agent, Origin, Referer) come in switched off; turn them on if
  the API checks them. In the popup this opens the Workbench tab; in DevTools, the panel's Workbench.
- **First install:** the Workbench opens by itself with a **Start here** note and a sample request
  (`GET https://services.hitapi.dev/mock/demo/users/42`, HitAPI's public demo API). **Got it** hides the note.

Only one Workbench tab is used; opening it again brings that tab to the front.

## Use

1. Pick a method (GET, POST, PUT, PATCH, DELETE, HEAD, OPTIONS) or **Custom…** and type any method name
   (for example `PURGE`). Browsers do not allow CONNECT, TRACE or TRACK.
2. Type or paste a URL. Without `http://` or `https://`, local addresses (`localhost:3000`, `192.168.x.x`,
   `*.local`) get `http://` and everything else gets `https://`.
3. **Params:** query parameters, in sync with the URL both ways. Switch a row off to keep it without sending it.
4. **Headers:** with suggestions for common names and values. **Bulk edit** shows them as text
   (`Name: value` per line; start a line with `//` to switch it off).
5. **Auth:** see [Auth](#auth) below. **Body:** see [Body](#body) below.
6. **Settings:** timeout (default 30 s), follow redirects, and whether to send this browser's cookies for the site.
7. Select **Send** or press **Ctrl/⌘ + Enter**. While it runs, the button becomes **Cancel** (or press **Esc**).

The response is described under [Response](#response) below.

## Auth

Pick **No auth · Bearer token · Basic auth · API key · Custom header · OAuth 2.0**. A summary under the fields
and a note at the top of the Headers tab show what will be added (secrets masked). The Auth header replaces a
header with the same name in the Headers tab, and the response warns when that happens.

- **Bearer token:** paste a token, or **Use detected token ▾** to pick one the extension saw while capturing
  (newest first, with the site it came from). The prefix is `Bearer` by default (some APIs use `Token` or `JWT`).
- **Basic auth:** username and password, sent as `Authorization: Basic …` (UTF-8 safe).
- **API key:** key name and value, sent as a **header** or a **query parameter** (added when sending; the URL bar
  stays as you typed it).
- **Custom header:** any header name and value, including protected ones such as `Cookie`.
- **OAuth 2.0 (client credentials):** token URL, client ID and secret, optional scope and audience, client
  credentials in the body or as a Basic header. **Get token** fetches one (the server's error is shown if it
  refuses); otherwise it is fetched on Send. Tokens are reused until 30 s before they expire, kept in
  `chrome.storage.session` (cleared when Chrome closes), and can be dropped with **Forget**.
- Missing values (no token, no key name…) stop the request with an explanation instead of sending it half done.
- Secret fields have **Show**/**Hide**. Values are kept with the draft in `chrome.storage.local` on this computer only.
- `curl -u user:pass` fills in Basic auth. **Copy as cURL** includes what the Auth tab adds.

## Body

Pick a type: **None · JSON · XML · Text · Form data · URL-encoded · Binary file · GraphQL**. Each type keeps
what you typed, so switching back and forth loses nothing. New requests start on JSON, ready for a paste.

- **JSON:** editor with line numbers and colours, a live **✓ Valid JSON / ✗ Line 3, column 5: …** check with
  **Go to error**, **Format** (2-space indent) and **Minify**. `{{variables}}` are allowed anywhere, even unquoted.
  Invalid JSON is still sent exactly as written, with a warning.
- **XML:** well-formed check and **Format**. **Text:** sent as written.
- **Form data:** text and **file** fields, sent as `multipart/form-data`. **URL-encoded:** key/value rows, like a
  classic HTML form. **Binary file:** one file as the whole body.
- **GraphQL:** query and variables editors, sent as JSON `{ query, variables, operationName }`.
- The editor starts about 16 lines tall, grows with the content up to about two thirds of the window and then
  scrolls; drag its corner to make it any size (it then stops growing on its own).
- In the editors **Tab** inserts two spaces, **Enter** keeps the indent (one level more after `{`, `[` or an
  opening tag), and undo works as usual. Bodies over 150 KB are shown without colours to stay fast.
- **Content-Type is automatic** (JSON and GraphQL `application/json`, XML `application/xml`, Text `text/plain`,
  URL-encoded `application/x-www-form-urlencoded`, Form data by the browser with its boundary, Binary from the
  file). The Body tab and the Headers tab show which one is used. A Content-Type header you add yourself wins;
  an empty one is ignored. A hand-written `multipart/form-data` without a boundary is replaced by the browser's.
- **Pasting JSON** into the Text editor switches the type to JSON; pasting JSON on a GET request switches the
  method to POST.
- **GET and HEAD can't carry a body** in browsers: the editor stays available with **Use POST / PUT / PATCH**
  buttons, and a body left on a GET is not sent (the response says so).
- **Files are not saved.** Chosen files stay on this computer until you send; after a reload the file name is
  remembered and the Workbench asks you to pick the file again.
- Captured requests, pasted cURL commands and older drafts open in the right type (JSON, XML, URL-encoded rows
  or Text) from their Content-Type and content.

## Response

The status line shows the status, the total time (click it for the breakdown), the body size (hover: body +
headers), the number of redirects and the final URL. **Copy** copies the body (or the headers on the Headers tab);
**Save** downloads the body with a sensible file name (`42.json`, `logo.png`, `report.pdf`).

- **Pretty:** JSON as a collapsible tree (opens three levels while branches are small; click a row to open or
  close it; **Expand all** / **Collapse all**). Big arrays show 200 items at a time. Hover a row to copy its
  **path** (`$.data[0].id`, ready for assertions) or its **value**. **Search** highlights matching keys and values,
  opens their parents and moves with Enter / Shift+Enter. XML is a collapsible element tree, HTML is coloured
  source, images and PDFs are shown directly. JSON or XML over 2 MB is shown as text so the page never freezes.
- **Links:** URLs in JSON values, and in `Link` and `Location` headers, are links. Clicking one opens it as a GET
  request with the same headers and auth (relative `next`/`self`/`href` values are resolved); **Undo** goes back.
- **Raw:** exactly what arrived, with a **Wrap long lines** switch. Binary bodies are not dumped as text.
- **Preview:** HTML pages in a sandboxed frame with scripts, forms and pop-ups turned off; images with their size
  in pixels; PDFs in Chrome's viewer.
- **Headers:** every header as the server sent it, including duplicates and `Set-Cookie` (read through
  `chrome.webRequest` for the Workbench's own request only), with a filter and their total size.
- **Cookies:** the `Set-Cookie` headers as a table: name, value, domain, path, expiry, HttpOnly / Secure / SameSite.
- **Timing:** total, time to the first byte and time reading the body; DNS, connect, TLS and server time when the
  server allows it (`Timing-Allow-Origin`); and each redirect with its status and target.
- The tab you pick is remembered for the next response.

## Automation: schedules, CLI, GitHub, API keys

- **Scheduled runs:** **⏰ Schedule** in a scenario, or **Schedule runs…** in the ⋯ menu of a scenario, collection
  or folder. Pick how often (5 minutes to daily), the environment, and when to be notified (when a run fails,
  after every run, never). Runs happen in the background while Chrome is open — no Workbench tab needed — and a
  notification tells you when one fails (click it to open the Workbench). The dialog shows the last 20 runs and
  the next one, and has **Run now**. **⏰ Schedules** (Scenarios tab) lists them all. Requests also appear in
  History; "Set vars" write to the schedule's environment.
- **Run in CI with the hitapi CLI:** export a collection (⋯ → **Export to a file**) or a scenario (⋯ → **Export
  for the CLI (CI)**) and run it with `npx hitapi-cli run <file> --junit results.xml`. Secrets are not in the
  file: give them with `HITAPI_VAR_<name>` (CI secrets), `--env-file` or `--var`. See `cli/README.md`.
- **Publish to GitHub:** ⋯ → **Publish to GitHub…** on a collection or scenario writes its file to a repository
  (repository, branch, folder, a fine-grained token with *Contents: read and write*), and can add a GitHub
  Actions workflow that runs it on every push. The token stays in this browser. The dialog lists the repository
  secrets to add for the variables the file needs.
- **API keys:** in the HitAPI web app, the key icon on your user card → **API keys**. A key (`hk_…`) lets CI and
  scripts use the HitAPI API — e.g. `hitapi-cli cloud run --project … --suite …` — without your password.
  It's shown once; delete it to stop it working.

## Backup and sync

- **☁ Backup** (header) opens *Backup & sync*:
  - **Storage:** how much of the browser's 10 MB is used, by collections, environments, scenarios and history,
    with **Clear history**.
  - **Export all** saves everything in one `hitapi-backup-<date>.json` file (optionally with history, and with
    secrets only if you tick *Include secrets*). **Import a backup** shows what will change, then **merges** it
    (adds and updates) or **replaces** what you have.
  - **Sync across devices** (signed in): tick *Sync with my HitAPI account* and your collections, environments and
    scenarios stay the same on every computer. Tokens, passwords, API keys and secret variables never leave your
    browser. If the same collection was changed on two computers, the other computer's version is kept and yours
    is saved as "(conflict copy)". **Delete the cloud copy** turns sync off and removes the synced data from your
    account.

## Import and export

- **Import** (Collections tab): drop a file, paste text or fetch a URL. HitAPI recognises **Postman** collections
  (v2.0/v2.1) and environments, **OpenAPI 3 / Swagger 2** (JSON or YAML), **HAR** recordings, **Insomnia**
  exports, HitAPI collection files and **cURL** commands, and shows what it will add before you press Import.
  Postman test scripts that check the status or a JSON value, or save a value with `pm.environment.set`, become
  Tests and Set vars rules.
- **Export** (a collection's ⋯ menu): HitAPI JSON, **Postman v2.1** (your Tests and Set vars become Postman
  scripts) or **OpenAPI 3** (JSON or YAML). Secrets are left out unless you tick *Include secrets*. An environment
  exports as a Postman environment from the Environments dialog.
- **</> Code** (header): the request as cURL, JavaScript (fetch), Node.js (axios), Python (requests), Go or PHP.
- **Export HAR** in the capture list (popup or DevTools) saves the captured requests as a HAR file.

## Scenarios

- A **scenario** runs requests one after another, e.g. log in → create an order → check it → delete it. Find
  them in the **Scenarios** tab of the sidebar; **+ Scenario** creates one.
- Add steps: a **saved request** (it stays linked, so edits to the request are used) or **the current request**
  (an unsaved one is copied into the scenario; open the step and press **Save to step** to change it).
- Each step can **wait** first, **repeat**, and **stop the run** or **continue** when it fails. A step passes when
  its Tests pass (or, without tests, when the status is below 400). Steps share variables: a login step's
  **Set vars** rule can save `{{token}}` for the steps after it.
- **▶ Run** uses the environment picked in the header and shows each step live. **Re-run failed** runs only the
  steps that failed. Click a result to see its request and response.
- **Data-driven runs:** paste or load a CSV (first row = variable names) or a JSON array; the scenario runs once
  per row with those values as `{{variables}}`.
- Signed in, **Send to HitAPI as a flow suite** (⋯ menu) puts the scenario in a project so it can run in the cloud
  on a schedule; **⚡ From HitAPI** turns a flow suite into a scenario. Secrets are not sent.

## Tests

- The **Tests** tab holds checks that run on every response: status code, a header, a value in the JSON body
  (by JSONPath, e.g. `$.data[0].id`), a value in an XML body (by XPath), the response time, text in the body,
  or a JSON Schema. Examples: *Status code equals 200*, *`$.meta.total` equals 2*, *Content-Type contains
  json*, *Response time is below 500*.
- Quick ways to add them: hover a value in the JSON response and press **test** (or right-click it), or press
  **✨ Suggest checks** after a response.
- After each send the status line says how many passed, and the response's **Tests** tab lists each check with
  the expected and actual value.
- Checks are saved with the request. The runner uses them to decide pass or fail, and history shows the result.
- `{{variables}}` work in paths and expected values.

## Variables and environments

- Write `{{name}}` anywhere in a request: URL, headers, body, auth fields (and a collection's base URL), e.g.
  `{{baseUrl}}/users/{{userId}}` with `Authorization: Bearer {{token}}`.
- **Environments** (Development, Staging, Production…): pick one in the header; *Manage environments…* opens the
  editor with **Globals** and your environments. Give each environment the same names with its own values.
  Collections and folders can have variables too (in their settings).
- Which value is used: **environment → folder → collection → globals** (the first that has it).
- Tick **Secret** for tokens and passwords: shown as dots, left out of exports, never kept in history.
- Under the URL, the **variables line** shows each variable with its value and where it comes from, undefined
  ones in red, and the URL as it will be sent. Sending with an undefined variable asks first.
- **Dynamic variables** get a new value each time: `{{$uuid}}`, `{{$timestamp}}`, `{{$isoDate}}`,
  `{{$randomInt}}`, `{{$randomEmail}}`, `{{$randomName}}` (the full list is in the Environments dialog).
- **Set vars** tab: save values from the response into variables after each send, e.g. `token ← $.token`
  (JSON body), `session ← X-Session` (header) or the status code. They go into the environment in use (or
  Globals). The runner applies them too, so a login request can set `{{token}}` for the requests after it.

## Collections

- **Save** a request (header button, or **Ctrl/⌘ + S**): give it a name and pick a collection or folder, or
  make a new collection. **Ctrl/⌘ + Shift + S** saves a copy. Saved requests live in the **Collections** tab
  of the sidebar (☰ Collections & History in the header).
- A saved request shows where it lives (*Collection / Folder / Name*) above the URL, with **● edited** when it
  has unsaved changes, **Save**, **Save as…** and **Detach** (keep editing it as an unsaved request).
- Organise with **+ Collection** and each row's **⋯** menu: new request, new folder, run, settings, rename,
  duplicate, export, send to HitAPI, delete. Double-click (or F2) renames; **drag and drop** reorders rows or
  moves them into another folder or collection. The filter box finds saved requests by name or URL.
- **Collection settings:** base URL, headers and auth. **Folder settings:** headers and auth.
  - A request URL that starts with `/` is sent to the base URL + that path (the full URL is shown).
  - Collection and folder headers are sent too; a request's own header with the same name wins.
  - Auth tab **Inherit** (the default for saved requests) uses the folder's or collection's auth.
- **Run** a collection or folder: every request is sent in order and shown with its status (a status below
  400 passes). Stop, run again, or wait between requests. Click a result to see that response.
- **Export** a collection to a `.hitapi.json` file (secrets left out unless you tick *Include secrets*) and
  **Import** it on another computer.
- **HitAPI projects** (signed in): *Send to a HitAPI project* (⋯ menu) adds your saved requests to a project as
  endpoints, so the web app can generate tests and mocks for them. Endpoints already there are skipped, and no
  secrets are sent. *⚡ From HitAPI* makes a collection from one of your projects.
- Collections are kept in this browser (`chrome.storage.local`). Each open Workbench shows changes at once.

## History

- Every request you send is kept, with its response (bodies up to 256 KB; images, PDFs and binary bodies
  are not kept). Failed requests are kept too.
- The **History** tab of the sidebar lists them newest first, by day.
  Search looks through the URL, method, status, request body and the start of the response; filter by
  method, status (2xx, 3xx, 4xx, 5xx, failed) or host.
- **Click an entry** to open it for editing, with Undo. Its old response is shown greyed until you send again.
- **Secrets are not kept** (default): Authorization, Cookie and API-key headers, and the Auth tab's token,
  password, API key and client secret. When you open an entry they are taken from the request you have
  open now; a note names anything still missing so you can enter it again.
- Delete an entry (✕ on hover), **Clear older than 7 days** or **Clear all**. The latest 500 requests are
  kept (about 5 MB).
- ⚙ settings: turn history off, keep secrets too, or list hosts never to record (`bank.com, *.internal`).
- **↻ Resend** on a captured request (popup or DevTools) opens the Workbench and sends it at once.
- History stays in this browser (`chrome.storage.local`) and is never uploaded.

## cURL

- **Paste a cURL command into the URL bar** and the Workbench fills in the method, URL, params, headers,
  body and auth. A command typed by hand is imported when you press Send.
- **Import cURL** (header) opens a box for long, multi-line commands.
- Accepts Chrome, Firefox and Edge **Copy as cURL** (bash and cmd), Postman, Insomnia and API docs, with
  line breaks ending in `\`, `^` or `` ` `` (the same parser as the HitAPI web API Playground).
- `-u user:pass` becomes an `Authorization: Basic` header. A JSON body without a `Content-Type` gets
  `application/json` (plain curl would send it as a form). Headers the browser sets itself (`sec-ch-ua`,
  `sec-fetch-*`, `accept-encoding`…) are skipped, and User-Agent, Origin and Referer come in switched off.
  File uploads (`-d @file`, `-F name=@file`) can't be imported.
- A note lists anything that was changed or skipped, with **Undo** to get back the request you had before.
- **Copy as cURL** (header) copies the current request as a bash cURL command (switched-off headers left out),
  with the right flags for the body type (`--data-raw`, `--data-urlencode`, `-F name=@file`, `--data-binary @file`).

## How it behaves

- **No CORS errors.** Requests are sent from the extension, which may reach any host, so APIs that don't
  allow browser calls, `localhost` and intranet APIs all work.
- **Protected headers.** Browsers block `Cookie`, `Origin`, `Referer`, `User-Agent` (and a few others) in
  normal web requests. These rows show **browser rule**: the Workbench sets them with a temporary
  `declarativeNetRequest` rule that matches only this tab, method and URL, and removes it as soon as the
  response arrives (after 2 minutes at the latest). Other tabs and sites are never affected.
- **No extension Origin.** If you don't set an `Origin` header, none is sent (Chrome would otherwise send
  `chrome-extension://…`, which some APIs reject).
- **Not sendable.** `Host`, `Content-Length`, `Connection`, `Transfer-Encoding` and `Sec-*` headers are set by
  the browser itself; they are marked **not sendable** and skipped with a warning.
- **Readable errors.** Instead of "Failed to fetch", a failed request shows the reason, for example
  *Connection refused* or *host name could not be found*, with Chrome's error code.
- **Drafts are kept.** The request is saved in `chrome.storage.local` as you type, so closing the tab or
  restarting Chrome loses nothing. The draft holds no response; responses are kept in History.
- Bodies over 10 MB are cut off (the response says so). `Set-Cookie` response headers are never visible to
  extensions.

## Permission

Uses `declarativeNetRequestWithHostAccess` for protected headers (added in v1.7.0), `alarms` and `notifications` (added in v2.0.0) for scheduled runs. Each rule matches only
requests this extension starts (`initiatorDomains` = the extension), with the same method and URL, and the
Workbench tab when there is one (the DevTools Workbench has no tab id). Web pages are never affected.

## Code

`workbench/` (page, `state.js`, `send.js`, `views/`, `views/body/` for the Body tab; `?embed=panel` for DevTools),
`shared/body.js` (body types, checks, formatting, building what is sent), `shared/auth.js` (auth types and what
they add), `workbench/oauth.js` (OAuth tokens), `workbench/views/auth-pane.js`, `shared/response.js` and `workbench/views/response/` (viewer, JSON and XML trees), `shared/curl.js`, `background/workbench/`
(`tokens.js` lists detected tokens),
(`open.js`, `entry.js` for the shortcut and install/update, `protected-headers.js`, `net-errors.js`),
`shared/http.js` (URL, params and header helpers), `shared/history.js`, `workbench/history-store.js` and
`workbench/views/history-sidebar.js` (history), `shared/collections.js`, `workbench/collections-store.js`,
`workbench/views/collections-pane.js`, `collection-dialogs.js`, `runner.js` and `background/workbench/hitapi-sync.js` (collections),
`shared/backup.js`, `shared/sync.js`, `workbench/sync.js` and `workbench/views/backup-dialog.js` (backup and sync),
`shared/convert/` and `workbench/views/import-dialog.js`, `code-dialog.js` (import, export, code),
`shared/assert.js` and `workbench/views/tests-pane.js` (tests), `shared/scenarios.js`, `workbench/scenarios-store.js` and
`workbench/views/scenarios-pane.js`, `scenario-editor.js`, `scenario-dialogs.js` (scenarios), `shared/schedules.js`, `workbench/run-core.js`, `workbench/schedules-store.js`, `workbench/views/schedule-dialog.js` and `background/workbench/scheduler.js` (scheduled runs), `shared/ci.js`, `workbench/github.js` and `workbench/views/github-dialog.js` (CLI export, Publish to GitHub), `shared/vars.js`, `workbench/env-store.js`, `workbench/views/env-dialog.js`, `vars-table.js` and `extract-pane.js` (variables), and in the popup `ui/views/workbench-card.js` and
`ui/views/sign-in-prompt.js`.
