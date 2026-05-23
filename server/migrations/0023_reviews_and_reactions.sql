CREATE TABLE IF NOT EXISTS protocol_reactions (
    tenant TEXT NOT NULL,
    project TEXT NOT NULL,
    target_kind TEXT NOT NULL,
    target_id TEXT NOT NULL,
    emoji TEXT NOT NULL,
    user TEXT NOT NULL,
    created_at TEXT NOT NULL,
    PRIMARY KEY (tenant, project, target_kind, target_id, emoji, user)
);

CREATE INDEX IF NOT EXISTS idx_protocol_reactions_target
ON protocol_reactions(tenant, project, target_kind, target_id);

CREATE TABLE IF NOT EXISTS workspace_reviews (
    id TEXT PRIMARY KEY,
    tenant TEXT NOT NULL,
    project TEXT NOT NULL,
    workspace TEXT NOT NULL,
    author TEXT NOT NULL,
    state TEXT NOT NULL,
    body TEXT,
    head TEXT,
    submitted_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_workspace_reviews_scope
ON workspace_reviews(tenant, project, workspace, submitted_at DESC);

CREATE INDEX IF NOT EXISTS idx_workspace_reviews_head
ON workspace_reviews(tenant, project, workspace, head, author, submitted_at DESC);
