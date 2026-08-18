ALTER TABLE runs ADD COLUMN cancellation_reason TEXT CHECK (cancellation_reason IN ('developer', 'superseded'));
