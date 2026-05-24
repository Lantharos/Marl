CREATE TABLE IF NOT EXISTS ci_runners (
    id TEXT PRIMARY KEY,
    token_hash TEXT NOT NULL UNIQUE,
    prefix TEXT NOT NULL,
    tenant TEXT NOT NULL,
    project TEXT NOT NULL,
    name TEXT NOT NULL,
    created_by TEXT NOT NULL,
    created_at TEXT NOT NULL,
    last_seen_at TEXT,
    disabled_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_ci_runners_project
ON ci_runners(tenant, project, disabled_at, created_at DESC);

CREATE TABLE IF NOT EXISTS ci_jobs (
    id TEXT PRIMARY KEY,
    tenant TEXT NOT NULL,
    project TEXT NOT NULL,
    workspace TEXT NOT NULL,
    head TEXT NOT NULL,
    name TEXT NOT NULL,
    command TEXT NOT NULL,
    timeout_seconds INTEGER NOT NULL,
    status TEXT NOT NULL,
    conclusion TEXT,
    summary TEXT,
    runner_id TEXT,
    queued_at TEXT NOT NULL,
    started_at TEXT,
    completed_at TEXT,
    updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_ci_jobs_project
ON ci_jobs(tenant, project, workspace, head, queued_at DESC);

CREATE INDEX IF NOT EXISTS idx_ci_jobs_queue
ON ci_jobs(tenant, project, status, queued_at);

CREATE TABLE IF NOT EXISTS ci_job_logs (
    job_id TEXT NOT NULL,
    seq INTEGER NOT NULL,
    stream TEXT NOT NULL,
    text TEXT NOT NULL,
    created_at TEXT NOT NULL,
    PRIMARY KEY (job_id, seq)
);

CREATE INDEX IF NOT EXISTS idx_ci_job_logs_job
ON ci_job_logs(job_id, seq);
