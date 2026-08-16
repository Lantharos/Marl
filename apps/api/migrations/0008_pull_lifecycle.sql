ALTER TABLE pull_requests ADD COLUMN merge_method TEXT CHECK (merge_method IN ('merge', 'squash', 'rebase'));

ALTER TABLE review_comments ADD COLUMN deleted_at TEXT;

CREATE TABLE branch_rules (
  repository_id TEXT NOT NULL REFERENCES repositories(id) ON DELETE CASCADE,
  pattern TEXT NOT NULL,
  required_approvals INTEGER NOT NULL DEFAULT 0 CHECK (required_approvals BETWEEN 0 AND 10),
  require_checks INTEGER NOT NULL DEFAULT 0 CHECK (require_checks IN (0, 1)),
  require_conversations INTEGER NOT NULL DEFAULT 1 CHECK (require_conversations IN (0, 1)),
  dismiss_stale_reviews INTEGER NOT NULL DEFAULT 1 CHECK (dismiss_stale_reviews IN (0, 1)),
  allowed_merge_methods_json TEXT NOT NULL DEFAULT '["merge","squash","rebase"]',
  updated_by TEXT NOT NULL REFERENCES users(id),
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (repository_id, pattern)
);
