CREATE TABLE IF NOT EXISTS tenant_members (
    tenant TEXT NOT NULL,
    user TEXT NOT NULL,
    role TEXT NOT NULL,
    added_by TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    PRIMARY KEY (tenant, user)
);
CREATE INDEX IF NOT EXISTS idx_tenant_members_user ON tenant_members(user, tenant);

CREATE TABLE IF NOT EXISTS project_members (
    tenant TEXT NOT NULL,
    project TEXT NOT NULL,
    user TEXT NOT NULL,
    role TEXT NOT NULL,
    added_by TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    PRIMARY KEY (tenant, project, user)
);
CREATE INDEX IF NOT EXISTS idx_project_members_user ON project_members(user, tenant, project);

INSERT OR IGNORE INTO tenant_members (tenant, user, role, added_by, created_at, updated_at)
SELECT tenants.name, json_each.value, 'maintainer', tenants.owner, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
FROM tenants, json_each(tenants.members_json)
WHERE json_each.value != tenants.owner;
