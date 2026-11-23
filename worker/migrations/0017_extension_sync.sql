-- 0017_extension_sync.sql — the browser extension's Workbench data, synced across
-- a user's devices (roadmap feature 11). One row per user and kind:
--   kind = 'collections' | 'environments' | 'scenarios'
-- data is the JSON the extension sends. Secrets are removed by the extension before
-- upload (tokens, passwords, API keys, secret variable values).

CREATE TABLE IF NOT EXISTS extension_sync (
  user_id     TEXT NOT NULL,
  kind        TEXT NOT NULL,
  data        TEXT NOT NULL,
  version     INTEGER NOT NULL DEFAULT 1,   -- +1 on every save; a save must name the version it replaces
  device      TEXT,                         -- label of the device that saved last
  updated_at  INTEGER NOT NULL,             -- ms since epoch
  PRIMARY KEY (user_id, kind)
);
