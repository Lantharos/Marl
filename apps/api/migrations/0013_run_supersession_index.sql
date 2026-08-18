CREATE INDEX runs_active_workflow_branch
ON runs(repository_id, workflow_id, branch, trigger_name, state);
