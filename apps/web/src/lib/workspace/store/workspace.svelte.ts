import { InboxQueue } from '../inbox/inbox-queue.svelte';
import { WorkQueue, type QueueState } from '../queue/work-queue.svelte';
import { IssueEntry } from './issue-entry.svelte';
import { PullEntry } from './pull-entry.svelte';
import { refKey, type ItemKind, type ItemRef } from './refs';

export type ItemEntry = PullEntry | IssueEntry;

class WorkspaceStore {
  #viewer: string | null = null;
  #entries = new Map<string, ItemEntry>();
  #queues = new Map<string, WorkQueue>();
  inbox = $state.raw(new InboxQueue());

  forViewer(id: string) {
    if (this.#viewer === id) return;
    if (this.#viewer) this.inbox = new InboxQueue();
    this.#viewer = id;
    this.#entries.clear();
    this.#queues.clear();
  }

  queue(kind: ItemKind, repository: string | null, state: QueueState) {
    const key = `${kind}:${repository ?? ''}:${state}`;
    let queue = this.#queues.get(key);
    if (!queue) {
      queue = new WorkQueue(kind, repository, state);
      this.#queues.set(key, queue);
    }
    return queue;
  }

  entry(ref: ItemRef): ItemEntry {
    const key = refKey(ref);
    let entry = this.#entries.get(key);
    if (!entry) {
      entry = ref.kind === 'pull' ? new PullEntry(ref) : new IssueEntry(ref);
      this.#entries.set(key, entry);
    }
    return entry;
  }

  pull(ref: ItemRef) {
    return this.entry({ ...ref, kind: 'pull' }) as PullEntry;
  }

  prefetch(ref: ItemRef) {
    void this.entry(ref).load();
  }
}

export const workspace = new WorkspaceStore();
