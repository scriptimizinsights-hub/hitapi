-- 0016_temp_mocks.sql — mock servers made on the public Mock Playground
-- (hitapi.dev/mock-playground) by visitors who are not signed in.
-- Served at /mock/t/<id>/...; each one expires 7 days after its last save.

CREATE TABLE IF NOT EXISTS temp_mocks (
  id          TEXT PRIMARY KEY,          -- random, used in the URL
  token_hash  TEXT NOT NULL,             -- SHA-256 of the edit token (only the creator's browser has the token)
  routes      TEXT NOT NULL,             -- JSON array of { method, path, status, headers, delay_ms, body }
  ip          TEXT,                      -- creator's IP, for rate limiting
  created_at  INTEGER NOT NULL,          -- ms since epoch
  updated_at  INTEGER NOT NULL,
  expires_at  INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_temp_mocks_expires ON temp_mocks(expires_at);
CREATE INDEX IF NOT EXISTS idx_temp_mocks_ip      ON temp_mocks(ip, created_at);
