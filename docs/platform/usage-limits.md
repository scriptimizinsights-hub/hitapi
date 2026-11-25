# Staying inside D1's daily free limit

**Status:** ✅ Built. Deploy the worker (no migration), the website, then extension 2.1.2.

## The problem
On the Workers Free plan D1 allows 100,000 rows written a day. Since September 2026 every D1 query fails once the
account is over the limit (reads too), until 00:00 UTC (05:30 IST), so the whole app looks stuck.
Each index on a table adds one written row per write, so an insert into `request_logs` (3 indexes) costs 4 rows.

## Where the writes come from (from the code)
| Source | Now, per user with the extension open all day | After this fix |
|---|---|---|
| Extension polling `GET /api/agent/jobs` every 2 s, each logged in `request_logs` | 43,200 calls × 4 ≈ 173,000 rows | 0 (polls only during a run, never logged) |
| Heartbeat in `local_agent_heartbeats` (rewritten every ~6 s) | about 14,000 rows | 0 (no heartbeat) |
| Cloud schedules (per schedule every 5 min, ~6 rows a run) | about 1,700 rows | about 70 (hourly, ~3 rows a run) |
| Local Agent jobs, never deleted | the table only grows | finished jobs older than a day deleted |

## What was built
1. **No heartbeat, no idle polling.** `GET /api/agent/jobs` no longer writes a heartbeat. The extension's Local Agent
   (switch on) asks for jobs only while it is *listening*: for 2 minutes after the website starts a project flow run,
   and again each time the website checks on that run (`HITAPI_AGENT_WAKE` through the existing website ↔ extension
   bridge; turning the switch on also listens for 2 minutes). Idle: no requests at all. The switch shows "Ready: starts
   listening when you run a flow on hitapi.dev" / "Listening: localhost steps of your run go through this browser".
   `/api/agent/status` still answers for old callers (`connected: null, checkInBrowser: true`); nothing on the website
   used it. Extension **2.1.2**. Older extensions still poll every 2 s until updated, but those polls are no longer
   logged or heartbeated, so they cost reads only.
2. **Traffic log:** `/api/agent/*` and `GET /api/extension/sync` are not written to `request_logs`.
3. **Schedules:** free plan = at most hourly (`FREE_SCHEDULE_MIN_EVERY = 60`; choices 1 h, 3 h, 6 h, 12 h, daily).
   Older 5–30-minute schedules run hourly (shown as "Every hour"), no migration. A run is written once, at the end
   (no "running" row), and old runs are trimmed on about 1 run in 10: about 3 written rows a run instead of 6+.
   Cron `0 * * * *` (the old `* * * * *` is still understood if `wrangler.toml` lags behind).
4. **Local Agent jobs:** the hourly cron deletes jobs older than a day (500 at a time).
5. **The limit, clearly:** D1's "exceeded … daily row read/write limit" (thrown, or inside a 5xx body) becomes
   **503 `{ code: 'DAILY_LIMIT', resetsAt }`** with `Retry-After`, also for API keys (the CLI) instead of
   "Unauthorized". The website shows a banner on every page, signed in or not: "HitAPI has reached today's free usage
   limit. Signing in, saving to your account, projects and schedules are paused until 05:30 (in about N h). The API
   Workbench in this browser still works." + **Upgrade** → `/pricing`. Admins also see "Upgrade the Cloudflare account
   to Workers Paid ($5/month)". During the limit nobody is signed out (the profile comes from the last good one / the
   login token) and the Terms screen waits until it's over. Sending from HitAPI cloud keeps working (it uses KV, not D1).
6. **`/pricing`:** Free (current: what's included, hourly schedules, the daily pause) and Pro "Coming soon" with
   **Notify me** (an email to support@hitapi.dev).
7. **Testing it locally:** `wrangler dev --var DEV_SIMULATE_DAILY_LIMIT:1` makes every D1 query fail with Cloudflare's
   message (development only; never set it in production).

## Files
Worker: `services/dailyLimit.js` (new), `services/requestLog.js`, `routes/index.js` (agent), `index.js` (limit
answer, cron), `services/schedules/runner.js`, `routes/schedules.js`, `services/apiKeys.js`, `wrangler.toml` (cron).
Extension: `background/agent/local-agent.js`, `background/workbench/web-bridge.js`, `shared/config.js`,
`ui/views/agent-bar.js`, `manifest.json` (2.1.2).
Website: `utils/dailyLimit.js`, `components/ui/DailyLimitBanner.jsx`, `components/ui/PricingPage.jsx` (new);
`store/index.js`, `components/workbench/bridge.js`, `schedules-api.js`, `sync.js`, `ScheduleDialog.jsx`,
`components/ui/TermsGate.jsx`, `App.jsx`, `entry-server.jsx`, `seo/pages.js`, `styles/global.css`.

## Not in this step
Real paid plans (payments, a Pro plan). "Notify me" on /pricing only opens an email.
Flow runs started outside the website (API, CLI) can't reach localhost through the extension: it isn't listening.
