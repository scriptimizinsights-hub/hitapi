# W9. Automation: cloud schedules, CLI, API keys, GitHub

**Extension feature covered:** 12 Automation.
**Who:** signed-in users (these need an account and the server). Free with fair limits.
**Status:** 📝 Requirements.

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

## Acceptance checklist
- [ ] A schedule runs with the browser closed and records the run; failures email the user.
- [ ] Secrets entered for a schedule are encrypted at rest and never returned by the API.
- [ ] Limits enforced (count, frequency, requests per run).
- [ ] Download for the CLI → `hitapi-cli run` passes in a GitHub Actions run.
- [ ] Publish to GitHub from the website writes the file and the workflow.

## Open questions
1. Email provider for alerts?
2. Limits OK (10 schedules, 5 min, 100 requests/run)?
3. Should extension schedules be able to "move to the cloud" (same schedule, runs on the server)?
