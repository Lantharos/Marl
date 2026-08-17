ALTER TABLE branches ADD COLUMN index_version TEXT NOT NULL DEFAULT '';

CREATE INDEX branches_by_index_version ON branches(repository_id, index_version);
