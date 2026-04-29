CREATE TABLE IF NOT EXISTS project_follows (
    tenant TEXT NOT NULL,
    project TEXT NOT NULL,
    user TEXT NOT NULL,
    created_at TEXT NOT NULL,
    PRIMARY KEY (tenant, project, user)
);

CREATE INDEX IF NOT EXISTS idx_project_follows_user ON project_follows(user, created_at DESC);
