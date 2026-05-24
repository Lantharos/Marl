ALTER TABLE ci_runners ADD COLUMN concurrency INTEGER NOT NULL DEFAULT 1;

ALTER TABLE ci_jobs ADD COLUMN lease_expires_at TEXT;
ALTER TABLE ci_jobs ADD COLUMN attempt INTEGER NOT NULL DEFAULT 0;
ALTER TABLE ci_jobs ADD COLUMN max_attempts INTEGER NOT NULL DEFAULT 3;
ALTER TABLE ci_jobs ADD COLUMN artifacts_json TEXT NOT NULL DEFAULT '[]';
ALTER TABLE ci_jobs ADD COLUMN cache_json TEXT NOT NULL DEFAULT '[]';

CREATE INDEX IF NOT EXISTS idx_ci_jobs_leases
ON ci_jobs(tenant, project, status, lease_expires_at);

CREATE TABLE IF NOT EXISTS ci_artifacts (
    id TEXT PRIMARY KEY,
    job_id TEXT NOT NULL,
    tenant TEXT NOT NULL,
    project TEXT NOT NULL,
    name TEXT NOT NULL,
    storage_key TEXT NOT NULL UNIQUE,
    size INTEGER NOT NULL,
    digest TEXT NOT NULL,
    content_type TEXT NOT NULL,
    created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_ci_artifacts_job
ON ci_artifacts(tenant, project, job_id, created_at DESC);

CREATE TABLE IF NOT EXISTS ci_caches (
    tenant TEXT NOT NULL,
    project TEXT NOT NULL,
    cache_key TEXT NOT NULL,
    storage_key TEXT NOT NULL,
    size INTEGER NOT NULL,
    digest TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    PRIMARY KEY (tenant, project, cache_key)
);

CREATE TABLE IF NOT EXISTS project_webhook_deliveries (
    delivery_id TEXT PRIMARY KEY,
    hook_id TEXT NOT NULL,
    tenant TEXT NOT NULL,
    project TEXT NOT NULL,
    event TEXT NOT NULL,
    status INTEGER NOT NULL,
    attempts INTEGER NOT NULL DEFAULT 0,
    last_error TEXT,
    payload_hash TEXT NOT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_project_webhook_deliveries_hook
ON project_webhook_deliveries(tenant, project, hook_id, updated_at DESC);
