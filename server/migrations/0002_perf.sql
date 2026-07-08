CREATE TABLE IF NOT EXISTS snapshot_diffs (
    tenant TEXT NOT NULL,
    project TEXT NOT NULL,
    snapshot_id TEXT NOT NULL,
    base_snapshot_id TEXT NOT NULL,
    changed_paths_json TEXT NOT NULL,
    created_at TEXT NOT NULL,
    PRIMARY KEY (tenant, project, snapshot_id, base_snapshot_id)
);

CREATE INDEX IF NOT EXISTS idx_history_snapshot ON history(tenant, project, snapshot_id);
CREATE INDEX IF NOT EXISTS idx_object_index_kind ON object_index(tenant, project, kind);
