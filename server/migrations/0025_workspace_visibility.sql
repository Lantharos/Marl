ALTER TABLE workspace_states ADD COLUMN visibility TEXT NOT NULL DEFAULT 'team';
ALTER TABLE workspace_states ADD COLUMN created_by TEXT;

UPDATE workspace_states
SET visibility = 'public'
WHERE workspace = 'main';

UPDATE workspace_states
SET visibility = 'team'
WHERE workspace != 'main'
  AND visibility NOT IN ('private', 'team', 'public');

UPDATE workspace_states
SET created_by = (
    SELECT h.author
    FROM history h
    WHERE h.tenant = workspace_states.tenant
      AND h.project = workspace_states.project
      AND h.workspace = workspace_states.workspace
    ORDER BY h.timestamp ASC
    LIMIT 1
)
WHERE created_by IS NULL;

CREATE INDEX IF NOT EXISTS idx_workspace_states_visibility
ON workspace_states(tenant, project, visibility, status);
