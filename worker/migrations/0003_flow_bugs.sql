-- Migration: make execution_id nullable for flow suite bugs
-- SQLite requires table recreation to change column constraints

-- Step 1: Create new bugs table with nullable execution_id
CREATE TABLE IF NOT EXISTS bugs_new (
  id            TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  project_id    TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  execution_id  TEXT,
  endpoint_id   TEXT REFERENCES endpoints(id) ON DELETE SET NULL,
  flow_run_id   TEXT,
  flow_step_id  TEXT,
  severity      TEXT NOT NULL,
  title         TEXT NOT NULL,
  description   TEXT NOT NULL,
  root_cause    TEXT,
  suggested_fix TEXT,
  status        TEXT NOT NULL DEFAULT 'open',
  created_at    INTEGER NOT NULL DEFAULT (unixepoch())
);

-- Step 2: Copy existing bugs
INSERT OR IGNORE INTO bugs_new (id, project_id, execution_id, endpoint_id, severity, title, description, root_cause, suggested_fix, status, created_at)
SELECT id, project_id, execution_id, endpoint_id, severity, title, description, root_cause, suggested_fix, status, created_at FROM bugs;

-- Step 3: Swap
DROP TABLE bugs;
ALTER TABLE bugs_new RENAME TO bugs;

-- Step 4: Add flow_run_id to flow_runs if not exists
ALTER TABLE flow_runs ADD COLUMN bug_count INTEGER DEFAULT 0;

ALTER TABLE flow_step_results ADD COLUMN sub_checks TEXT;