UPDATE project_stats
SET
    workspace_count = (
        SELECT COUNT(*)
        FROM workspace_states ws
        WHERE ws.tenant = project_stats.tenant
          AND ws.project = project_stats.project
          AND ws.workspace != 'main'
          AND ws.status NOT IN ('merged', 'closed', 'not_planned', 'deleted')
    ),
    ready_count = (
        SELECT COUNT(*)
        FROM workspace_states ws
        WHERE ws.tenant = project_stats.tenant
          AND ws.project = project_stats.project
          AND ws.workspace != 'main'
          AND ws.status != 'deleted'
          AND ws.is_ready = 1
    ),
    updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now');
