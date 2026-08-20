import type { RepositoryPermissions } from '@marl/contracts';
import type { Principal } from './auth';
import type { Env } from './platform';

export type OrganizationRole = 'owner' | 'admin' | 'member';
export type RepositoryRole = 'read' | 'triage' | 'write' | 'maintain' | 'admin';
export type RepositoryCapability = 'repository.read' | 'repository.triage' | 'repository.push' | 'repository.maintain' | 'repository.admin';

export type RepositoryAccess = {
  id: string;
  organizationId: string;
  owner: string;
  name: string;
  description: string;
  iconUrl: string | null;
  visibility: 'public' | 'private';
  defaultBranch: string;
  updatedAt: string;
  archivedAt: string | null;
  deletionScheduledAt: string | null;
  forkedFromRepositoryId: string | null;
  forkRootRepositoryId: string | null;
  role: RepositoryRole | null;
  organizationRole: OrganizationRole | null;
};

type RepositoryRow = Omit<RepositoryAccess, 'role'> & {
  baseRole: RepositoryRole | null;
  directRole: RepositoryRole | null;
  teamRoleWeight: number | null;
};

const repositorySelect = `SELECT repositories.id,repositories.organization_id AS organizationId,organizations.slug AS owner,repositories.name,repositories.description,repositories.icon_url AS iconUrl,repositories.visibility,repositories.default_branch AS defaultBranch,repositories.updated_at AS updatedAt,repositories.archived_at AS archivedAt,repositories.deletion_scheduled_at AS deletionScheduledAt,repositories.forked_from_repository_id AS forkedFromRepositoryId,repositories.fork_root_repository_id AS forkRootRepositoryId,organization_members.role AS organizationRole,CASE WHEN organization_members.user_id IS NOT NULL THEN organizations.base_repository_role END AS baseRole,(SELECT role FROM repository_collaborators WHERE repository_id=repositories.id AND user_id=?) AS directRole,(SELECT MAX(CASE repository_team_grants.role WHEN 'read' THEN 1 WHEN 'triage' THEN 2 WHEN 'write' THEN 3 WHEN 'maintain' THEN 4 WHEN 'admin' THEN 5 ELSE 0 END) FROM repository_team_grants JOIN team_members ON team_members.team_id=repository_team_grants.team_id WHERE repository_team_grants.repository_id=repositories.id AND team_members.user_id=?) AS teamRoleWeight FROM repositories JOIN organizations ON organizations.id=repositories.organization_id LEFT JOIN organization_members ON organization_members.organization_id=repositories.organization_id AND organization_members.user_id=?`;

export const accessibleRepositoryPredicate = `(EXISTS (SELECT 1 FROM organization_members AS access_members WHERE access_members.organization_id=repositories.organization_id AND access_members.user_id=?) OR EXISTS (SELECT 1 FROM repository_collaborators AS access_collaborators WHERE access_collaborators.repository_id=repositories.id AND access_collaborators.user_id=?) OR EXISTS (SELECT 1 FROM repository_team_grants AS access_grants JOIN team_members AS access_team_members ON access_team_members.team_id=access_grants.team_id WHERE access_grants.repository_id=repositories.id AND access_team_members.user_id=?))`;

export function repositoryListFilter(principal: Principal) {
  if (principal.authType === 'token' && !principal.tokenScopes?.some((scope) => ['repo:read', 'repo:write', 'repo:admin'].includes(scope))) return { sql: '0=1', values: [] };
  const values: string[] = [principal.id, principal.id, principal.id];
  if (principal.authType !== 'token' || !principal.tokenRepositoryIds) return { sql: accessibleRepositoryPredicate, values };
  if (principal.tokenRepositoryIds.length === 0) return { sql: '0=1', values: [] };
  return { sql: `${accessibleRepositoryPredicate} AND repositories.id IN (${principal.tokenRepositoryIds.map(() => '?').join(',')})`, values: [...values, ...principal.tokenRepositoryIds] };
}

export async function lookupRepository(env: Env, owner: string, name: string, principal: Principal | null = null) {
  const userId = principal?.id ?? '';
  const row = await env.DB.prepare(`${repositorySelect} WHERE organizations.slug=? COLLATE NOCASE AND repositories.name=? COLLATE NOCASE`).bind(userId, userId, userId, owner, name).first<RepositoryRow>();
  return row ? resolvedAccess(row) : null;
}

export async function lookupRepositoryById(env: Env, repositoryId: string, principal: Principal | null = null) {
  const userId = principal?.id ?? '';
  const row = await env.DB.prepare(`${repositorySelect} WHERE repositories.id=?`).bind(userId, userId, userId, repositoryId).first<RepositoryRow>();
  return row ? resolvedAccess(row) : null;
}

export async function authorizeRepository(env: Env, principal: Principal | null, owner: string, name: string, capability: RepositoryCapability) {
  return allowRepository(await lookupRepository(env, owner, name, principal), principal, capability);
}

export async function authorizeRepositoryId(env: Env, principal: Principal | null, repositoryId: string, capability: RepositoryCapability) {
  return allowRepository(await lookupRepositoryById(env, repositoryId, principal), principal, capability);
}

export async function organizationRole(env: Env, principal: Principal, organizationId: string) {
  return (await env.DB.prepare('SELECT role FROM organization_members WHERE organization_id=? AND user_id=?').bind(organizationId, principal.id).first<{ role: OrganizationRole }>())?.role ?? null;
}

export async function requireOrganizationRole(env: Env, principal: Principal, organizationId: string, minimum: 'admin' | 'owner') {
  if (principal.authType === 'token') return null;
  const role = await organizationRole(env, principal, organizationId);
  if (minimum === 'owner') return role === 'owner' ? role : null;
  return role === 'owner' || role === 'admin' ? role : null;
}

function allowRepository(repository: RepositoryAccess | null, principal: Principal | null, capability: RepositoryCapability) {
  if (!repository || repository.deletionScheduledAt) return null;
  if (capability === 'repository.read' && repository.visibility === 'public') return tokenAllows(principal, repository, capability) ? repository : null;
  if (!repository.role || !tokenAllows(principal, repository, capability)) return null;
  if (repository.archivedAt && capability === 'repository.push') return null;
  return roleWeight(repository.role) >= capabilityWeight(capability) ? repository : null;
}

function tokenAllows(principal: Principal | null, repository: RepositoryAccess, capability: RepositoryCapability) {
  if (!principal || principal.authType !== 'token') return true;
  if (principal.tokenRepositoryIds && !principal.tokenRepositoryIds.includes(repository.id)) return false;
  const scopes = principal.tokenScopes ?? [];
  if (capability === 'repository.read') return scopes.includes('repo:read') || scopes.includes('repo:write') || scopes.includes('repo:admin');
  if (capability === 'repository.triage') return scopes.includes('repo:write') || scopes.includes('repo:admin');
  if (capability === 'repository.push' || capability === 'repository.maintain') return scopes.includes('repo:write') || scopes.includes('repo:admin');
  return scopes.includes('repo:admin');
}

function resolvedAccess(row: RepositoryRow): RepositoryAccess {
  const { baseRole, directRole, teamRoleWeight, ...repository } = row;
  const privileged = repository.organizationRole === 'owner' || repository.organizationRole === 'admin';
  const weights = privileged ? [5] : [roleWeight(baseRole), roleWeight(directRole), teamRoleWeight ?? 0];
  return { ...repository, role: roleFromWeight(Math.max(...weights)) };
}

function roleWeight(role: RepositoryRole | null) {
  return role ? ['read', 'triage', 'write', 'maintain', 'admin'].indexOf(role) + 1 : 0;
}

export function repositoryPermissions(role: RepositoryRole | null, read = Boolean(role)): RepositoryPermissions {
  const weight = roleWeight(role);
  return { read, triage: weight >= 2, push: weight >= 3, maintain: weight >= 4, admin: weight >= 5 };
}

function roleFromWeight(weight: number): RepositoryRole | null {
  return (['read', 'triage', 'write', 'maintain', 'admin'][weight - 1] as RepositoryRole | undefined) ?? null;
}

function capabilityWeight(capability: RepositoryCapability) {
  return { 'repository.read': 1, 'repository.triage': 2, 'repository.push': 3, 'repository.maintain': 4, 'repository.admin': 5 }[capability];
}
