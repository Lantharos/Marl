import type { Principal } from './auth';
import type { Env } from './platform';

export type RepositoryCapability = 'read' | 'member' | 'write' | 'admin';
export type RepositoryAccess = {
  id: string;
  organizationId: string;
  owner: string;
  name: string;
  description: string;
  visibility: 'public' | 'private';
  defaultBranch: string;
  updatedAt: string;
  archivedAt: string | null;
  deletionScheduledAt: string | null;
  role: 'owner' | 'member' | null;
};

export async function lookupRepository(env: Env, owner: string, name: string, principal: Principal | null = null) {
  return env.DB.prepare(`SELECT repositories.id,repositories.organization_id AS organizationId,organizations.slug AS owner,repositories.name,repositories.description,repositories.visibility,repositories.default_branch AS defaultBranch,repositories.updated_at AS updatedAt,repositories.archived_at AS archivedAt,repositories.deletion_scheduled_at AS deletionScheduledAt,organization_members.role FROM repositories JOIN organizations ON organizations.id=repositories.organization_id LEFT JOIN organization_members ON organization_members.organization_id=repositories.organization_id AND organization_members.user_id=? WHERE organizations.slug=? COLLATE NOCASE AND repositories.name=? COLLATE NOCASE`).bind(principal?.id ?? '', owner, name).first<RepositoryAccess>();
}

export async function lookupRepositoryById(env: Env, repositoryId: string, principal: Principal | null = null) {
  return env.DB.prepare(`SELECT repositories.id,repositories.organization_id AS organizationId,organizations.slug AS owner,repositories.name,repositories.description,repositories.visibility,repositories.default_branch AS defaultBranch,repositories.updated_at AS updatedAt,repositories.archived_at AS archivedAt,repositories.deletion_scheduled_at AS deletionScheduledAt,organization_members.role FROM repositories JOIN organizations ON organizations.id=repositories.organization_id LEFT JOIN organization_members ON organization_members.organization_id=repositories.organization_id AND organization_members.user_id=? WHERE repositories.id=?`).bind(principal?.id ?? '', repositoryId).first<RepositoryAccess>();
}

export async function authorizeRepository(env: Env, principal: Principal | null, owner: string, name: string, capability: RepositoryCapability) {
  const repository = await lookupRepository(env, owner, name, principal);
  return allowRepository(repository, capability);
}

export async function authorizeRepositoryId(env: Env, principal: Principal | null, repositoryId: string, capability: RepositoryCapability) {
  return allowRepository(await lookupRepositoryById(env, repositoryId, principal), capability);
}

function allowRepository(repository: RepositoryAccess | null, capability: RepositoryCapability) {
  if (!repository || repository.deletionScheduledAt) return null;
  if (capability === 'read') return repository.visibility === 'public' || repository.role ? repository : null;
  if (!repository.role) return null;
  if (capability === 'member') return repository;
  if (capability === 'admin') return repository.role === 'owner' ? repository : null;
  if (repository.archivedAt) return null;
  return repository;
}

export async function repositoryRole(env: Env, principal: Principal, organizationId: string) {
  return (await env.DB.prepare('SELECT role FROM organization_members WHERE organization_id=? AND user_id=?').bind(organizationId, principal.id).first<{ role: 'owner' | 'member' }>())?.role ?? null;
}
