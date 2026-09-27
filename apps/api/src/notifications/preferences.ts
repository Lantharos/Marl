import type { EmailNotificationMode, InboxReason, NotificationPreferences } from '@marl/contracts';
import type { Principal } from '../auth/principal';
import type { Env } from '../core/platform';
import { verifyToken } from '../core/signed-token';
import { json, problem, readJson } from '../http/http';
import { notificationPreferencesBody, repositoryNotificationBody } from '../http/request-schemas';
import { authorizeRepository } from '../repositories/access/access';

export const allReasons: InboxReason[] = ['mention', 'assignment', 'participating', 'authored', 'failure'];

export async function getNotificationPreferences(env: Env, principal: Principal) {
  const [settings, repositories, email] = await env.DB.batch<Record<string, string>>([
    env.DB.prepare('SELECT email_mode AS mode,reasons_json AS reasons FROM notification_settings WHERE user_id=?').bind(
      principal.id
    ),
    env.DB.prepare(
      'SELECT organizations.slug AS owner,repositories.name,repository_notification_levels.level FROM repository_notification_levels JOIN repositories ON repositories.id=repository_notification_levels.repository_id JOIN organizations ON organizations.id=repositories.organization_id WHERE repository_notification_levels.user_id=? ORDER BY organizations.slug,repositories.name'
    ).bind(principal.id),
    env.DB.prepare(
      'SELECT email FROM user_emails WHERE user_id=? AND primary_email=1 AND verified_at IS NOT NULL'
    ).bind(principal.id)
  ]);
  const row = settings.results[0];
  return json({
    email: email.results[0]?.email ?? null,
    mode: (row?.mode as EmailNotificationMode | undefined) ?? 'immediate',
    reasons: row ? (JSON.parse(row.reasons) as InboxReason[]) : allReasons,
    repositories: repositories.results as NotificationPreferences['repositories']
  } satisfies NotificationPreferences);
}

export async function updateNotificationPreferences(request: Request, env: Env, principal: Principal) {
  const body = await readJson(request, notificationPreferencesBody);
  if (!body) return problem(422, 'invalid_notification_preferences', 'Choose how you want to be notified.');
  await env.DB.prepare(
    `INSERT INTO notification_settings (user_id,email_mode,reasons_json) VALUES (?1,COALESCE(?2,'immediate'),COALESCE(?3,'${JSON.stringify(allReasons)}')) ON CONFLICT(user_id) DO UPDATE SET email_mode=COALESCE(?2,email_mode),reasons_json=COALESCE(?3,reasons_json)`
  )
    .bind(principal.id, body.mode ?? null, body.reasons ? JSON.stringify([...new Set(body.reasons)]) : null)
    .run();
  return getNotificationPreferences(env, principal);
}

export async function getRepositoryNotificationLevel(env: Env, principal: Principal, owner: string, name: string) {
  const repository = await authorizeRepository(env, principal, owner, name, 'repository.read');
  if (!repository) return problem(404, 'repository_not_found', 'Repository not found.');
  const row = await env.DB.prepare(
    'SELECT level FROM repository_notification_levels WHERE user_id=? AND repository_id=?'
  )
    .bind(principal.id, repository.id)
    .first<{ level: string }>();
  return json({ level: row?.level ?? 'all' });
}

export async function setRepositoryNotificationLevel(
  request: Request,
  env: Env,
  principal: Principal,
  owner: string,
  name: string
) {
  const repository = await authorizeRepository(env, principal, owner, name, 'repository.read');
  if (!repository) return problem(404, 'repository_not_found', 'Repository not found.');
  const body = await readJson(request, repositoryNotificationBody);
  if (!body) return problem(422, 'invalid_notification_level', 'Choose a notification level.');
  await (
    body.level === 'all'
      ? env.DB.prepare('DELETE FROM repository_notification_levels WHERE user_id=? AND repository_id=?').bind(
          principal.id,
          repository.id
        )
      : env.DB.prepare(
          'INSERT INTO repository_notification_levels (user_id,repository_id,level) VALUES (?,?,?) ON CONFLICT(user_id,repository_id) DO UPDATE SET level=excluded.level'
        ).bind(principal.id, repository.id, body.level)
  ).run();
  return json({ level: body.level });
}

export async function unsubscribe(env: Env, token: string | null, url: URL) {
  const userId = await verifyToken(env, 'unsubscribe', token);
  if (!userId) return problem(410, 'unsubscribe_link_expired', 'This unsubscribe link has expired.');
  await env.DB.prepare(
    "INSERT INTO notification_settings (user_id,email_mode) VALUES (?,'off') ON CONFLICT(user_id) DO UPDATE SET email_mode='off'"
  )
    .bind(userId)
    .run();
  return Response.redirect(new URL('/notifications/unsubscribed', env.PUBLIC_URL || url.origin).href, 303);
}
