ALTER TABLE auth_session ADD COLUMN device_id TEXT;

CREATE UNIQUE INDEX auth_sessions_by_device ON auth_session(user_id, device_id) WHERE device_id IS NOT NULL;
