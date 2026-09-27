import type { InboxItem, InboxReason } from '@marl/contracts';
import type { Principal } from '../auth/principal';
import { emailButton, emailLayout, escapeHtml, sendEmail } from '../core/email';
import type { Env } from '../core/platform';
import { signToken } from '../core/signed-token';
import { inboxItems } from '../home/inbox';
import { allReasons } from './preferences';

type Recipient = {
  id: string;
  handle: string;
  displayName: string;
  email: string;
  mode: 'immediate' | 'daily' | null;
  reasons: string | null;
  lastEmailedAt: string | null;
};

const batchSize = 25;
const maxBatches = 8;
const reasonLabels: Record<InboxReason, string> = {
  mention: 'Mentioned',
  assignment: 'Assigned',
  participating: 'Participating',
  authored: 'Yours',
  failure: 'Failed run'
};

const dueRecipients = `SELECT users.id,users.handle,users.display_name AS displayName,user_emails.email,settings.email_mode AS mode,settings.reasons_json AS reasons,settings.last_emailed_at AS lastEmailedAt
FROM users
JOIN user_emails ON user_emails.user_id=users.id AND user_emails.primary_email=1 AND user_emails.verified_at IS NOT NULL
LEFT JOIN notification_settings AS settings ON settings.user_id=users.id
WHERE users.deleted_at IS NULL AND users.suspended_at IS NULL
  AND (settings.user_id IS NULL
    OR (settings.email_mode='immediate' AND settings.last_emailed_at<=datetime('now','-10 minutes'))
    OR (settings.email_mode='daily' AND settings.last_emailed_at<=datetime('now','-1 day')))
ORDER BY settings.last_emailed_at LIMIT ${batchSize}`;

function timestamp(value: string) {
  return Date.parse(value.includes('T') ? value : `${value.replace(' ', 'T')}Z`);
}

async function mutedRepositories(env: Env, userId: string) {
  const rows = await env.DB.prepare(
    "SELECT organizations.slug || '/' || repositories.name AS path,level FROM repository_notification_levels JOIN repositories ON repositories.id=repository_notification_levels.repository_id JOIN organizations ON organizations.id=repositories.organization_id WHERE user_id=?"
  )
    .bind(userId)
    .all<{ path: string; level: 'mentions' | 'ignore' }>();
  return new Map(rows.results.map((row) => [row.path.toLowerCase(), row.level]));
}

async function pendingItems(env: Env, recipient: Recipient) {
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
  const reasons = new Set(recipient.reasons ? (JSON.parse(recipient.reasons) as InboxReason[]) : allReasons);
  const since = timestamp(recipient.lastEmailedAt!);
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

function digestEmail(origin: string, recipient: Recipient, items: InboxItem[], unsubscribeUrl: string) {
  const shown = items.slice(0, 12);
  const more = items.length - shown.length;
  const subject =
    items.length === 1
      ? `${items[0].repository.owner}/${items[0].repository.name}: ${items[0].title}`
      : `${items.length} updates on Marl`;
  const rows = shown
    .map(
      (item) =>
        `<tr><td style="padding:12px 0;border-top:1px solid #2a2826"><div style="color:#77726e;font-size:12px">${escapeHtml(reasonLabels[item.reason])} · ${escapeHtml(`${item.repository.owner}/${item.repository.name}`)} ${item.kind === 'run' ? 'run' : item.kind === 'issue' ? '#' : '!'}${item.number}</div><a href="${escapeHtml(origin + item.href)}" style="display:block;margin-top:4px;color:#f4f1ed;font-size:15px;font-weight:700;text-decoration:none">${escapeHtml(item.title)}</a></td></tr>`
    )
    .join('');
  const html = emailLayout(
    items.length === 1 ? 'New activity on Marl' : `${items.length} updates on Marl`,
    `<table role="presentation" style="width:100%;border-collapse:collapse;margin:8px 0 24px">${rows}</table>${more > 0 ? `<p style="margin:0 0 20px;color:#aaa5a0;font-size:14px">And ${more} more.</p>` : ''}${emailButton('Open your inbox', `${origin}/inbox`)}`,
    `You receive these emails because of activity involving you. <a href="${escapeHtml(`${origin}/settings/account/notifications`)}" style="color:#aaa5a0">Change notification settings</a> or <a href="${escapeHtml(unsubscribeUrl)}" style="color:#aaa5a0">unsubscribe</a>.`
  );
  const text = [
    ...shown.map(
      (item) =>
        `${reasonLabels[item.reason]} · ${item.repository.owner}/${item.repository.name}\n${item.title}\n${origin}${item.href}`
    ),
    more > 0 ? `And ${more} more.` : '',
    `Open your inbox: ${origin}/inbox`,
    `Unsubscribe: ${unsubscribeUrl}`
  ]
    .filter(Boolean)
    .join('\n\n');
  return { recipient: recipient.email, subject, text, html };
}

async function deliver(env: Env, recipient: Recipient) {
  if (!recipient.mode) return;
  const items = await pendingItems(env, recipient);
  if (!items.length) return;
  const origin = env.PUBLIC_URL;
  const token = await signToken(env, 'unsubscribe', recipient.id, 60 * 86400);
  const unsubscribeUrl = `${origin}/api/v1/notifications/unsubscribe?token=${encodeURIComponent(token)}`;
  await sendEmail(env, {
    ...digestEmail(origin, recipient, items, unsubscribeUrl),
    headers: { 'List-Unsubscribe': `<${unsubscribeUrl}>`, 'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click' }
  });
}

export async function sendNotificationEmails(env: Env) {
  for (let batch = 0; batch < maxBatches; batch++) {
    const recipients = await env.DB.prepare(dueRecipients).all<Recipient>();
    for (const recipient of recipients.results) {
      await deliver(env, recipient).catch((error) =>
        console.error('Notification email failed', { userId: recipient.id, error: String(error) })
      );
      await env.DB.prepare(
        'INSERT INTO notification_settings (user_id) VALUES (?) ON CONFLICT(user_id) DO UPDATE SET last_emailed_at=CURRENT_TIMESTAMP'
      )
        .bind(recipient.id)
        .run();
    }
    if (recipients.results.length < batchSize) return;
  }
}
