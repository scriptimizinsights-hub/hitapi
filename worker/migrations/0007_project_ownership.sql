-- CRITICAL SECURITY FIX: projects had no owner — every user could see every project

ALTER TABLE projects ADD COLUMN user_id TEXT;

-- Existing projects (created before this fix) need a user assigned.
-- Since we cannot know who created them, assign to the first registered user
-- as a safe default — update this manually if needed for your specific data.
UPDATE projects
SET user_id = (SELECT id FROM hitapi_users ORDER BY created_at ASC LIMIT 1)
WHERE user_id IS NULL;

CREATE INDEX IF NOT EXISTS idx_projects_user_id ON projects(user_id);