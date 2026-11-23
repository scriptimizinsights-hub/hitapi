-- Personal API keys (roadmap feature 12): use HitAPI from CI and scripts
-- (hitapi CLI "cloud run", curl) without a password or a 7-day login token.
-- Only a SHA-256 hash of each key is stored; the key itself is shown once.
CREATE TABLE IF NOT EXISTS api_keys (
  id           TEXT PRIMARY KEY,
  user_id      TEXT NOT NULL,
  name         TEXT NOT NULL,
  prefix       TEXT NOT NULL,              -- "hk_ab12cd34": shown in lists so people can tell keys apart
  key_hash     TEXT NOT NULL UNIQUE,       -- hex SHA-256 of the whole key
  created_at   INTEGER NOT NULL DEFAULT (unixepoch()),
  last_used_at INTEGER,
  expires_at   INTEGER                     -- unix seconds, NULL = never
);
CREATE INDEX IF NOT EXISTS idx_api_keys_user ON api_keys(user_id);
