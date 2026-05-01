CREATE INDEX IF NOT EXISTS idx_workspace_states_ready ON workspace_states(is_ready, tenant, project, workspace);
CREATE INDEX IF NOT EXISTS idx_issues_status_updated ON issues(status, updated_at DESC, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_comments_created ON comments(created_at DESC);
