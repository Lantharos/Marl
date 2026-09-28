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
  AND NOT EXISTS (SELECT 1 FROM pull_requests JOIN repository_imports ON repository_imports.repository_id=pull_requests.repository_id AND repository_imports.status='running' WHERE pull_requests.id=NEW.pull_request_id)
BEGIN SELECT RAISE(ABORT,'pull_head_changed'); END;
--> statement-breakpoint
CREATE TRIGGER automatic_runs_match_pull_head BEFORE INSERT ON runs
WHEN NEW.trigger_name='pull_request' AND NOT EXISTS (SELECT 1 FROM pull_requests WHERE id=NEW.pull_request_id AND repository_id=NEW.repository_id AND source_commit_id=NEW.commit_id AND state='open')
BEGIN SELECT RAISE(ABORT,'pull_head_changed'); END;
--> statement-breakpoint
CREATE TRIGGER issue_activity_notifies
AFTER INSERT ON issue_timeline
BEGIN
  UPDATE notification_settings SET pending_at = strftime('%Y-%m-%dT%H:%M:%fZ','now')
  WHERE email_mode != 'off'
    AND user_id IN (
      SELECT author_id FROM issues WHERE id = NEW.issue_id
      UNION SELECT user_id FROM issue_assignees WHERE issue_id = NEW.issue_id
      UNION SELECT author_id FROM issue_comments WHERE issue_id = NEW.issue_id
      UNION SELECT user_id FROM issue_participants WHERE issue_id = NEW.issue_id AND following = 1
    )
    AND user_id IS NOT CASE NEW.kind
      WHEN 'comment' THEN (SELECT author_id FROM issue_comments WHERE id = NEW.entity_id)
      WHEN 'event' THEN (SELECT actor_id FROM issue_events WHERE id = NEW.entity_id)
      WHEN 'reference' THEN (SELECT created_by FROM work_item_references WHERE id = NEW.entity_id)
    END;
END;
--> statement-breakpoint
CREATE TRIGGER pull_activity_notifies
AFTER INSERT ON pull_timeline
WHEN NEW.kind != 'thread'
BEGIN
  UPDATE notification_settings SET pending_at = strftime('%Y-%m-%dT%H:%M:%fZ','now')
  WHERE email_mode != 'off'
    AND user_id IN (
      SELECT author_id FROM pull_requests WHERE id = NEW.pull_request_id
      UNION SELECT user_id FROM pull_request_assignees WHERE pull_request_id = NEW.pull_request_id
      UNION SELECT author_id FROM pull_request_comments WHERE pull_request_id = NEW.pull_request_id
      UNION SELECT author_id FROM pull_request_reviews WHERE pull_request_id = NEW.pull_request_id
      UNION SELECT review_comments.author_id FROM review_comments JOIN review_threads ON review_threads.id = review_comments.thread_id WHERE review_threads.pull_request_id = NEW.pull_request_id
    )
    AND user_id IS NOT CASE NEW.kind
      WHEN 'comment' THEN (SELECT author_id FROM pull_request_comments WHERE id = NEW.entity_id)
      WHEN 'review' THEN (SELECT author_id FROM pull_request_reviews WHERE id = NEW.entity_id)
      WHEN 'event' THEN (SELECT actor_id FROM pull_request_events WHERE id = NEW.entity_id)
      WHEN 'reference' THEN (SELECT created_by FROM work_item_references WHERE id = NEW.entity_id)
    END;
END;
--> statement-breakpoint
CREATE TRIGGER review_thread_notifies
AFTER INSERT ON review_comments
WHEN NOT EXISTS (SELECT 1 FROM review_comments WHERE thread_id = NEW.thread_id AND id != NEW.id)
BEGIN
  UPDATE notification_settings SET pending_at = strftime('%Y-%m-%dT%H:%M:%fZ','now')
  WHERE email_mode != 'off'
    AND user_id != NEW.author_id
    AND user_id IN (
      SELECT pull_requests.author_id FROM pull_requests JOIN review_threads ON review_threads.pull_request_id = pull_requests.id WHERE review_threads.id = NEW.thread_id
      UNION SELECT pull_request_assignees.user_id FROM pull_request_assignees JOIN review_threads ON review_threads.pull_request_id = pull_request_assignees.pull_request_id WHERE review_threads.id = NEW.thread_id
      UNION SELECT pull_request_comments.author_id FROM pull_request_comments JOIN review_threads ON review_threads.pull_request_id = pull_request_comments.pull_request_id WHERE review_threads.id = NEW.thread_id
      UNION SELECT pull_request_reviews.author_id FROM pull_request_reviews JOIN review_threads ON review_threads.pull_request_id = pull_request_reviews.pull_request_id WHERE review_threads.id = NEW.thread_id
    );
END;
--> statement-breakpoint
CREATE TRIGGER mention_notifies
AFTER INSERT ON content_mentions
WHEN NEW.user_id IS NOT NEW.actor_id
BEGIN
  UPDATE notification_settings SET pending_at = strftime('%Y-%m-%dT%H:%M:%fZ','now')
  WHERE email_mode != 'off' AND user_id = NEW.user_id;
END;
--> statement-breakpoint
CREATE TRIGGER failed_run_notifies
AFTER UPDATE OF state ON runs
WHEN NEW.state = 'failure' AND OLD.state != 'failure' AND NEW.actor_id IS NOT NULL
BEGIN
  UPDATE notification_settings SET pending_at = strftime('%Y-%m-%dT%H:%M:%fZ','now')
  WHERE email_mode != 'off' AND user_id = NEW.actor_id;
END;
