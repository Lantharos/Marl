import type { InboxItem, InboxReason } from '@marl/contracts';
import { emailButton, emailLayout, escapeHtml } from '../core/email';

const reasonLabels: Record<InboxReason, string> = {
  mention: 'Mentioned',
  assignment: 'Assigned',
  participating: 'Participating',
  authored: 'Yours',
  failure: 'Failed run'
};

export function digestEmail(origin: string, email: string, items: InboxItem[], unsubscribeUrl: string) {
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
  return { recipient: email, subject, text, html };
}
