-- 0009_platform_errors.sql

CREATE TABLE IF NOT EXISTS platform_errors (
  id           TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),

  -- Classification
  scope        TEXT NOT NULL,  -- 'internal' | 'external'
  source       TEXT NOT NULL,  -- 'worker' | 'queue' | 'ai' | 'db' | 'test_run' | 'flow_run' | 'swagger_import'
  severity     TEXT NOT NULL DEFAULT 'error',  -- 'error' | 'warning' | 'critical'

  -- Context
  project_id   TEXT,           -- null for internal errors
  user_id      TEXT,           -- who triggered it
  run_id       TEXT,           -- flow_run or execution id
  step_id      TEXT,           -- specific step that failed

  -- Error details
  message      TEXT NOT NULL,  -- short error message
  stack        TEXT,           -- full stack trace if available
  context      TEXT,           -- JSON: request url, method, status codes, etc.

  -- HTTP details (for external errors)
  request_url     TEXT,
  request_method  TEXT,
  expected_status INTEGER,
  actual_status   INTEGER,

  -- Meta
  created_at   INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE INDEX IF NOT EXISTS idx_platform_errors_scope     ON platform_errors(scope);
CREATE INDEX IF NOT EXISTS idx_platform_errors_project   ON platform_errors(project_id);
CREATE INDEX IF NOT EXISTS idx_platform_errors_source    ON platform_errors(source);
CREATE INDEX IF NOT EXISTS idx_platform_errors_created   ON platform_errors(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_platform_errors_severity  ON platform_errors(severity);

CREATE TABLE IF NOT EXISTS admins (
  id         TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  email      TEXT NOT NULL UNIQUE,
  name       TEXT,
  added_by   TEXT,  -- email of who added this admin
  created_at INTEGER NOT NULL DEFAULT (unixepoch())
);

-- Seed your first admin (you)
INSERT INTO admins (email, name, added_by)
VALUES ('sunil.yadav@scriptimiz.com', 'Sunil', 'system');