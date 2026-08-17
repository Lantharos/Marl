ALTER TABLE commit_changes ADD COLUMN position INTEGER NOT NULL DEFAULT 0;

CREATE INDEX commit_changes_by_position ON commit_changes(repository_id, path, position);

CREATE TABLE indexed_commit_changes (
  repository_id TEXT NOT NULL,
  commit_id TEXT NOT NULL,
  PRIMARY KEY (repository_id, commit_id),
  FOREIGN KEY (repository_id, commit_id) REFERENCES commits(repository_id, id) ON DELETE CASCADE
);
