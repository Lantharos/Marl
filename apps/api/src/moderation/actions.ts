import type { Principal } from '../auth/principal';
import { auditStatement } from '../core/audit';
import { sendTransactionalEmail } from '../core/email';
import type { D1PreparedStatement, Env } from '../core/platform';

export const suspendedOwnerReason = 'The owner’s account is suspended.';

const removableTables = {
  issue_comment: 'issue_comments',
  pull_comment: 'pull_request_comments',
  review_comment: 'review_comments'
} as const;

export type RemovableSubject = keyof typeof removableTables;

export function isRemovable(type: string): type is RemovableSubject {
  return type in removableTables;
}

function cancelRepositoryWork(env: Env, repositoryIds: string) {
  return [
    env.DB.prepare(
      `UPDATE jobs SET state='canceled',cancel_requested=1,lease_token_hash=NULL,lease_expires_at=NULL,completed_at=CURRENT_TIMESTAMP WHERE state IN ('queued','running') AND run_id IN (SELECT id FROM runs WHERE repository_id IN (${repositoryIds}))`
    ),
    env.DB.prepare(
      `UPDATE runs SET state='canceled',cancellation_reason='developer',completed_at=CURRENT_TIMESTAMP WHERE state IN ('queued','running') AND repository_id IN (${repositoryIds})`
    )
  ];
}

export function removeContent(env: Env, actor: Principal, type: RemovableSubject, id: string): D1PreparedStatement[] {
  return [
    env.DB.prepare(`UPDATE ${removableTables[type]} SET deleted_at=CURRENT_TIMESTAMP WHERE id=?`).bind(id),
    auditStatement(env, { actor, action: 'moderation.content_removed', subjectType: type, subjectId: id })
  ];
}

export async function disableRepository(env: Env, actor: Principal, repositoryId: string, reason: string) {
  const selected = 'SELECT id FROM repositories WHERE id=?';
  await env.DB.batch([
    env.DB.prepare(
      'UPDATE repositories SET disabled_at=CURRENT_TIMESTAMP,disabled_reason=? WHERE id=? AND disabled_at IS NULL'
    ).bind(reason, repositoryId),
    ...cancelRepositoryWork(env, selected).map((statement) => statement.bind(repositoryId)),
    auditStatement(env, {
      actor,
      repositoryId,
      action: 'moderation.repository_disabled',
      subjectType: 'repository',
      subjectId: repositoryId,
      details: { reason }
    })
  ]);
  await notifyRepositoryOwners(env, repositoryId, reason);
}

export async function enableRepository(env: Env, actor: Principal, repositoryId: string) {
  await env.DB.batch([
    env.DB.prepare('UPDATE repositories SET disabled_at=NULL,disabled_reason=NULL WHERE id=?').bind(repositoryId),
    auditStatement(env, {
      actor,
      repositoryId,
      action: 'moderation.repository_enabled',
      subjectType: 'repository',
      subjectId: repositoryId
    })
  ]);
}

const personalRepositories = `SELECT repositories.id FROM repositories JOIN organizations ON organizations.id=repositories.organization_id JOIN organization_members ON organization_members.organization_id=organizations.id WHERE organizations.kind='personal' AND organization_members.user_id=?`;

export async function suspendUser(env: Env, actor: Principal, userId: string, reason: string) {
  const user = await env.DB.prepare('SELECT auth_user_id AS authUserId,email FROM users WHERE id=? AND staff=0')
    .bind(userId)
    .first<{ authUserId: string | null; email: string | null }>();
  if (!user) return false;
  await env.DB.batch([
    env.DB.prepare(
      'UPDATE users SET suspended_at=CURRENT_TIMESTAMP,suspension_reason=? WHERE id=? AND suspended_at IS NULL'
    ).bind(reason, userId),
    env.DB.prepare('DELETE FROM auth_session WHERE user_id=?').bind(user.authUserId ?? userId),
    env.DB.prepare(
      'UPDATE personal_access_tokens SET revoked_at=CURRENT_TIMESTAMP WHERE user_id=? AND revoked_at IS NULL'
    ).bind(userId),
    env.DB.prepare(
      `UPDATE repositories SET disabled_at=CURRENT_TIMESTAMP,disabled_reason=? WHERE disabled_at IS NULL AND id IN (${personalRepositories})`
    ).bind(suspendedOwnerReason, userId),
    ...cancelRepositoryWork(env, personalRepositories).map((statement) => statement.bind(userId)),
    auditStatement(env, {
      actor,
      action: 'moderation.user_suspended',
      subjectType: 'user',
      subjectId: userId,
      details: { reason }
    })
  ]);
  if (user.email)
    await sendTransactionalEmail(env, {
      recipient: user.email,
      subject: 'Your Marl account has been suspended',
      heading: 'Your account has been suspended',
      body: `${reason} You can appeal this decision by replying to legal@marl.sh.`,
      actionLabel: 'Read the Acceptable Use Policy',
      actionUrl: `${env.PUBLIC_URL}/legal/acceptable-use`
    }).catch(() => {});
  return true;
}

export async function unsuspendUser(env: Env, actor: Principal, userId: string) {
  await env.DB.batch([
    env.DB.prepare('UPDATE users SET suspended_at=NULL,suspension_reason=NULL WHERE id=?').bind(userId),
    env.DB.prepare(
      `UPDATE repositories SET disabled_at=NULL,disabled_reason=NULL WHERE disabled_reason=? AND id IN (${personalRepositories})`
    ).bind(suspendedOwnerReason, userId),
    auditStatement(env, { actor, action: 'moderation.user_restored', subjectType: 'user', subjectId: userId })
  ]);
}

async function notifyRepositoryOwners(env: Env, repositoryId: string, reason: string) {
  const owners = await env.DB.prepare(
    `SELECT users.email,organizations.slug || '/' || repositories.name AS repository FROM repositories JOIN organizations ON organizations.id=repositories.organization_id JOIN organization_members ON organization_members.organization_id=organizations.id AND organization_members.role='owner' JOIN users ON users.id=organization_members.user_id WHERE repositories.id=? AND users.email IS NOT NULL`
  )
    .bind(repositoryId)
    .all<{ email: string; repository: string }>();
  await Promise.all(
    owners.results.map((owner) =>
      sendTransactionalEmail(env, {
        recipient: owner.email,
        subject: `${owner.repository} has been disabled`,
        heading: `${owner.repository} has been disabled`,
        body: `${reason} You can appeal this decision, or ask for a copy of the repository, by replying to legal@marl.sh.`,
        actionLabel: 'Read the Acceptable Use Policy',
        actionUrl: `${env.PUBLIC_URL}/legal/acceptable-use`
      }).catch(() => {})
    )
  );
}
