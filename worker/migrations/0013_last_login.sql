-- Super admin: record when each user last logged in
ALTER TABLE hitapi_users ADD COLUMN last_login_at INTEGER;