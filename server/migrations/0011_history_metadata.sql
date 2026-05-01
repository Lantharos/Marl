ALTER TABLE history ADD COLUMN agent TEXT;
ALTER TABLE history ADD COLUMN model TEXT;
ALTER TABLE history ADD COLUMN signature_json TEXT;
CREATE INDEX IF NOT EXISTS idx_history_workspace_time ON history(tenant, project, workspace, timestamp DESC);
