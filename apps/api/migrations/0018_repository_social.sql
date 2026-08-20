ALTER TABLE repositories ADD COLUMN forked_from_repository_id TEXT REFERENCES repositories(id) ON DELETE SET NULL;
ALTER TABLE repositories ADD COLUMN fork_root_repository_id TEXT REFERENCES repositories(id) ON DELETE SET NULL;

CREATE INDEX repositories_by_fork_parent ON repositories(forked_from_repository_id);
CREATE INDEX repositories_by_fork_root ON repositories(fork_root_repository_id);

CREATE TABLE repository_stars (
  repository_id TEXT NOT NULL REFERENCES repositories(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (repository_id, user_id)
);

CREATE INDEX repository_stars_by_user ON repository_stars(user_id, created_at DESC);

ALTER TABLE pull_requests ADD COLUMN source_repository_id TEXT REFERENCES repositories(id) ON DELETE SET NULL;
CREATE INDEX pull_requests_by_source_repository ON pull_requests(source_repository_id, state, source_branch);
