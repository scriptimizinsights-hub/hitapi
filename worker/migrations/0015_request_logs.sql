-- 0015_request_logs.sql — every request to the API, mock servers and website pages
-- (Super Admin → Traffic). Rows older than 30 days are deleted automatically.

CREATE TABLE IF NOT EXISTS request_logs (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  ts          INTEGER NOT NULL,          -- milliseconds since epoch
  kind        TEXT NOT NULL,             -- page | api | mock
  method      TEXT,
  host        TEXT,
  path        TEXT,
  query       TEXT,                      -- secret-looking values masked
  status      INTEGER,                   -- NULL for page views
  duration_ms INTEGER,
  user_id     TEXT,                      -- NULL when not signed in
  ip          TEXT,
  country     TEXT,
  city        TEXT,
  user_agent  TEXT,
  referer     TEXT
);

CREATE INDEX IF NOT EXISTS idx_request_logs_ts      ON request_logs(ts DESC);
CREATE INDEX IF NOT EXISTS idx_request_logs_user    ON request_logs(user_id, ts DESC);
CREATE INDEX IF NOT EXISTS idx_request_logs_kind_ts ON request_logs(kind, ts DESC);
