ALTER TABLE review_threads ADD COLUMN commit_id TEXT;

UPDATE review_threads
SET commit_id = (
  SELECT source_commit_id
  FROM pull_requests
  WHERE pull_requests.id = review_threads.pull_request_id
)
WHERE commit_id IS NULL;

CREATE INDEX review_threads_by_pull_commit
ON review_threads(pull_request_id, commit_id, created_at);
