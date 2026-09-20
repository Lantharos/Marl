CREATE TRIGGER audit_events_immutable_delete BEFORE DELETE ON audit_events
BEGIN
  SELECT RAISE(ABORT, 'audit events are immutable');
END;
--> statement-breakpoint
CREATE TRIGGER audit_events_immutable_update BEFORE UPDATE ON audit_events
BEGIN
  SELECT RAISE(ABORT, 'audit events are immutable');
END;
--> statement-breakpoint
CREATE TRIGGER pull_timeline_comment_insert
AFTER INSERT ON pull_request_comments
BEGIN
  INSERT INTO pull_timeline (pull_request_id, kind, entity_id, created_at)
  VALUES (NEW.pull_request_id, 'comment', NEW.id, NEW.created_at);
END;
--> statement-breakpoint
CREATE TRIGGER pull_timeline_event_insert
AFTER INSERT ON pull_request_events
BEGIN
  INSERT INTO pull_timeline (pull_request_id, kind, entity_id, created_at)
  VALUES (NEW.pull_request_id, 'event', NEW.id, NEW.created_at);
END;
--> statement-breakpoint
CREATE TRIGGER pull_timeline_review_insert
AFTER INSERT ON pull_request_reviews
BEGIN
  INSERT INTO pull_timeline (pull_request_id, kind, entity_id, created_at)
  VALUES (NEW.pull_request_id, 'review', NEW.id, NEW.created_at);
END;
--> statement-breakpoint
CREATE TRIGGER pull_timeline_thread_insert
AFTER INSERT ON review_threads
BEGIN
  INSERT INTO pull_timeline (pull_request_id, kind, entity_id, created_at)
  VALUES (NEW.pull_request_id, 'thread', NEW.id, NEW.created_at);
END;
--> statement-breakpoint
CREATE TRIGGER ssh_keys_invalidate_commit_signatures
AFTER DELETE ON ssh_keys
BEGIN
  UPDATE commits
  SET signature_status = 'unverified', signature_signer_id = NULL, signature_key_fingerprint = NULL
  WHERE signature_signer_id = OLD.user_id AND signature_key_fingerprint = OLD.fingerprint;
END;
--> statement-breakpoint
CREATE TRIGGER issue_timeline_comment_insert
AFTER INSERT ON issue_comments
BEGIN
  INSERT INTO issue_timeline (issue_id, kind, entity_id, created_at)
  VALUES (NEW.issue_id, 'comment', NEW.id, NEW.created_at);
END;
--> statement-breakpoint
CREATE TRIGGER issue_timeline_event_insert
AFTER INSERT ON issue_events
BEGIN
  INSERT INTO issue_timeline (issue_id, kind, entity_id, created_at)
  VALUES (NEW.issue_id, 'event', NEW.id, NEW.created_at);
END;
--> statement-breakpoint
CREATE TRIGGER issue_timeline_reference_insert
AFTER INSERT ON work_item_references
WHEN NEW.target_issue_id IS NOT NULL
BEGIN
  INSERT INTO issue_timeline (issue_id, kind, entity_id, created_at)
  VALUES (NEW.target_issue_id, 'reference', NEW.id, NEW.created_at);
END;
--> statement-breakpoint
CREATE TRIGGER issue_timeline_reference_delete
AFTER DELETE ON work_item_references
WHEN OLD.target_issue_id IS NOT NULL
BEGIN
  DELETE FROM issue_timeline WHERE kind = 'reference' AND entity_id = OLD.id;
END;
--> statement-breakpoint
CREATE TRIGGER pull_timeline_reference_insert
AFTER INSERT ON work_item_references
WHEN NEW.target_pull_id IS NOT NULL
BEGIN
  INSERT INTO pull_timeline (pull_request_id, kind, entity_id, created_at)
  VALUES (NEW.target_pull_id, 'reference', NEW.id, NEW.created_at);
END;
--> statement-breakpoint
CREATE TRIGGER pull_timeline_reference_delete
AFTER DELETE ON work_item_references
WHEN OLD.target_pull_id IS NOT NULL
BEGIN
  DELETE FROM pull_timeline WHERE kind = 'reference' AND entity_id = OLD.id;
END;
--> statement-breakpoint
CREATE TRIGGER reviews_match_current_head BEFORE INSERT ON pull_request_reviews
WHEN NOT EXISTS (SELECT 1 FROM pull_requests WHERE id=NEW.pull_request_id AND source_commit_id=NEW.commit_id AND state IN ('open','draft'))
BEGIN SELECT RAISE(ABORT,'pull_head_changed'); END;
--> statement-breakpoint
CREATE TRIGGER automatic_runs_match_pull_head BEFORE INSERT ON runs
WHEN NEW.trigger_name='pull_request' AND NOT EXISTS (SELECT 1 FROM pull_requests WHERE id=NEW.pull_request_id AND repository_id=NEW.repository_id AND source_commit_id=NEW.commit_id AND state='open')
BEGIN SELECT RAISE(ABORT,'pull_head_changed'); END;
