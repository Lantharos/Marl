CREATE TABLE IF NOT EXISTS ci_secrets (
    tenant TEXT NOT NULL,
    project TEXT NOT NULL,
    key TEXT NOT NULL,
    value TEXT NOT NULL,
    created_by TEXT NOT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    PRIMARY KEY (tenant, project, key)
);
