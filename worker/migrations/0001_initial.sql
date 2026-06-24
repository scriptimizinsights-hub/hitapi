-- Migration 0001: Initial schema
-- APIForge — Cloudflare D1 (SQLite-compatible, replaceable)

-- ─── Projects ────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS projects (
  id          TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  name        TEXT NOT NULL,
  description TEXT,
  swagger_url TEXT,
  base_url    TEXT NOT NULL,
  environment TEXT NOT NULL DEFAULT 'development',
  auth_type   TEXT NOT NULL DEFAULT 'none', -- none | bearer | basic | apikey | oauth2
  auth_config TEXT,                          -- JSON: { header, prefix, token, etc. }
  created_at  INTEGER NOT NULL DEFAULT (unixepoch()),
  updated_at  INTEGER NOT NULL DEFAULT (unixepoch())
);

-- ─── Endpoints ───────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS endpoints (
  id            TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  project_id    TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  path          TEXT NOT NULL,
  method        TEXT NOT NULL,
  summary       TEXT,
  description   TEXT,
  parameters    TEXT,  -- JSON array
  request_body  TEXT,  -- JSON schema
  responses     TEXT,  -- JSON map { "200": schema, ... }
  tags          TEXT,  -- JSON array
  security      TEXT,  -- JSON array
  status        TEXT NOT NULL DEFAULT 'active',
  created_at    INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE INDEX IF NOT EXISTS idx_endpoints_project ON endpoints(project_id);

-- ─── Test Suites ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS test_suites (
  id          TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  project_id  TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  endpoint_id TEXT NOT NULL REFERENCES endpoints(id) ON DELETE CASCADE,
  name        TEXT NOT NULL,
  generated   INTEGER NOT NULL DEFAULT 0,  -- 1 = AI generated
  created_at  INTEGER NOT NULL DEFAULT (unixepoch())
);

-- ─── Test Cases ──────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS test_cases (
  id              TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  suite_id        TEXT NOT NULL REFERENCES test_suites(id) ON DELETE CASCADE,
  endpoint_id     TEXT NOT NULL REFERENCES endpoints(id) ON DELETE CASCADE,
  name            TEXT NOT NULL,
  type            TEXT NOT NULL,  -- positive | negative | boundary | security
  input_payload   TEXT,           -- JSON
  input_headers   TEXT,           -- JSON
  input_params    TEXT,           -- JSON query/path params
  expected_status INTEGER,
  expected_schema TEXT,           -- JSON schema
  expected_body   TEXT,           -- partial match JSON
  ai_reasoning    TEXT,           -- why AI generated this test
  created_at      INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE INDEX IF NOT EXISTS idx_cases_suite     ON test_cases(suite_id);
CREATE INDEX IF NOT EXISTS idx_cases_endpoint  ON test_cases(endpoint_id);

-- ─── Executions ──────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS executions (
  id          TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  project_id  TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  status      TEXT NOT NULL DEFAULT 'queued',  -- queued | running | done | failed
  triggered   TEXT NOT NULL DEFAULT 'manual',  -- manual | schedule | ci
  total       INTEGER NOT NULL DEFAULT 0,
  passed      INTEGER NOT NULL DEFAULT 0,
  failed      INTEGER NOT NULL DEFAULT 0,
  skipped     INTEGER NOT NULL DEFAULT 0,
  started_at  INTEGER,
  finished_at INTEGER,
  created_at  INTEGER NOT NULL DEFAULT (unixepoch())
);

-- ─── Execution Results (one per test case per run) ───────────────────────────
CREATE TABLE IF NOT EXISTS execution_results (
  id               TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  execution_id     TEXT NOT NULL REFERENCES executions(id) ON DELETE CASCADE,
  test_case_id     TEXT NOT NULL REFERENCES test_cases(id) ON DELETE CASCADE,
  endpoint_id      TEXT NOT NULL REFERENCES endpoints(id) ON DELETE CASCADE,
  status           TEXT NOT NULL,  -- passed | failed | skipped | error
  actual_status    INTEGER,
  actual_body      TEXT,
  actual_headers   TEXT,
  response_time_ms INTEGER,
  failure_reason   TEXT,
  ai_analysis      TEXT,           -- Cloudflare AI bug analysis
  created_at       INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE INDEX IF NOT EXISTS idx_results_execution ON execution_results(execution_id);

-- ─── Bugs / AI Detections ────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS bugs (
  id            TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  project_id    TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  execution_id  TEXT NOT NULL REFERENCES executions(id) ON DELETE CASCADE,
  endpoint_id   TEXT NOT NULL REFERENCES endpoints(id) ON DELETE CASCADE,
  severity      TEXT NOT NULL,  -- critical | high | medium | low
  title         TEXT NOT NULL,
  description   TEXT NOT NULL,
  root_cause    TEXT,
  suggested_fix TEXT,
  status        TEXT NOT NULL DEFAULT 'open',  -- open | dismissed | fixed
  created_at    INTEGER NOT NULL DEFAULT (unixepoch())
);

-- ─── API Monitors ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS monitors (
  id          TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  project_id  TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  name        TEXT NOT NULL,
  schedule    TEXT NOT NULL,  -- cron: "*/5 * * * *"
  enabled     INTEGER NOT NULL DEFAULT 1,
  alert_slack TEXT,
  alert_email TEXT,
  created_at  INTEGER NOT NULL DEFAULT (unixepoch())
);

-- ─── Reports metadata (actual files in R2) ───────────────────────────────────
CREATE TABLE IF NOT EXISTS reports (
  id           TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  execution_id TEXT NOT NULL REFERENCES executions(id) ON DELETE CASCADE,
  project_id   TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  format       TEXT NOT NULL,  -- html | json | csv
  r2_key       TEXT NOT NULL,
  size_bytes   INTEGER,
  created_at   INTEGER NOT NULL DEFAULT (unixepoch())
);
