-- Workspace review metadata columns are added by the runtime workspace schema guard.
-- This migration is intentionally a no-op so databases that already opened the
-- new worker before migrations ran do not fail on duplicate columns.
SELECT 1;
