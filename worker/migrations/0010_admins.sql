-- Add to 0009_platform_errors.sql or create 0010_admins.sql

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