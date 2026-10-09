import type { InboxItem, InboxPage } from '@marl/contracts';
import { api, MarlApiError } from '#lib/api.js';
import { CursorList } from '#lib/ui/cursor-list.svelte.js';
import { openInboxItem, updateInboxItem } from './inbox-item';

export type InboxStatus = 'inbox' | 'unread' | 'done';
type Counts = InboxPage['counts'];

export class InboxState {
  readonly list: CursorList<InboxItem>;
  counts: Counts;
  error = $state('');
  #status: () => InboxStatus;

  constructor(source: () => InboxPage & { status: InboxStatus }) {
    this.#status = () => source().status;
    this.counts = $derived(source().counts);
    this.list = new CursorList(
      () => source(),
      async (cursor) => {
        const params = new URLSearchParams({ status: source().status, limit: '40', cursor });
        return api<InboxPage>(`/inbox?${params}`);
      },
      'Older items could not be loaded.'
    );
  }

  open = (item: InboxItem) => {
    const read = openInboxItem(item);
    if (!item.unread) return;
    this.#replace(item.id, { unread: false });
    this.#shift({ unread: -1 });
    read.catch(() => {
      this.#replace(item.id, { unread: true });
      this.#shift({ unread: 1 });
    });
  };

  toggleDone = async (item: InboxItem) => {
    const done = !item.done;
    const index = this.list.items.findIndex((candidate) => candidate.id === item.id);
    const change = done ? { inbox: -1, unread: item.unread ? -1 : 0, done: 1 } : { inbox: 1, unread: 0, done: -1 };
    this.error = '';
    this.list.items = this.list.items.filter((candidate) => candidate.id !== item.id);
    this.#shift(change);
    try {
      await updateInboxItem(item, { done });
    } catch (cause) {
      this.list.items = this.list.items.toSpliced(index, 0, item);
      this.#shift({ inbox: -change.inbox, unread: -change.unread, done: -change.done });
      this.error = cause instanceof MarlApiError ? cause.message : 'This item could not be updated.';
    }
  };

  markAllRead = async () => {
    const previous = { items: this.list.items, nextCursor: this.list.nextCursor, counts: this.counts };
    this.error = '';
    if (this.#status() === 'unread') {
      this.list.items = [];
      this.list.nextCursor = null;
    } else this.list.items = this.list.items.map((item) => ({ ...item, unread: false }));
    this.counts = { ...this.counts, unread: 0 };
    try {
      await api('/inbox/read', { method: 'POST' });
    } catch (cause) {
      this.list.items = previous.items;
      this.list.nextCursor = previous.nextCursor;
      this.counts = previous.counts;
      this.error = cause instanceof MarlApiError ? cause.message : 'Items could not be marked as read.';
    }
  };

  #replace(id: string, change: Partial<InboxItem>) {
    this.list.items = this.list.items.map((item) => (item.id === id ? { ...item, ...change } : item));
  }

  #shift(change: Partial<Counts>) {
    this.counts = {
      inbox: this.counts.inbox + (change.inbox ?? 0),
      unread: this.counts.unread + (change.unread ?? 0),
      done: this.counts.done + (change.done ?? 0)
    };
  }
}
