-- HitAPI platform users (separate from the APIs being tested)
CREATE TABLE IF NOT EXISTS hitapi_users (
  id         TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  email      TEXT NOT NULL UNIQUE,
  password   TEXT NOT NULL,
  name       TEXT NOT NULL,
  created_at INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE INDEX IF NOT EXISTS idx_hitapi_users_email ON hitapi_users(email);