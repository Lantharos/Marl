ALTER TABLE pull_requests ADD COLUMN realtime_version INTEGER NOT NULL DEFAULT 0;

CREATE TABLE pull_timeline (
  sequence INTEGER PRIMARY KEY AUTOINCREMENT,
  pull_request_id TEXT NOT NULL REFERENCES pull_requests(id) ON DELETE CASCADE,
  kind TEXT NOT NULL CHECK (kind IN ('comment', 'review', 'thread', 'event')),
  entity_id TEXT NOT NULL,
  created_at TEXT NOT NULL,
  UNIQUE (kind, entity_id)
);

CREATE INDEX pull_timeline_pull_sequence_idx
ON pull_timeline(pull_request_id, sequence);

INSERT INTO pull_timeline (pull_request_id, kind, entity_id, created_at)
SELECT pull_request_id, kind, entity_id, created_at FROM (
  SELECT pull_request_id, 'comment' AS kind, id AS entity_id, created_at FROM pull_request_comments
  UNION ALL
  SELECT pull_request_id, 'review', id, created_at FROM pull_request_reviews
  UNION ALL
  SELECT pull_request_id, 'thread', id, created_at FROM review_threads
  UNION ALL
  SELECT pull_request_id, 'event', id, created_at FROM pull_request_events
)
ORDER BY created_at, entity_id;

CREATE TRIGGER pull_timeline_comment_insert
AFTER INSERT ON pull_request_comments
BEGIN
  INSERT INTO pull_timeline (pull_request_id, kind, entity_id, created_at)
  VALUES (NEW.pull_request_id, 'comment', NEW.id, NEW.created_at);
END;

CREATE TRIGGER pull_timeline_review_insert
AFTER INSERT ON pull_request_reviews
BEGIN
  INSERT INTO pull_timeline (pull_request_id, kind, entity_id, created_at)
  VALUES (NEW.pull_request_id, 'review', NEW.id, NEW.created_at);
END;

CREATE TRIGGER pull_timeline_thread_insert
AFTER INSERT ON review_threads
BEGIN
  INSERT INTO pull_timeline (pull_request_id, kind, entity_id, created_at)
  VALUES (NEW.pull_request_id, 'thread', NEW.id, NEW.created_at);
END;

CREATE TRIGGER pull_timeline_event_insert
AFTER INSERT ON pull_request_events
BEGIN
  INSERT INTO pull_timeline (pull_request_id, kind, entity_id, created_at)
  VALUES (NEW.pull_request_id, 'event', NEW.id, NEW.created_at);
END;

CREATE TABLE pull_realtime_updates (
  id TEXT PRIMARY KEY,
  pull_request_id TEXT NOT NULL REFERENCES pull_requests(id) ON DELETE CASCADE,
  version INTEGER NOT NULL,
  kind TEXT NOT NULL,
  payload TEXT NOT NULL,
  created_at TEXT NOT NULL,
  UNIQUE (pull_request_id, version)
);

CREATE INDEX pull_realtime_updates_pull_version_idx
ON pull_realtime_updates(pull_request_id, version);
