CREATE TABLE IF NOT EXISTS project_stats (
    tenant TEXT NOT NULL,
    project TEXT NOT NULL,
    workspace_count INTEGER NOT NULL DEFAULT 0,
    open_issue_count INTEGER NOT NULL DEFAULT 0,
    ready_count INTEGER NOT NULL DEFAULT 0,
    release_count INTEGER NOT NULL DEFAULT 0,
    history_count INTEGER NOT NULL DEFAULT 0,
    updated_at TEXT NOT NULL,
    PRIMARY KEY (tenant, project)
);

INSERT OR REPLACE INTO project_stats (
    tenant,
    project,
    workspace_count,
    open_issue_count,
    ready_count,
    release_count,
    history_count,
    updated_at
)
SELECT
    p.tenant,
    p.project,
    (SELECT COUNT(*) FROM workspace_states ws WHERE ws.tenant = p.tenant AND ws.project = p.project AND ws.workspace != 'main' AND ws.status NOT IN ('merged', 'closed', 'not_planned', 'deleted')),
    (SELECT COUNT(*) FROM issues i WHERE i.tenant = p.tenant AND i.project = p.project AND i.status = 'open'),
    (SELECT COUNT(*) FROM workspace_states ws WHERE ws.tenant = p.tenant AND ws.project = p.project AND ws.workspace != 'main' AND ws.is_ready = 1),
    (SELECT COUNT(*) FROM protocol_items pi WHERE pi.tenant = p.tenant AND pi.project = p.project AND pi.kind = 'release'),
    (SELECT COUNT(*) FROM history h WHERE h.tenant = p.tenant AND h.project = p.project),
    strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
FROM projects p;
