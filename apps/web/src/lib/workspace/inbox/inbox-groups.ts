import type { InboxItem } from '@marl/contracts';
import type { ItemRef } from '../store/refs';

export type InboxGroupId = 'review' | 'mentioned' | 'assigned' | 'pull' | 'issue' | 'failed' | 'following';
export type InboxGroup = { id: InboxGroupId; label: string; items: InboxItem[] };

const labels: Record<InboxGroupId, string> = {
  review: 'Review requested',
  mentioned: 'Mentioned',
  assigned: 'Assigned',
  pull: 'Your pull',
  issue: 'Your issue',
  failed: 'Your run failed',
  following: 'Following'
};
const order = Object.keys(labels) as InboxGroupId[];

function groupOf(item: InboxItem): InboxGroupId {
  if (item.reason === 'failure') return 'failed';
  if (item.reason === 'mention') return 'mentioned';
  if (item.reason === 'assignment') return item.kind === 'pull' ? 'review' : 'assigned';
  if (item.reason === 'authored') return item.kind === 'pull' ? 'pull' : 'issue';
  return 'following';
}

export function groupInbox(items: InboxItem[]): InboxGroup[] {
  const groups = new Map<InboxGroupId, InboxItem[]>();
  for (const item of items) {
    const id = groupOf(item);
    groups.set(id, [...(groups.get(id) ?? []), item]);
  }
  return order.flatMap((id) => {
    const grouped = groups.get(id);
    return grouped ? [{ id, label: labels[id], items: grouped }] : [];
  });
}

export function inboxRef(item: InboxItem): ItemRef | null {
  if (item.kind === 'run') return null;
  return { kind: item.kind, owner: item.repository.owner, repo: item.repository.name, number: item.number };
}
