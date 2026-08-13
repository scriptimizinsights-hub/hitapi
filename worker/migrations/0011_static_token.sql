-- Add to next migration file
ALTER TABLE flow_suites ADD COLUMN auth_type TEXT DEFAULT 'flow';
-- 'flow'   = existing behavior (signup → login → extract token)
-- 'static' = user provides a fixed token
-- 'none'   = no auth needed

ALTER TABLE flow_suites ADD COLUMN static_token TEXT;
-- Stores the static token (should be encrypted ideally)