CREATE TABLE commit_changes (
  repository_id TEXT NOT NULL,
  commit_id TEXT NOT NULL,
  path TEXT NOT NULL,
  PRIMARY KEY (repository_id, commit_id, path),
  FOREIGN KEY (repository_id, commit_id) REFERENCES commits(repository_id, id) ON DELETE CASCADE
);

CREATE INDEX commit_changes_by_path ON commit_changes(repository_id, path, commit_id);
