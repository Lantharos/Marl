ALTER TABLE issue_comments ADD COLUMN parent_id TEXT REFERENCES issue_comments(id);
ALTER TABLE issue_comments ADD COLUMN reply_to_id TEXT REFERENCES issue_comments(id);
CREATE INDEX issue_comments_parent ON issue_comments(parent_id, created_at, id);

CREATE TABLE issue_conclusions (
  issue_id TEXT PRIMARY KEY REFERENCES issues(id) ON DELETE CASCADE,
  body TEXT NOT NULL,
  comment_id TEXT REFERENCES issue_comments(id) ON DELETE SET NULL,
  author_id TEXT NOT NULL REFERENCES users(id),
  updated_at TEXT NOT NULL
);

CREATE TABLE issue_participants (
  issue_id TEXT NOT NULL REFERENCES issues(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  following INTEGER NOT NULL DEFAULT 0 CHECK (following IN (0,1)),
  last_read_sequence INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (issue_id,user_id)
);
CREATE INDEX issue_participants_following ON issue_participants(user_id,following,issue_id);

CREATE TABLE repository_media (
  id TEXT PRIMARY KEY,
  repository_id TEXT NOT NULL REFERENCES repositories(id) ON DELETE CASCADE,
  author_id TEXT NOT NULL REFERENCES users(id),
  object_key TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  content_type TEXT NOT NULL,
  size INTEGER NOT NULL,
  created_at TEXT NOT NULL
);
CREATE INDEX repository_media_author_created ON repository_media(author_id,created_at);
