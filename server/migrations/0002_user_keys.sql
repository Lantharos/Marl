CREATE TABLE IF NOT EXISTS user_keys (
    id TEXT PRIMARY KEY,
    user TEXT NOT NULL,
    kind TEXT NOT NULL,
    name TEXT NOT NULL,
    public_key TEXT NOT NULL,
    fingerprint TEXT NOT NULL,
    algorithm TEXT NOT NULL,
    created_at TEXT NOT NULL,
    revoked_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_user_keys_user_kind ON user_keys(user, kind);
CREATE UNIQUE INDEX IF NOT EXISTS idx_user_keys_user_fingerprint ON user_keys(user, fingerprint);
