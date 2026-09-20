ALTER TABLE branch_rules ADD COLUMN carry_approvals_forward INTEGER NOT NULL DEFAULT 0 CHECK (carry_approvals_forward IN (0,1));
UPDATE branch_rules SET carry_approvals_forward=1-dismiss_stale_reviews;
ALTER TABLE branch_rules DROP COLUMN dismiss_stale_reviews;
ALTER TABLE branch_rules ADD COLUMN allow_author_merge INTEGER NOT NULL DEFAULT 0 CHECK (allow_author_merge IN (0,1));
ALTER TABLE pull_request_reviews ADD COLUMN carried_from_review_id TEXT REFERENCES pull_request_reviews(id);
CREATE UNIQUE INDEX carried_review_per_head ON pull_request_reviews(carried_from_review_id,commit_id) WHERE carried_from_review_id IS NOT NULL;
CREATE TRIGGER reviews_match_current_head BEFORE INSERT ON pull_request_reviews
WHEN NOT EXISTS (SELECT 1 FROM pull_requests WHERE id=NEW.pull_request_id AND source_commit_id=NEW.commit_id AND state IN ('open','draft'))
BEGIN SELECT RAISE(ABORT,'pull_head_changed'); END;
ALTER TABLE repositories ADD COLUMN require_check_approval INTEGER NOT NULL DEFAULT 0 CHECK (require_check_approval IN (0,1));
ALTER TABLE runs ADD COLUMN approval_required INTEGER NOT NULL DEFAULT 0 CHECK (approval_required IN (0,1));
ALTER TABLE runs ADD COLUMN approved_by TEXT REFERENCES users(id);
ALTER TABLE runs ADD COLUMN approved_at TEXT;
ALTER TABLE runs ADD COLUMN pull_request_id TEXT REFERENCES pull_requests(id) ON DELETE SET NULL;
ALTER TABLE runs ADD COLUMN checkout_repository_id TEXT REFERENCES repositories(id);
ALTER TABLE runs ADD COLUMN untrusted INTEGER NOT NULL DEFAULT 0 CHECK (untrusted IN (0,1));
ALTER TABLE workflows ADD COLUMN trigger_config_json TEXT NOT NULL DEFAULT 'null';
UPDATE workflows SET trigger_config_json=triggers_json;
CREATE INDEX runs_waiting_approval ON runs(repository_id,commit_id) WHERE approval_required=1 AND state='queued';
CREATE UNIQUE INDEX automatic_pull_run ON runs(pull_request_id,workflow_id,commit_id) WHERE trigger_name='pull_request';
CREATE TRIGGER automatic_runs_match_pull_head BEFORE INSERT ON runs
WHEN NEW.trigger_name='pull_request' AND NOT EXISTS (SELECT 1 FROM pull_requests WHERE id=NEW.pull_request_id AND repository_id=NEW.repository_id AND source_commit_id=NEW.commit_id AND state='open')
BEGIN SELECT RAISE(ABORT,'pull_head_changed'); END;
CREATE TABLE issue_pull_links (
  issue_id TEXT NOT NULL REFERENCES issues(id) ON DELETE CASCADE,
  pull_request_id TEXT NOT NULL REFERENCES pull_requests(id) ON DELETE CASCADE,
  created_by TEXT NOT NULL REFERENCES users(id),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (issue_id,pull_request_id)
);
CREATE INDEX issue_pull_links_by_pull ON issue_pull_links(pull_request_id);
