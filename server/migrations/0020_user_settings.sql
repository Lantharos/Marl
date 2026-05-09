-- User settings columns are added by the runtime user schema guard so databases
-- that receive the new worker before migrations run do not fail on duplicate columns.
SELECT 1;
