-- Add fail_stage to ai_logs so failures are diagnosable at the exact
-- pipeline stage (empty_input | extraction | json_parse | schema_validation)
-- instead of just a generic error message.
ALTER TABLE ai_logs ADD COLUMN fail_stage TEXT;

CREATE INDEX IF NOT EXISTS idx_ai_logs_fail_stage ON ai_logs(fail_stage);