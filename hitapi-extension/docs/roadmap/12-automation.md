# 12. Automation and Integration

**Talend parity:** #82–85 (automation via scenarios, Maven plugin, management API, GitHub publishing).
**Talend Free:** Maven plugin, management API and GitHub publishing are **not available** (paid only).
**Status:** ✅ Done in v2.0.0 (user guide: [Request Workbench → Automation](../features/request-workbench/README.md#automation-schedules-cli-github-api-keys)).
API keys need worker migration `0018_api_keys.sql`, the new `/api/keys` routes and the frontend deployed.
The CLI needs `cd cli && npm publish` before `npx hitapi-cli` works for other people.

### What was built

**Scheduled runs (in Chrome)**
- A scenario, collection or folder can run on a schedule: **⏰ Schedule** in the scenario editor, **Schedule
  runs…** in the ⋯ menu of a scenario, collection or folder, and **⏰ Schedules** (overview) in the Scenarios tab.
- Every 5 / 15 / 30 minutes, hourly, every 3 / 6 / 12 hours or daily; the environment to use (not the one
  selected in the Workbench); notify *when a run fails* (default), *after every run* or *never*; pause / resume;
  **Run now**; the last 20 runs with what failed and why; next run time.
- The **service worker** runs them with `chrome.alarms`, so they run whenever Chrome is open, even with no
  Workbench tab. A run due while Chrome was closed happens once when it opens. Runs use the same code as the
  Workbench (`workbench/run-core.js`): collection base URL / headers / auth, variables, tests, History (secrets
  redacted), "Set vars" into the schedule's environment, protected headers (Cookie…) via declarativeNetRequest.
  A scenario's scheduled run becomes its last report.
- A Chrome notification on failure (title "HitAPI: "Name" — 2 of 5 failed", first failure as the text);
  clicking it opens the Workbench. A deleted target or environment is reported as a failed run.
- New permission: `notifications` (`alarms` was already there).

**CLI runner for CI — `hitapi-cli` (new package `cli/`)**
- `hitapi run <file…>` runs HitAPI collections, scenario files, backups and Postman v2.0/2.1 collections with
  the extension's own shared code (copied by `scripts/copy-shared.mjs`), so results match the Workbench.
- Variables from `--env-file` (Postman env, HitAPI backup + `--env`, JSON, `.env`), `HITAPI_VAR_<name>` (CI
  secrets) and `--var`; secret values are blanked out of output and reports. `--folder`, `--scenario`,
  `--collection`, `--data` (CSV/JSON rows), `--bail`, `--timeout`, `--delay`, `--export-env`.
- Reports: terminal (default), `--reporter json|junit`, `--junit <file>`, `--json <file>`. Exit 0 / 1 / 2.
- `hitapi cloud run --project --suite` starts a HitAPI cloud flow suite with a personal API key and waits for
  it (JUnit / JSON too).
- README, GitHub Actions and GitLab CI examples. 10 self-contained tests (`npm test`).
- In the extension: scenario ⋯ → **Export for the CLI (CI)** writes a self-contained `*.scenario.json`
  (saved requests copied in with their collection's base URL, headers, auth and variables).

**Personal API keys (management API)**
- Worker: `migrations/0018_api_keys.sql`, `src/services/apiKeys.js`, `src/routes/apiKeys.js`:
  `GET /api/keys`, `POST /api/keys` (`{ name, expires_in_days? }` → the key, shown once), `DELETE /api/keys/:id`.
  Keys are `hk_` + 40 random characters; only a SHA-256 hash is stored; at most 20 per user; optional expiry;
  last used time.
- `requireAuth` accepts `Authorization: Bearer hk_…` or `X-API-Key: hk_…` and acts as the key's user on every
  route. A key can't create or delete keys, can't use `/api/admin…`, and never gets the super-admin read-only
  view of other people's projects.
- Web app: **API keys** page (`/account/api-keys`, key icon on the user card in the sidebar): create (name,
  expiry), copy once, list (prefix, created, last used, expires), delete, usage examples.

**Publish to GitHub**
- ⋯ → **Publish to GitHub…** on a collection or scenario: repository (`owner/name` or a URL), branch, folder,
  a fine-grained token (kept in this browser only — not synced, not in backups), commit message, and optionally
  a GitHub Actions workflow (`.github/workflows/hitapi.yml`, created only if it isn't there) that runs the files
  with `hitapi-cli` on every push and uploads the JUnit report.
- Writes with the GitHub contents API (updates the file if it exists, skips it if unchanged). The preview lists
  the repository secrets to add (`HITAPI_VAR_token` …) for the `{{variables}}` the file needs. GitHub
  Enterprise: API URL under "GitHub Enterprise". Errors are explained (bad token, no access, unknown repo or
  branch, conflicts).
- Exports keep `{{variable}}` references in auth and secret headers (e.g. `Bearer {{token}}`) and blank only
  real secret values — this also applies to **Export to a file**.

- Code: `shared/schedules.js`, `shared/ci.js`, `workbench/run-core.js`, `workbench/schedules-store.js`,
  `workbench/github.js`, `workbench/views/schedule-dialog.js`, `workbench/views/github-dialog.js`,
  `background/workbench/scheduler.js`; `workbench/send.js` (`setRpc`, works in the service worker);
  `workbench/history-store.js` (test results are redacted too). CLI: `cli/`. Worker and frontend as above.
- Tests: 49 checks in the extension (`test14.cjs`: schedules incl. a real alarm firing, notifications, Run now,
  export, GitHub publish against a fake GitHub API), 10 CLI tests, 6 checks running the extension's exported
  and published files with the CLI (`test16.cjs`), 16 checks for API keys and the web page against a local
  worker (`test15.cjs`).

## Acceptance checklist

- [x] A scenario scheduled every N minutes runs with no Workbench tab open and notifies on failure.
- [x] `hitapi run` runs an exported collection / scenario / Postman collection and exits 1 when a test fails; JUnit report readable by CI.
- [x] CI secrets come from `HITAPI_VAR_*` and never appear in output or reports.
- [x] A personal API key can call the HitAPI API (`cloud run`), can't manage keys or use admin routes, and stops working when deleted.
- [x] Publish to GitHub writes the file (and a workflow once), updates it on the next publish, and explains errors.
- [ ] Workflow run on real GitHub Actions (tested with the same command locally; needs `hitapi-cli` on npm).
- [ ] Notifications on macOS / Windows desktop (tested in headless Chromium: created and clickable).

## Not done (later)

- Generated test code (Playwright / Jest …) to GitHub from the extension: the web app's test export does this.
- Schedules in the cloud when Chrome is closed: use HitAPI flow suites (push the scenario, then
  `hitapi cloud run` from CI or a cron job).
