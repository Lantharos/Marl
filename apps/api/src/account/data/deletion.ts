import { requireFreshSession, type Principal } from '../../auth/principal';
import { auditStatement } from '../../core/audit';
import type { Env } from '../../core/platform';
import { json, problem, readJson } from '../../http/http';
import { accountDeletionBody } from '../../http/request-schemas';

const soleOwner = `organizations.kind='team' AND NOT EXISTS (SELECT 1 FROM organization_members other WHERE other.organization_id=organizations.id AND other.user_id<>?1 AND other.role='owner')`;
const hasOthers = `EXISTS (SELECT 1 FROM organization_members other WHERE other.organization_id=organizations.id AND other.user_id<>?1)`;
const ownedOrganizations = `SELECT organizations.id,organizations.slug,organizations.name,organizations.kind FROM organizations JOIN organization_members mine ON mine.organization_id=organizations.id AND mine.user_id=?1 AND mine.role='owner'`;

async function deletionPlan(env: Env, userId: string) {
  const [blockers, closing] = await env.DB.batch<{ id: string; slug: string; name: string; kind: string }>([
    env.DB.prepare(`${ownedOrganizations} WHERE ${soleOwner} AND ${hasOthers} ORDER BY organizations.slug`).bind(
      userId
    ),
    env.DB.prepare(`${ownedOrganizations} WHERE organizations.kind='personal' OR NOT ${hasOthers}`).bind(userId)
  ]);
  const organizationIds = closing.results.map((organization) => organization.id);
  const repositories = organizationIds.length
    ? await env.DB.prepare(
        `SELECT COUNT(*) AS count FROM repositories WHERE deletion_scheduled_at IS NULL AND organization_id IN (${organizationIds.map(() => '?').join(',')})`
      )
        .bind(...organizationIds)
        .first<{ count: number }>()
    : { count: 0 };
  return {
    blockers: blockers.results.map(({ slug, name }) => ({ slug, name })),
    organizationIds,
    teamOrganizations: closing.results
      .filter((organization) => organization.kind === 'team')
      .map(({ slug, name }) => ({ slug, name })),
    repositoryCount: repositories?.count ?? 0
  };
}

export async function previewAccountDeletion(env: Env, principal: Principal) {
  const { blockers, teamOrganizations, repositoryCount } = await deletionPlan(env, principal.id);
  return json({ blockers, teamOrganizations, repositoryCount });
}

export async function deleteAccount(request: Request, env: Env, principal: Principal) {
  if (principal.authType !== 'session')
    return problem(403, 'browser_session_required', 'Delete your account from a browser session.');
  if (!(await requireFreshSession(request, env, principal)))
    return problem(403, 'identity_confirmation_required', 'Confirm your identity before deleting your account.');
  const body = await readJson(request, accountDeletionBody);
  if (body?.confirmation !== principal.handle)
    return problem(422, 'confirmation_mismatch', 'Type your username to confirm.');
  const plan = await deletionPlan(env, principal.id);
  if (plan.blockers.length)
    return problem(
      409,
      'organization_owner_required',
      'Transfer or remove organizations you own before deleting your account.',
      {
        organizations: plan.blockers
      }
    );
  const user = await env.DB.prepare('SELECT auth_user_id AS authUserId FROM users WHERE id=?')
    .bind(principal.id)
    .first<{ authUserId: string | null }>();
  const deletionScheduledAt = new Date(Date.now() + 30 * 86400000).toISOString();
  const organizations = plan.organizationIds.map(() => '?').join(',');
  const tombstone = `deleted-${crypto.randomUUID().replaceAll('-', '').slice(0, 10)}`;
  await env.DB.batch([
    auditStatement(env, {
      actor: principal,
      action: 'account.deleted',
      subjectType: 'user',
      subjectId: principal.id,
      details: { repositories: plan.repositoryCount }
    }),
    ...(plan.organizationIds.length
      ? [
          env.DB.prepare(
            `UPDATE repositories SET deletion_scheduled_at=?,updated_at=CURRENT_TIMESTAMP WHERE deletion_scheduled_at IS NULL AND organization_id IN (${organizations})`
          ).bind(deletionScheduledAt, ...plan.organizationIds),
          env.DB.prepare(`DELETE FROM runners WHERE organization_id IN (${organizations})`).bind(
            ...plan.organizationIds
          ),
          env.DB.prepare(
            `UPDATE organizations SET name='Deleted user',avatar_url=NULL,description='',website=NULL WHERE kind='personal' AND id IN (${organizations})`
          ).bind(...plan.organizationIds),
          env.DB.prepare(`DELETE FROM organization_invitations WHERE organization_id IN (${organizations})`).bind(
            ...plan.organizationIds
          )
        ]
      : []),
    ...[
      'organization_members',
      'team_members',
      'repository_collaborators',
      'repository_stars',
      'inbox_item_states',
      'issue_participants',
      'issue_assignees',
      'pull_request_assignees',
      'ssh_keys',
      'personal_access_tokens',
      'user_emails',
      'legal_acceptances',
      'saved_replies',
      'notification_settings',
      'repository_notification_levels'
    ].map((table) => env.DB.prepare(`DELETE FROM ${table} WHERE user_id=?`).bind(principal.id)),
    env.DB.prepare(
      `UPDATE users SET handle=?,display_name='Deleted user',email=NULL,avatar_url=NULL,bio='',website=NULL,auth_user_id=NULL,deleted_at=CURRENT_TIMESTAMP WHERE id=?`
    ).bind(tombstone, principal.id),
    env.DB.prepare('DELETE FROM auth_user WHERE id=?').bind(user?.authUserId ?? principal.id)
  ]);
  return new Response(null, { status: 204 });
}
