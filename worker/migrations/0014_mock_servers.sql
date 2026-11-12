-- 0014_mock_servers.sql — per-project mock servers (HitAPI → Mock Server)

CREATE TABLE IF NOT EXISTS mock_servers (
  id          TEXT PRIMARY KEY,
  project_id  TEXT NOT NULL UNIQUE REFERENCES projects(id) ON DELETE CASCADE,
  slug        TEXT NOT NULL UNIQUE,            -- public URL: /mock/<slug>/...
  enabled     INTEGER NOT NULL DEFAULT 1,
  created_at  INTEGER NOT NULL DEFAULT (unixepoch()),
  updated_at  INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE TABLE IF NOT EXISTS mock_responses (
  id          TEXT PRIMARY KEY,
  mock_id     TEXT NOT NULL REFERENCES mock_servers(id) ON DELETE CASCADE,
  endpoint_id TEXT,
  method      TEXT NOT NULL,
  path        TEXT NOT NULL,                   -- spec path, e.g. /users/{id}
  status      INTEGER NOT NULL DEFAULT 200,
  body        TEXT,                            -- JSON text; NULL = empty body
  headers     TEXT,                            -- JSON object of extra headers
  delay_ms    INTEGER NOT NULL DEFAULT 0,
  source      TEXT NOT NULL DEFAULT 'schema',  -- example | schema | fallback | ai | manual
  ai_tried    INTEGER NOT NULL DEFAULT 0,
  updated_at  INTEGER NOT NULL DEFAULT (unixepoch()),
  UNIQUE (mock_id, method, path)
);

CREATE INDEX IF NOT EXISTS idx_mock_responses_mock ON mock_responses(mock_id);
