ALTER TABLE runners ADD COLUMN enrollment_id TEXT REFERENCES runner_enrollment_tokens(id);
CREATE UNIQUE INDEX runners_by_enrollment ON runners(enrollment_id) WHERE enrollment_id IS NOT NULL;
