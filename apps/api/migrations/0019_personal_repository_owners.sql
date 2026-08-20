INSERT OR IGNORE INTO organizations (id,slug,name,kind,base_repository_role)
SELECT 'org_personal_' || users.id,users.handle,users.display_name,'personal',NULL
FROM users
WHERE NOT EXISTS (
  SELECT 1
  FROM organizations
  JOIN organization_members ON organization_members.organization_id=organizations.id
  WHERE organization_members.user_id=users.id AND organizations.kind='personal'
) AND NOT EXISTS (
  SELECT 1 FROM organizations WHERE organizations.slug=users.handle COLLATE NOCASE
);

INSERT OR IGNORE INTO organization_members (organization_id,user_id,role)
SELECT organizations.id,users.id,'owner'
FROM users
JOIN organizations ON organizations.slug=users.handle COLLATE NOCASE AND organizations.kind='personal';
