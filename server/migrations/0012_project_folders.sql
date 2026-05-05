ALTER TABLE projects ADD COLUMN folder TEXT;
CREATE INDEX IF NOT EXISTS idx_projects_tenant_folder ON projects(tenant, folder, project);
