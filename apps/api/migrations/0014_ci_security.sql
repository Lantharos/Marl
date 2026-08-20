PRAGMA foreign_keys = OFF;

CREATE TABLE branch_rules_next (
  repository_id TEXT NOT NULL REFERENCES repositories(id) ON DELETE CASCADE,
  pattern TEXT NOT NULL,
  required_approvals INTEGER NOT NULL DEFAULT 0 CHECK (required_approvals BETWEEN 0 AND 10),
  required_checks_json TEXT NOT NULL DEFAULT '[]',
  require_conversations INTEGER NOT NULL DEFAULT 1 CHECK (require_conversations IN (0, 1)),
  dismiss_stale_reviews INTEGER NOT NULL DEFAULT 1 CHECK (dismiss_stale_reviews IN (0, 1)),
  allowed_merge_methods_json TEXT NOT NULL DEFAULT '["merge","squash","rebase"]',
  updated_by TEXT NOT NULL REFERENCES users(id),
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (repository_id, pattern)
);

INSERT INTO branch_rules_next (repository_id,pattern,required_approvals,require_conversations,dismiss_stale_reviews,allowed_merge_methods_json,updated_by,updated_at)
SELECT repository_id,pattern,required_approvals,require_conversations,dismiss_stale_reviews,allowed_merge_methods_json,updated_by,updated_at FROM branch_rules;

DROP TABLE branch_rules;
ALTER TABLE branch_rules_next RENAME TO branch_rules;

CREATE TABLE ci_secrets (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  repository_id TEXT REFERENCES repositories(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  ciphertext TEXT NOT NULL,
  nonce TEXT NOT NULL,
  created_by TEXT NOT NULL REFERENCES users(id),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX ci_secrets_organization_name ON ci_secrets(organization_id,name) WHERE repository_id IS NULL;
CREATE UNIQUE INDEX ci_secrets_repository_name ON ci_secrets(repository_id,name) WHERE repository_id IS NOT NULL;
CREATE INDEX ci_secrets_scope ON ci_secrets(organization_id,repository_id,name);

CREATE TABLE ssh_keys (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  public_key TEXT NOT NULL,
  fingerprint TEXT NOT NULL UNIQUE,
  last_used_at TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX ssh_keys_user ON ssh_keys(user_id,created_at DESC);

PRAGMA foreign_keys = ON;
