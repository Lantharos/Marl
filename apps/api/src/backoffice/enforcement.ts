import type { Actor } from 'pult';
import { auditStatement } from '../core/audit';
import { sendTransactionalEmail } from '../core/email';
import type { Env } from '../core/platform';

const suspendedOwnerReason = 'The owner’s account is suspended.';

export const commentTables = {
  issue: 'issue_comments',
  pull: 'pull_request_comments',
  review: 'review_comments'
} as const;

export type CommentKind = keyof typeof commentTables;

function auditActor(actor: Actor) {
  return { id: null, handle: `pult:${actor.name}` };
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

export async function removeComment(env: Env, actor: Actor, kind: CommentKind, id: string) {
  await env.DB.batch([
    env.DB.prepare(`UPDATE ${commentTables[kind]} SET deleted_at=CURRENT_TIMESTAMP WHERE id=?`).bind(id),
    auditStatement(env, { actor: auditActor(actor), action: 'comment.removed', subjectType: kind, subjectId: id })
  ]);
}

export async function disableRepository(env: Env, actor: Actor, repositoryId: string, reason: string) {
  await env.DB.batch([
    env.DB.prepare(
      'UPDATE repositories SET disabled_at=CURRENT_TIMESTAMP,disabled_reason=? WHERE id=? AND disabled_at IS NULL'
    ).bind(reason, repositoryId),
    ...cancelRepositoryWork(env, 'SELECT id FROM repositories WHERE id=?').map((statement) =>
      statement.bind(repositoryId)
    ),
    auditStatement(env, {
      actor: auditActor(actor),
      repositoryId,
      action: 'repository.disabled',
      subjectType: 'repository',
      subjectId: repositoryId,
      details: { reason }
    })
  ]);
  return notifyRepositoryOwners(env, repositoryId, reason);
}

export async function enableRepository(env: Env, actor: Actor, repositoryId: string) {
  await env.DB.batch([
    env.DB.prepare('UPDATE repositories SET disabled_at=NULL,disabled_reason=NULL WHERE id=?').bind(repositoryId),
    auditStatement(env, {
      actor: auditActor(actor),
      repositoryId,
      action: 'repository.enabled',
      subjectType: 'repository',
      subjectId: repositoryId
    })
  ]);
}

const personalRepositories = `SELECT repositories.id FROM repositories JOIN organizations ON organizations.id=repositories.organization_id JOIN organization_members ON organization_members.organization_id=organizations.id WHERE organizations.kind='personal' AND organization_members.user_id=?`;

export async function suspendUser(env: Env, actor: Actor, user: { id: string; email: string | null }, reason: string) {
  await env.DB.batch([
    env.DB.prepare(
      'UPDATE users SET suspended_at=CURRENT_TIMESTAMP,suspension_reason=? WHERE id=? AND suspended_at IS NULL'
    ).bind(reason, user.id),
    env.DB.prepare('DELETE FROM auth_session WHERE user_id=?').bind(user.id),
    env.DB.prepare(
      'UPDATE personal_access_tokens SET revoked_at=CURRENT_TIMESTAMP WHERE user_id=? AND revoked_at IS NULL'
    ).bind(user.id),
    env.DB.prepare(
      `UPDATE repositories SET disabled_at=CURRENT_TIMESTAMP,disabled_reason=? WHERE disabled_at IS NULL AND id IN (${personalRepositories})`
    ).bind(suspendedOwnerReason, user.id),
    ...cancelRepositoryWork(env, personalRepositories).map((statement) => statement.bind(user.id)),
    auditStatement(env, {
      actor: auditActor(actor),
      action: 'account.suspended',
      subjectType: 'user',
      subjectId: user.id,
      details: { reason }
    })
  ]);
  if (!user.email) return false;
  return sendTransactionalEmail(env, {
    recipient: user.email,
    subject: 'Your Marl account has been suspended',
    heading: 'Your account has been suspended',
    body: `${reason} You can appeal this decision by replying to legal@marl.sh.`,
    actionLabel: 'Read the Acceptable Use Policy',
    actionUrl: `${env.PUBLIC_URL}/legal/acceptable-use`
  }).then(
    () => true,
    () => false
  );
}

export async function restoreUser(env: Env, actor: Actor, userId: string) {
  await env.DB.batch([
    env.DB.prepare('UPDATE users SET suspended_at=NULL,suspension_reason=NULL WHERE id=?').bind(userId),
    env.DB.prepare(
      `UPDATE repositories SET disabled_at=NULL,disabled_reason=NULL WHERE disabled_reason=? AND id IN (${personalRepositories})`
    ).bind(suspendedOwnerReason, userId),
    auditStatement(env, {
      actor: auditActor(actor),
      action: 'account.restored',
      subjectType: 'user',
      subjectId: userId
    })
  ]);
}

export async function signOutEverywhere(env: Env, actor: Actor, userId: string) {
  await env.DB.batch([
    env.DB.prepare('DELETE FROM auth_session WHERE user_id=?').bind(userId),
    auditStatement(env, {
      actor: auditActor(actor),
      action: 'account.signed_out',
      subjectType: 'user',
      subjectId: userId
    })
  ]);
}

async function notifyRepositoryOwners(env: Env, repositoryId: string, reason: string) {
  const owners = await env.DB.prepare(
    `SELECT users.email,organizations.slug || '/' || repositories.name AS repository FROM repositories JOIN organizations ON organizations.id=repositories.organization_id JOIN organization_members ON organization_members.organization_id=organizations.id AND organization_members.role='owner' JOIN users ON users.id=organization_members.user_id WHERE repositories.id=? AND users.email IS NOT NULL`
  )
    .bind(repositoryId)
    .all<{ email: string; repository: string }>();
  const sent = await Promise.allSettled(
    owners.results.map((owner) =>
      sendTransactionalEmail(env, {
        recipient: owner.email,
        subject: `${owner.repository} has been disabled`,
        heading: `${owner.repository} has been disabled`,
        body: `${reason} You can appeal this decision, or ask for a copy of the repository, by replying to legal@marl.sh.`,
        actionLabel: 'Read the Acceptable Use Policy',
        actionUrl: `${env.PUBLIC_URL}/legal/acceptable-use`
      })
    )
  );
  return sent.every((result) => result.status === 'fulfilled');
}
