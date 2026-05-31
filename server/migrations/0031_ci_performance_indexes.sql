CREATE INDEX IF NOT EXISTS idx_ci_jobs_runner_active
ON ci_jobs(runner_id, status);

CREATE INDEX IF NOT EXISTS idx_ci_artifacts_project_created
ON ci_artifacts(tenant, project, created_at);

CREATE INDEX IF NOT EXISTS idx_ci_caches_project_updated
ON ci_caches(tenant, project, updated_at);
