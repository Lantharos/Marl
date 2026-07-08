CREATE TABLE IF NOT EXISTS snapshot_blob_maps (
    tenant TEXT NOT NULL,
    project TEXT NOT NULL,
    snapshot_id TEXT NOT NULL,
    blob_map_json TEXT NOT NULL,
    created_at TEXT NOT NULL,
    PRIMARY KEY (tenant, project, snapshot_id)
);

ALTER TABLE ci_jobs ADD COLUMN checkout_paths_json TEXT NOT NULL DEFAULT '[]';
