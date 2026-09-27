import type { Principal } from '../auth/principal';
import type { Env } from '../core/platform';
import { authorizeRepository, authorizeRepositoryId, requireOrganizationRole } from '../repositories/access/access';

export type WebhookScope = { organizationId: string; repositoryId: string | null };

export async function repositoryScope(env: Env, principal: Principal, owner: string, name: string) {
  const repository = await authorizeRepository(env, principal, owner, name, 'repository.admin');
  return repository ? { organizationId: repository.organizationId, repositoryId: repository.id } : null;
}

export async function organizationScope(env: Env, principal: Principal, slug: string) {
  const organization = await env.DB.prepare("SELECT id FROM organizations WHERE slug=? COLLATE NOCASE AND kind='team'")
    .bind(slug)
    .first<{ id: string }>();
  if (!organization || !(await requireOrganizationRole(env, principal, organization.id, 'admin'))) return null;
  return { organizationId: organization.id, repositoryId: null };
}

export async function hookScope(env: Env, principal: Principal, webhookId: string) {
  const hook = await env.DB.prepare(
    'SELECT organization_id AS organizationId,repository_id AS repositoryId FROM webhooks WHERE id=?'
  )
    .bind(webhookId)
    .first<WebhookScope>();
  if (!hook) return null;
  const allowed = hook.repositoryId
    ? await authorizeRepositoryId(env, principal, hook.repositoryId, 'repository.admin')
    : await requireOrganizationRole(env, principal, hook.organizationId, 'admin');
  return allowed ? hook : null;
}
