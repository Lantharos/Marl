-- Workspace review metadata columns are part of the baseline schema.
-- This migration remains a no-op for databases that received those columns
-- from an older compatibility release before migrations ran.
SELECT 1;
