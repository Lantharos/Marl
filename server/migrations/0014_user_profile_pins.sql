CREATE TABLE IF NOT EXISTS user_pinned_projects (
    user TEXT NOT NULL,
    tenant TEXT NOT NULL,
    project TEXT NOT NULL,
    position INTEGER NOT NULL,
    updated_at TEXT NOT NULL,
    PRIMARY KEY (user, tenant, project)
);

CREATE INDEX IF NOT EXISTS idx_user_pinned_projects_user_position
ON user_pinned_projects(user, position);
