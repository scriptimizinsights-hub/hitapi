-- Web roadmap W9: cloud schedules for Workbench collections, folders and scenarios.
-- The target comes from the user's account copy (extension_sync, migration 0017).
-- secrets: AES-GCM encrypted JSON { variableName: value } for this schedule only (never returned by the API).

CREATE TABLE IF NOT EXISTS schedules (
  id            TEXT PRIMARY KEY,
  user_id       TEXT NOT NULL,
  name          TEXT NOT NULL,
  target_kind   TEXT NOT NULL,              -- 'collection' | 'folder' | 'scenario'
  target_id     TEXT NOT NULL,
  every_min     INTEGER NOT NULL,           -- 5 … 1440
  env_id        TEXT,                       -- environment in the account copy; NULL = Globals only
  notify        TEXT NOT NULL DEFAULT 'failures',   -- 'failures' | 'always' | 'never'
  notify_email  INTEGER NOT NULL DEFAULT 1,
  webhook_url   TEXT,
  secrets       TEXT,
  secret_names  TEXT,                       -- JSON array: which variables have a stored value (names only)
  enabled       INTEGER NOT NULL DEFAULT 1,
  next_run_at   INTEGER NOT NULL,
  last_run_at   INTEGER,
  last_status   TEXT,                       -- 'passed' | 'failed' | 'error'
  running_since INTEGER,
  created_at    INTEGER NOT NULL,
  updated_at    INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_schedules_due ON schedules(enabled, next_run_at);
CREATE INDEX IF NOT EXISTS idx_schedules_user ON schedules(user_id);

CREATE TABLE IF NOT EXISTS schedule_runs (
  id           TEXT PRIMARY KEY,
  schedule_id  TEXT NOT NULL,
  user_id      TEXT NOT NULL,
  started_at   INTEGER NOT NULL,
  finished_at  INTEGER,
  reason       TEXT,                        -- 'cron' | 'manual'
  status       TEXT,                        -- 'passed' | 'failed' | 'error'
  passed       INTEGER DEFAULT 0,
  failed       INTEGER DEFAULT 0,
  total        INTEGER DEFAULT 0,
  ms           INTEGER DEFAULT 0,
  error        TEXT,
  failures     TEXT,                        -- JSON [{ name, reason }] (first 5)
  results      TEXT,                        -- JSON, each request (bodies cut to 10 KB)
  alert        TEXT                         -- what was sent: 'email', 'webhook', 'email skipped: …'
);
CREATE INDEX IF NOT EXISTS idx_schedule_runs_schedule ON schedule_runs(schedule_id, started_at);
