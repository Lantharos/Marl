CREATE TABLE IF NOT EXISTS project_folders (
    tenant TEXT NOT NULL,
    path TEXT NOT NULL,
    created_by TEXT NOT NULL,
    created_at TEXT NOT NULL,
    PRIMARY KEY (tenant, path)
);
CREATE INDEX IF NOT EXISTS idx_project_folders_tenant ON project_folders(tenant, path);
