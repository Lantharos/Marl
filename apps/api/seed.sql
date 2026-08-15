INSERT OR IGNORE INTO users (id, handle, display_name) VALUES ('usr_local', 'kristof', 'Kristof Imeri');
INSERT OR IGNORE INTO organizations (id, slug, name) VALUES ('org_lantharos', 'lantharos', 'Lantharos');
INSERT OR IGNORE INTO organization_members (organization_id, user_id, role) VALUES ('org_lantharos', 'usr_local', 'owner');
