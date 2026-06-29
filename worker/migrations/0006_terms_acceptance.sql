-- Add terms version tracking to users
ALTER TABLE hitapi_users ADD COLUMN terms_version_accepted TEXT;
ALTER TABLE hitapi_users ADD COLUMN terms_accepted_at INTEGER;

-- Audit trail for every acceptance
CREATE TABLE IF NOT EXISTS terms_acceptances (
  id            TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  user_id       TEXT NOT NULL REFERENCES hitapi_users(id) ON DELETE CASCADE,
  terms_version TEXT NOT NULL,
  accepted_at   INTEGER NOT NULL DEFAULT (unixepoch()),
  ip_address    TEXT,
  user_agent    TEXT
);

CREATE INDEX IF NOT EXISTS idx_terms_user ON terms_acceptances(user_id);
CREATE INDEX IF NOT EXISTS idx_terms_version ON terms_acceptances(terms_version);