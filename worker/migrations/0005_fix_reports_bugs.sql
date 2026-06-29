-- Fix 1: Recreate reports table with nullable execution_id to support flow runs
CREATE TABLE IF NOT EXISTS reports_new (
  id           TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  execution_id TEXT,  -- nullable: regular test executions link here
  project_id   TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  flow_run_id  TEXT,  -- flow suite runs link here
  format       TEXT NOT NULL DEFAULT 'json',
  r2_key       TEXT NOT NULL DEFAULT '',
  size_bytes   INTEGER,
  created_at   INTEGER NOT NULL DEFAULT (unixepoch())
);

INSERT OR IGNORE INTO reports_new (id, execution_id, project_id, format, r2_key, size_bytes, created_at)
SELECT id, execution_id, project_id, format, r2_key, size_bytes, created_at FROM reports;

DROP TABLE reports;
ALTER TABLE reports_new RENAME TO reports;

-- Fix 2: Recreate bugs table with nullable execution_id (in case migration 0003 wasn't run)
CREATE TABLE IF NOT EXISTS bugs_fix (
  id            TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  project_id    TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  execution_id  TEXT,
  endpoint_id   TEXT REFERENCES endpoints(id) ON DELETE SET NULL,
  flow_run_id   TEXT,
  flow_step_id  TEXT,
  severity      TEXT NOT NULL DEFAULT 'medium',
  title         TEXT NOT NULL DEFAULT 'Bug',
  description   TEXT NOT NULL DEFAULT '',
  root_cause    TEXT,
  suggested_fix TEXT,
  status        TEXT NOT NULL DEFAULT 'open',
  created_at    INTEGER NOT NULL DEFAULT (unixepoch())
);

INSERT OR IGNORE INTO bugs_fix (id, project_id, execution_id, endpoint_id, severity, title, description, root_cause, suggested_fix, status, created_at)
SELECT id, project_id, execution_id, endpoint_id, severity, title, description, root_cause, suggested_fix, status, created_at FROM bugs;

DROP TABLE bugs;
ALTER TABLE bugs_fix RENAME TO bugs;

-- Fix 3: Add flow_run_id to reports INSERT flow
-- (handled in code — use flow_run_id column directly)