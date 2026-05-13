CREATE TABLE IF NOT EXISTS leaves (
    id TEXT PRIMARY KEY,
    tenant TEXT NOT NULL,
    project TEXT NOT NULL DEFAULT '',
    slug TEXT NOT NULL,
    title TEXT NOT NULL,
    body TEXT NOT NULL,
    visibility TEXT NOT NULL DEFAULT 'tenant',
    attached_type TEXT NOT NULL DEFAULT 'project',
    attached_id TEXT,
    tags_json TEXT NOT NULL DEFAULT '[]',
    pinned INTEGER NOT NULL DEFAULT 0,
    author TEXT NOT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    UNIQUE (tenant, project, slug)
);

CREATE INDEX IF NOT EXISTS idx_leaves_scope_updated
ON leaves(tenant, project, updated_at DESC);

CREATE INDEX IF NOT EXISTS idx_leaves_scope_pinned
ON leaves(tenant, project, pinned, updated_at DESC);

CREATE INDEX IF NOT EXISTS idx_leaves_attachment
ON leaves(tenant, project, attached_type, attached_id);

ALTER TABLE project_stats ADD COLUMN leaf_count INTEGER NOT NULL DEFAULT 0;
