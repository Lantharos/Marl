import { goto } from '$app/navigation';
import type { InboxItem } from '@marl/contracts';
import { api } from '#lib/api.js';

export function updateInboxItem(item: InboxItem, change: { read?: boolean; done?: boolean }) {
  return api(`/inbox/${item.kind}/${item.id.slice(item.id.indexOf(':') + 1)}`, {
    method: 'PATCH',
    body: JSON.stringify(change)
  });
}

export function openInboxItem(item: InboxItem) {
  const read = item.unread ? updateInboxItem(item, { read: true }) : Promise.resolve();
  void goto(item.href);
  return read;
}

export function inboxReason(item: InboxItem) {
  if (item.reason === 'mention') return 'mentioned you';
  if (item.reason === 'assignment') return `assigned this ${item.kind === 'pull' ? 'pull' : 'issue'} to you`;
  if (item.reason === 'failure') return 'failed after you triggered it';
  if (item.reason === 'authored') return `updated ${item.kind === 'pull' ? 'a pull' : 'an issue'} you opened`;
  return `updated ${item.kind === 'pull' ? 'a pull' : 'an issue'} you joined`;
}
