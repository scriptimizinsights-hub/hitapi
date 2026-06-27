-- Migration 0002: Flow Suites (sequential test flows)

CREATE TABLE IF NOT EXISTS flow_suites (
  id          TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  project_id  TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  name        TEXT NOT NULL,
  description TEXT,
  created_at  INTEGER NOT NULL DEFAULT (unixepoch()),
  updated_at  INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE TABLE IF NOT EXISTS flow_steps (
  id              TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  suite_id        TEXT NOT NULL REFERENCES flow_suites(id) ON DELETE CASCADE,
  step_order      INTEGER NOT NULL,
  name            TEXT NOT NULL,
  endpoint_id     TEXT REFERENCES endpoints(id) ON DELETE SET NULL,
  method          TEXT,
  url_override    TEXT,
  input_payload   TEXT,
  input_headers   TEXT,
  input_params    TEXT,
  expected_status INTEGER,
  extract_vars    TEXT,
  skip_if_failed  INTEGER DEFAULT 0,
  created_at      INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE INDEX IF NOT EXISTS idx_flow_steps_suite ON flow_steps(suite_id, step_order);

CREATE TABLE IF NOT EXISTS flow_runs (
  id          TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  suite_id    TEXT NOT NULL REFERENCES flow_suites(id) ON DELETE CASCADE,
  project_id  TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  status      TEXT NOT NULL DEFAULT 'running',
  total_steps INTEGER NOT NULL DEFAULT 0,
  passed      INTEGER NOT NULL DEFAULT 0,
  failed      INTEGER NOT NULL DEFAULT 0,
  context     TEXT,
  started_at  INTEGER NOT NULL DEFAULT (unixepoch()),
  finished_at INTEGER
);

CREATE TABLE IF NOT EXISTS flow_step_results (
  id               TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  run_id           TEXT NOT NULL REFERENCES flow_runs(id) ON DELETE CASCADE,
  step_id          TEXT NOT NULL REFERENCES flow_steps(id) ON DELETE CASCADE,
  step_order       INTEGER NOT NULL,
  step_name        TEXT NOT NULL,
  status           TEXT NOT NULL,
  actual_status    INTEGER,
  request_url      TEXT,
  request_method   TEXT,
  request_headers  TEXT,
  request_body     TEXT,
  actual_body      TEXT,
  actual_headers   TEXT,
  response_time_ms INTEGER,
  failure_reason   TEXT,
  extracted_vars   TEXT,
  created_at       INTEGER NOT NULL DEFAULT (unixepoch())
);

-- Add swagger_example column to flow_steps
ALTER TABLE flow_steps ADD COLUMN swagger_example TEXT;

-- Add flow run linkage to bugs table
ALTER TABLE bugs ADD COLUMN flow_run_id TEXT REFERENCES flow_runs(id) ON DELETE CASCADE;
ALTER TABLE bugs ADD COLUMN flow_step_id TEXT;
-- Make execution_id nullable for flow bugs
-- SQLite doesn't support ALTER COLUMN, so we handle this in the INSERT

-- Add bug_count to flow_runs
ALTER TABLE flow_runs ADD COLUMN bug_count INTEGER DEFAULT 0;