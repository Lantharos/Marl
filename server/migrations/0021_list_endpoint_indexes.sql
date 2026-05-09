CREATE INDEX IF NOT EXISTS idx_protocol_items_project_kind_created
ON protocol_items(tenant, project, kind, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_issues_project_number
ON issues(tenant, project, number DESC);

CREATE INDEX IF NOT EXISTS idx_issues_project_status_number
ON issues(tenant, project, status, number DESC);

CREATE INDEX IF NOT EXISTS idx_comments_project_issue_target
ON comments(tenant, project, issue_id, target_type);

CREATE INDEX IF NOT EXISTS idx_workspace_states_project_status
ON workspace_states(tenant, project, status, workspace);
