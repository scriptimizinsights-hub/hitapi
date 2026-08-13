-- AI prompt/response logging table
CREATE TABLE IF NOT EXISTS ai_logs (
  id           TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  project_id   TEXT,
  stage        TEXT NOT NULL,               -- 'test_generation' | 'flow_step_generation' | 'bug_analysis'
  model        TEXT,
  prompt       TEXT NOT NULL,
  response     TEXT,
  parsed_ok    INTEGER NOT NULL DEFAULT 0,
  tokens_in    INTEGER,
  tokens_out   INTEGER,
  duration_ms  INTEGER,
  error        TEXT,
  created_at   INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE INDEX IF NOT EXISTS idx_ai_logs_project ON ai_logs(project_id);
CREATE INDEX IF NOT EXISTS idx_ai_logs_stage   ON ai_logs(stage);
CREATE INDEX IF NOT EXISTS idx_ai_logs_created ON ai_logs(created_at DESC);