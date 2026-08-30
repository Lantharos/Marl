CREATE INDEX repositories_by_recency
ON repositories(updated_at DESC, id DESC)
WHERE deletion_scheduled_at IS NULL;
