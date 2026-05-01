CREATE TABLE IF NOT EXISTS project_forks (
    tenant TEXT NOT NULL,
    project TEXT NOT NULL,
    source_tenant TEXT NOT NULL,
    source_project TEXT NOT NULL,
    workspace TEXT NOT NULL,
    created_by TEXT NOT NULL,
    created_at TEXT NOT NULL,
    sent_at TEXT,
    title TEXT,
    message TEXT,
    PRIMARY KEY (tenant, project)
);
CREATE INDEX IF NOT EXISTS idx_project_forks_source ON project_forks(source_tenant, source_project);
