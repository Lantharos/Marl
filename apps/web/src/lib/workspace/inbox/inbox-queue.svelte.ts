import type { InboxItem, InboxPage } from '@marl/contracts';
import { api, MarlApiError } from '#lib/api.js';
import { updateInboxItem } from '#lib/inbox/inbox-item.js';
import { groupInbox } from './inbox-groups';

type Counts = InboxPage['counts'];
type Finished = { item: InboxItem; index: number };

const undoWindow = 8_000;

function failure(cause: unknown, fallback: string) {
  return cause instanceof MarlApiError ? cause.message : fallback;
}

export class InboxQueue {
  items = $state.raw<InboxItem[]>([]);
  counts = $state.raw<Counts>({ inbox: 0, unread: 0, done: 0 });
  nextCursor = $state<string | null>(null);
  status = $state<'idle' | 'loading' | 'ready' | 'failed'>('idle');
  loadingMore = $state(false);
  error = $state('');
  selectedId = $state<string | null>(null);
  finished = $state.raw<Finished | null>(null);
  readonly groups = $derived(groupInbox(this.items));
  readonly ordered = $derived(this.groups.flatMap((group) => group.items));
  readonly selected = $derived(this.ordered.find((item) => item.id === this.selectedId) ?? null);
  #undoTimer: ReturnType<typeof setTimeout> | undefined;

  load = async () => {
    if (this.status === 'loading' || this.status === 'ready') return;
    this.status = 'loading';
    try {
      const page = await api<InboxPage>('/inbox?status=inbox&limit=50');
      this.items = page.items;
      this.counts = page.counts;
      this.nextCursor = page.nextCursor;
      this.status = 'ready';
    } catch (cause) {
      this.error = failure(cause, 'Your inbox could not be loaded.');
      this.status = 'failed';
    }
  };

  loadMore = async () => {
    if (!this.nextCursor || this.loadingMore) return;
    this.loadingMore = true;
    try {
      const params = new URLSearchParams({ status: 'inbox', limit: '50', cursor: this.nextCursor });
      const page = await api<InboxPage>(`/inbox?${params}`);
      const known = new Set(this.items.map((item) => item.id));
      this.items = [...this.items, ...page.items.filter((item) => !known.has(item.id))];
      this.nextCursor = page.nextCursor;
    } catch (cause) {
      this.error = failure(cause, 'Older items could not be loaded.');
    } finally {
      this.loadingMore = false;
    }
  };

  select = (item: InboxItem) => {
    this.selectedId = item.id;
    if (item.unread) void this.#setRead(item, true);
  };

  step = (direction: 1 | -1) => {
    const index = this.ordered.findIndex((item) => item.id === this.selectedId);
    const next = this.ordered[index < 0 ? 0 : Math.min(this.ordered.length - 1, Math.max(0, index + direction))];
    if (next && next.id !== this.selectedId) this.select(next);
  };

  markDone = async (item: InboxItem) => {
    const position = this.ordered.indexOf(item);
    const index = this.items.indexOf(item);
    if (this.selectedId === item.id)
      this.selectedId = (this.ordered[position + 1] ?? this.ordered[position - 1])?.id ?? null;
    this.items = this.items.filter((candidate) => candidate.id !== item.id);
    this.#shift({ inbox: -1, unread: item.unread ? -1 : 0, done: 1 });
    this.#remember({ item, index });
    try {
      await updateInboxItem(item, { done: true });
    } catch (cause) {
      this.#restore({ item, index });
      this.error = failure(cause, 'This item could not be marked done.');
    }
  };

  undo = async () => {
    const finished = this.finished;
    if (!finished) return;
    this.#remember(null);
    this.#restore(finished);
    this.selectedId = finished.item.id;
    try {
      await updateInboxItem(finished.item, { done: false });
    } catch (cause) {
      this.items = this.items.filter((candidate) => candidate.id !== finished.item.id);
      this.#shift({ inbox: -1, unread: finished.item.unread ? -1 : 0, done: 1 });
      this.error = failure(cause, 'This item could not be restored.');
    }
  };

  toggleUnread = (item: InboxItem) => this.#setRead(item, item.unread);

  markAllRead = async () => {
    const previous = { items: this.items, counts: this.counts };
    this.items = this.items.map((item) => ({ ...item, unread: false }));
    this.counts = { ...this.counts, unread: 0 };
    try {
      await api('/inbox/read', { method: 'POST' });
    } catch (cause) {
      this.items = previous.items;
      this.counts = previous.counts;
      this.error = failure(cause, 'Items could not be marked as read.');
    }
  };

  async #setRead(item: InboxItem, read: boolean) {
    this.#replace(item.id, { unread: !read });
    this.#shift({ unread: read ? -1 : 1 });
    try {
      await updateInboxItem(item, { read });
    } catch (cause) {
      this.#replace(item.id, { unread: read });
      this.#shift({ unread: read ? 1 : -1 });
      this.error = failure(cause, 'This item could not be updated.');
    }
  }

  #restore({ item, index }: Finished) {
    this.items = this.items.toSpliced(Math.min(index, this.items.length), 0, item);
    this.#shift({ inbox: 1, unread: item.unread ? 1 : 0, done: -1 });
  }

  #remember(finished: Finished | null) {
    clearTimeout(this.#undoTimer);
    this.finished = finished;
    if (finished) this.#undoTimer = setTimeout(() => (this.finished = null), undoWindow);
  }

  #replace(id: string, change: Partial<InboxItem>) {
    this.items = this.items.map((item) => (item.id === id ? { ...item, ...change } : item));
  }

  #shift(change: Partial<Counts>) {
    this.counts = {
      inbox: this.counts.inbox + (change.inbox ?? 0),
      unread: this.counts.unread + (change.unread ?? 0),
      done: this.counts.done + (change.done ?? 0)
    };
  }
}
