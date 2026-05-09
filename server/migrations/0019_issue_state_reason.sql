-- Issue close reasons are added by the runtime issue schema guard.
-- Keep this migration idempotent for databases that saw the new worker first.
SELECT 1;
