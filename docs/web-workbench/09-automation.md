# W9. Automation: cloud schedules, CLI, API keys, GitHub

**Extension feature covered:** 12 Automation.
**Who:** signed-in users (these need an account and the server). Free with fair limits.
**Status:** ✅ Built. Needs a worker deploy, migration 0019 (run it yourself in D1 Studio) and the cron trigger.

## Goal
Run collections and scenarios on a schedule **in the cloud** (the browser can be closed — better than the
extension's Chrome-only schedules), get alerts when they fail, and connect to CI.

## User stories
1. I schedule "Checkout flow" every 15 minutes against Production and get an email when it fails.
2. I see a history of runs with what failed and why.
3. I create an API key for my CI and copy the `hitapi-cli` command.
4. I publish a collection and a GitHub Actions workflow to my repository from the website.

## Functional requirements

### Cloud schedules (fills the "Monitors" placeholder)
- R1. "Schedule runs…" on a collection, folder or scenario (account data, W8) and a **Schedules** page listing
  them: what, how often, environment, last run, next run, on/off.
- R2. Frequencies: every 5 / 15 / 30 min, hourly, every 3 / 6 / 12 h, daily. Limits (proposal): 10 schedules per
  user, 5-minute minimum, 100 requests per run.
- R3. Runs on the worker: Cloudflare Cron Triggers (`scheduled()` handler exists) pick due schedules → queue job →
  run with the shared engine (`runScenario`, `runTests`, `runExtract`) and the same proxy rules (no private hosts).
- R4. Secrets: the run needs values the account copy doesn't have (W8 strips them). The schedule dialog asks for
  the secret variables it needs and stores them **encrypted** for that schedule only (AES-GCM with a worker
  secret), never shown again; "update secrets" button.
- R5. Run history per schedule (last 50): passed/failed, failures with reasons, duration; open a run to see each
  request (bodies cut to 10 KB).
- R6. Alerts: email on failure (and on recovery), optional webhook (Slack-compatible JSON); "after every run" /
  "on failure" / "never".
- R7. Pause, Run now, delete.

### CLI and API keys (exist — link them in)
- R8. API keys page exists (`/account/api-keys`). Add "Use in CI" help on collections/scenarios: the
  `npx hitapi-cli run …` command, and **Download for the CLI** (collection / scenario file, shared/ci.js).
- R9. `hitapi cloud run` can also run a schedule's target by id (new CLI option) — optional.

### Publish to GitHub
- R10. Same dialog as the extension (repo, branch, folder, token, workflow). The token is used from the browser
  directly to GitHub's API and kept in this browser only (not sent to HitAPI). Signed-in only (data comes from the
  account).

## Non-functional
- A schedule starts within 1 minute of its time; a stuck run is stopped after 5 minutes.
- Cron fan-out: one cron per minute, due schedules picked in batches (no per-schedule cron).

## Backend changes
- Migration: `schedules` (user, target kind/id, every, env id, notify, enabled, encrypted secrets, next_run_at),
  `schedule_runs` (schedule, at, passed, failed, ms, failures JSON, results JSON capped).
- Worker: routes `GET/POST/PATCH/DELETE /api/schedules`, `POST /api/schedules/:id/run`, `GET /api/schedules/:id/runs`;
  cron `* * * * *` in `wrangler.toml`; queue message `schedule_run`; email sending (Cloudflare Email / MailChannels /
  Resend — to decide).
- The shared engine must run in the worker: `shared/` modules are already free of browser APIs except XPath
  (DOMParser) → XPath tests marked "not available in cloud runs" or a small XPath library.

## Reuse from the extension
`shared/schedules.js` (model, run records, notification text), `shared/scenarios.js`, `shared/assert.js`,
`shared/vars.js`, `shared/ci.js`; extension's schedule and GitHub dialogs as UI reference.

## What was built
- **Schedule a collection, folder or scenario** (⋯ → "Schedule runs in the cloud…") and a **Schedules** page
  (`/schedules`, sidebar link; the project "Monitors" placeholder now points there): name, what, how often,
  environment, secret names, last result (with the failures), next run, On/Off, Run now, run history (last 50; open
  a run for each request: status, time, tests, variables set, body cut to 10 KB), edit, delete, "+ New schedule".
- **Frequencies:** every 5 / 15 / 30 min, hourly, 3 / 6 / 12 h, daily. **Limits:** 10 schedules per account,
  every 5 minutes at most, 100 requests per run (data rows × repeats counted before saving and during the run),
  a run is stopped after 5 minutes.
- **Where the requests come from:** the account copy of the Workbench (W8 must be on; the dialog says so).
  Before saving, the website saves its latest changes to the account.
- **Secrets:** the dialog lists the secret `{{variables}}` the requests use (not ones a "Set vars" step makes),
  filled in from this browser; they are stored for that schedule only, **AES-GCM encrypted** (the existing
  `ENCRYPTION_KEY`), never returned (the API gives names). Editing: empty = keep, typed = replace. A token typed
  straight into a request (not a variable) is pointed out: it can't run in the cloud.
- **Fix in W8 sync (`shared/sync.js`):** `{{variable}}` references such as `Bearer {{token}}` are now kept in the
  account copy (they were blanked with the secrets, so cloud runs and new devices got an empty token). Shared with
  the extension → **extension 2.1.1**.
- **Runs on the worker:** a cron every minute (`[triggers] crons = ["* * * * *"]`) claims due schedules (25 at a
  time, so two workers can't run one twice) and sends them to the existing queue (`schedule_run` messages); without
  a queue they run in the background. The engine is the extension's own (`hitapi-extension/shared`: collections,
  variables, tests, Set vars, `runScenario`), bundled into the worker; requests go through the public proxy (no
  private hosts, redirects checked, 15 s, 2 MB). XPath checks are not available in cloud runs (they say so).
- **Alerts:** "when a run fails (and when it works again)" / "after every run" / "never"; a **webhook** (https,
  Slack-compatible JSON: `text`, `status`, `passed`, `failed`, `failures`) and **email** through Resend when the
  worker has `RESEND_API_KEY` (and optionally `ALERT_FROM`, `SITE_URL`). Without it the run records "email
  skipped: no email provider is set up on the server" and the Schedules page says email isn't set up yet.
- **CI:** collection / scenario ⋯ → "Use in CI (hitapi-cli)…": the `npx hitapi-cli run …` command with the
  variables CI must give (`--var`, `HITAPI_VAR_*`), JUnit, the cloud-run command with an API key (link to the API
  keys page), **Download for the CLI** and Publish to GitHub.
- **Publish to GitHub:** the extension's dialog and logic (repo, branch, folder, token, workflow, GitHub
  Enterprise URL). The token goes from the browser straight to GitHub and is kept in this browser only
  (`hitapi:web:github`), never sent to HitAPI.
- **Worker files:** `migrations/0019_schedules.sql` (tables `schedules`, `schedule_runs`),
  `src/services/schedules/engine.js`, `src/services/schedules/runner.js`, `src/routes/schedules.js`;
  `src/index.js` (routes, cron, queue); `wrangler.toml` (cron).
  **Website files:** `schedules-api.js`, `ScheduleDialog.jsx`, `SchedulesPage.jsx`, `github.js`, `CiDialogs.jsx`
  (new); `Workbench.jsx`, `CollectionsPanel.jsx`, `ScenariosPanel.jsx`, `sync.js`, `workbench.css`; `App.jsx`
  (route, Monitors page), `Sidebar.jsx` (link), `seo/pages.js` (noindex).

## Acceptance checklist
- [x] A schedule runs with the browser closed and records the run (the cron through the queue, tested locally).
      Failure alerts: webhook tested; **email needs `RESEND_API_KEY`** (see open question 1).
- [x] Secrets entered for a schedule are encrypted at rest (checked in D1: `enc:v1:…`) and never returned by the API
      or stored in run results.
- [x] Limits enforced (10 schedules, every 5 minutes, 100 requests per run).
- [x] Download for the CLI → `hitapi-cli run` passes (run locally the way the workflow runs it; a real GitHub
      Actions run is still to do).
- [x] Publish to GitHub from the website writes the file and the workflow (tested against a fake GitHub API).

## Open questions
1. **Email provider:** built for Resend (one API key). Set `RESEND_API_KEY` (and a verified `ALERT_FROM`) as worker
   secrets, or pick another provider.
2. Limits OK (10 schedules, 5 min, 100 requests/run)? They are constants in `services/schedules/runner.js`.
3. Should extension schedules be able to "move to the cloud" (same schedule, runs on the server)?
4. R9 (`hitapi cloud run` by schedule id) is not built yet.
