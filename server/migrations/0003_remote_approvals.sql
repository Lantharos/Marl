ALTER TABLE tokens ADD COLUMN kind TEXT NOT NULL DEFAULT 'cli';
CREATE INDEX IF NOT EXISTS idx_tokens_kind ON tokens(kind);

CREATE TABLE IF NOT EXISTS remote_approvals (
    id TEXT PRIMARY KEY,
    user TEXT NOT NULL,
    action TEXT NOT NULL,
    summary TEXT NOT NULL,
    payload_json TEXT NOT NULL,
    status TEXT NOT NULL,
    created_at TEXT NOT NULL,
    expires_at TEXT NOT NULL,
    approved_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_remote_approvals_user_status ON remote_approvals(user, status);
