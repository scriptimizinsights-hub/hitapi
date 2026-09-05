-- Local agent job queue — lets the browser extension execute requests
-- against localhost/private-network APIs that the Cloudflare Worker
-- itself cannot reach.

CREATE TABLE IF NOT EXISTS local_agent_jobs (
  id           TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  project_id   TEXT NOT NULL,
  user_id      TEXT NOT NULL,          -- only this user's extension may claim it
  run_id       TEXT,                   -- flow_runs.id, if part of a suite run
  step_id      TEXT,                   -- flow_steps.id, if part of a suite run

  method       TEXT NOT NULL,
  url          TEXT NOT NULL,
  headers      TEXT,                   -- JSON
  body         TEXT,                   -- JSON string or null

  status       TEXT NOT NULL DEFAULT 'pending', -- pending | claimed | done | failed | expired
  result_status  INTEGER,
  result_body    TEXT,                 -- JSON string
  result_headers TEXT,                 -- JSON
  error          TEXT,

  claimed_at   INTEGER,
  completed_at INTEGER,
  created_at   INTEGER NOT NULL DEFAULT (unixepoch()),
  expires_at   INTEGER NOT NULL DEFAULT (unixepoch() + 30) -- 30s to be claimed+completed
);

CREATE INDEX IF NOT EXISTS idx_local_jobs_user_status ON local_agent_jobs(user_id, status);
CREATE INDEX IF NOT EXISTS idx_local_jobs_run ON local_agent_jobs(run_id);

-- Track when each user's extension last checked in — powers the
-- "Agent connected" indicator in the dashboard.
CREATE TABLE IF NOT EXISTS local_agent_heartbeats (
  user_id      TEXT PRIMARY KEY,
  last_seen_at INTEGER NOT NULL
);