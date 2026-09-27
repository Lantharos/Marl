import type { InboxReason } from '@marl/contracts';
import type { Principal } from '../auth/principal';
import { sendEmail } from '../core/email';
import type { Env } from '../core/platform';
import { signToken } from '../core/signed-token';
import { inboxItems } from '../home/inbox';
import { digestEmail } from './digest';

type NotificationMessage = { userId: string };
type Recipient = {
  id: string;
  handle: string;
  displayName: string;
  email: string | null;
  available: number;
  reasons: string;
  lastEmailedAt: string;
  startedAt: string;
};

const pageSize = 500;
const sendBatchSize = 100;
const dueCondition = `settings.pending_at IS NOT NULL AND (
  (settings.email_mode='immediate' AND settings.last_emailed_at<=strftime('%Y-%m-%dT%H:%M:%fZ','now','-10 minutes'))
  OR (settings.email_mode='daily' AND settings.last_emailed_at<=strftime('%Y-%m-%dT%H:%M:%fZ','now','-1 day')))`;

const dueRecipient = `SELECT users.id,users.handle,users.display_name AS displayName,user_emails.email,users.deleted_at IS NULL AND users.suspended_at IS NULL AS available,settings.reasons_json AS reasons,settings.last_emailed_at AS lastEmailedAt,strftime('%Y-%m-%dT%H:%M:%fZ','now') AS startedAt
FROM notification_settings AS settings
JOIN users ON users.id=settings.user_id
LEFT JOIN user_emails ON user_emails.user_id=users.id AND user_emails.primary_email=1 AND user_emails.verified_at IS NOT NULL
WHERE settings.user_id=? AND ${dueCondition}`;

function timestamp(value: string) {
  return Date.parse(value.includes('T') ? value : `${value.replace(' ', 'T')}Z`);
}

export async function scheduleNotificationEmails(env: Env) {
  let after = '';
  for (;;) {
    const due = await env.DB.prepare(
      `SELECT settings.user_id AS userId FROM notification_settings AS settings WHERE ${dueCondition} AND settings.user_id>? ORDER BY settings.user_id LIMIT ${pageSize}`
    )
      .bind(after)
      .all<NotificationMessage>();
    for (let offset = 0; offset < due.results.length; offset += sendBatchSize)
      await env.NOTIFICATION_QUEUE.sendBatch(
        due.results.slice(offset, offset + sendBatchSize).map((body) => ({ body }))
      );
    if (due.results.length < pageSize) return;
    after = due.results.at(-1)!.userId;
  }
}

async function mutedRepositories(env: Env, userId: string) {
  const rows = await env.DB.prepare(
    "SELECT organizations.slug || '/' || repositories.name AS path,level FROM repository_notification_levels JOIN repositories ON repositories.id=repository_notification_levels.repository_id JOIN organizations ON organizations.id=repositories.organization_id WHERE user_id=?"
  )
    .bind(userId)
    .all<{ path: string; level: 'mentions' | 'ignore' }>();
  return new Map(rows.results.map((row) => [row.path.toLowerCase(), row.level]));
}

async function pendingItems(env: Env, recipient: Recipient & { email: string }) {
  const principal: Principal = {
    id: recipient.id,
    handle: recipient.handle,
    displayName: recipient.displayName,
    email: recipient.email,
    avatarUrl: null,
    staff: false,
    kind: 'person',
    authType: 'session'
  };
  const reasons = new Set(JSON.parse(recipient.reasons) as InboxReason[]);
  const since = timestamp(recipient.lastEmailedAt);
  const [items, levels] = await Promise.all([inboxItems(env, principal), mutedRepositories(env, recipient.id)]);
  return items.filter((item) => {
    const level = levels.get(`${item.repository.owner}/${item.repository.name}`.toLowerCase());
    return (
      item.unread &&
      !item.done &&
      timestamp(item.updatedAt) > since &&
      reasons.has(item.reason) &&
      level !== 'ignore' &&
      (level !== 'mentions' || item.reason === 'mention')
    );
  });
}

async function sendDigest(env: Env, recipient: Recipient & { email: string }) {
  const items = await pendingItems(env, recipient);
  if (!items.length) return false;
  const origin = env.PUBLIC_URL;
  const token = await signToken(env, 'unsubscribe', recipient.id, 60 * 86400);
  const unsubscribeUrl = `${origin}/api/v1/notifications/unsubscribe?token=${encodeURIComponent(token)}`;
  await sendEmail(env, {
    ...digestEmail(origin, recipient.email, items, unsubscribeUrl),
    headers: { 'List-Unsubscribe': `<${unsubscribeUrl}>`, 'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click' }
  });
  return true;
}

async function deliver(env: Env, userId: string) {
  const recipient = await env.DB.prepare(dueRecipient).bind(userId).first<Recipient>();
  if (!recipient) return;
  const sent =
    recipient.email && recipient.available ? await sendDigest(env, { ...recipient, email: recipient.email }) : false;
  await env.DB.prepare(
    'UPDATE notification_settings SET pending_at=CASE WHEN pending_at<=?2 THEN NULL ELSE pending_at END,last_emailed_at=CASE WHEN ?3 THEN ?2 ELSE last_emailed_at END WHERE user_id=?1'
  )
    .bind(userId, recipient.startedAt, sent ? 1 : 0)
    .run();
}

export async function sendNotificationEmails(batch: MessageBatch<NotificationMessage>, env: Env) {
  await Promise.all(
    batch.messages.map(async (message) => {
      try {
        await deliver(env, message.body.userId);
        message.ack();
      } catch (error) {
        console.error('Notification email failed', { userId: message.body.userId, error: String(error) });
        message.retry({ delaySeconds: 60 * message.attempts });
      }
    })
  );
}
