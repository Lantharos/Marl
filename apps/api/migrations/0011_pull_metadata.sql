ALTER TABLE pull_requests ADD COLUMN locked_at TEXT;
ALTER TABLE pull_requests ADD COLUMN locked_by TEXT REFERENCES users(id);

ALTER TABLE review_threads ADD COLUMN start_side TEXT CHECK (start_side IN ('old', 'new'));
ALTER TABLE review_threads ADD COLUMN start_line INTEGER;

CREATE TABLE repository_labels (
  id TEXT PRIMARY KEY,
  repository_id TEXT NOT NULL REFERENCES repositories(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  color TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  UNIQUE (repository_id, name)
);

CREATE TABLE pull_request_labels (
  pull_request_id TEXT NOT NULL REFERENCES pull_requests(id) ON DELETE CASCADE,
  label_id TEXT NOT NULL REFERENCES repository_labels(id) ON DELETE CASCADE,
  PRIMARY KEY (pull_request_id, label_id)
);

CREATE TABLE pull_request_assignees (
  pull_request_id TEXT NOT NULL REFERENCES pull_requests(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  PRIMARY KEY (pull_request_id, user_id)
);

INSERT INTO repository_labels (id, repository_id, name, color, description)
SELECT 'label_' || lower(hex(randomblob(12))), id, 'bug', '#e16f73', 'Something is not working' FROM repositories;
INSERT INTO repository_labels (id, repository_id, name, color, description)
SELECT 'label_' || lower(hex(randomblob(12))), id, 'enhancement', '#8c7ad8', 'New or improved functionality' FROM repositories;
INSERT INTO repository_labels (id, repository_id, name, color, description)
SELECT 'label_' || lower(hex(randomblob(12))), id, 'documentation', '#68a7b8', 'Documentation changes' FROM repositories;
INSERT INTO repository_labels (id, repository_id, name, color, description)
SELECT 'label_' || lower(hex(randomblob(12))), id, 'needs review', '#d3a45f', 'Ready for reviewer attention' FROM repositories;
