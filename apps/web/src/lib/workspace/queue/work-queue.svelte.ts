import type { IssueSummary, PullRequestSummary } from '@marl/contracts';
import { api, MarlApiError } from '#lib/api.js';
import { refKey, type ItemKind, type ItemRef } from '../store/refs';

export type QueueState = 'open' | 'merged' | 'closed';
export type QueueItem = {
  key: string;
  ref: ItemRef;
  title: string;
  state: string;
  author: string;
  updatedAt: string;
};
type Page = { pullRequests?: PullRequestSummary[]; issues?: IssueSummary[]; nextCursor: string | null };

function toItem(kind: ItemKind, summary: PullRequestSummary | IssueSummary): QueueItem {
  const ref = { kind, owner: summary.repository.owner, repo: summary.repository.name, number: summary.number };
  return {
    key: refKey(ref),
    ref,
    title: summary.title,
    state: summary.state,
    author: summary.authorDisplayName || summary.author,
    updatedAt: summary.updatedAt
  };
}

export class WorkQueue {
  readonly kind: ItemKind;
  readonly repository: string | null;
  readonly state: QueueState;
  items = $state.raw<QueueItem[]>([]);
  nextCursor = $state<string | null>(null);
  status = $state<'idle' | 'loading' | 'ready' | 'failed'>('idle');
  loadingMore = $state(false);
  error = $state('');
  selectedKey = $state<string | null>(null);
  readonly selected = $derived(this.items.find((item) => item.key === this.selectedKey) ?? null);

  constructor(kind: ItemKind, repository: string | null, state: QueueState) {
    this.kind = kind;
    this.repository = repository;
    this.state = state;
  }

  #path(cursor?: string) {
    const params = new URLSearchParams({ state: this.state, limit: '50' });
    if (cursor) params.set('cursor', cursor);
    const collection = this.kind === 'pull' ? 'pulls' : 'issues';
    const base = this.repository ? `/repositories/${this.repository}/${collection}` : `/${collection}`;
    return `${base}?${params}`;
  }

  #read(page: Page) {
    const summaries = this.kind === 'pull' ? (page.pullRequests ?? []) : (page.issues ?? []);
    return summaries.map((summary) => toItem(this.kind, summary));
  }

  load = async () => {
    if (this.status === 'loading' || this.status === 'ready') return;
    this.status = 'loading';
    try {
      const page = await api<Page>(this.#path());
      this.items = this.#read(page);
      this.nextCursor = page.nextCursor;
      this.status = 'ready';
    } catch (cause) {
      this.error = cause instanceof MarlApiError ? cause.message : 'This list could not be loaded.';
      this.status = 'failed';
    }
  };

  loadMore = async () => {
    if (!this.nextCursor || this.loadingMore) return;
    this.loadingMore = true;
    try {
      const page = await api<Page>(this.#path(this.nextCursor));
      const known = new Set(this.items.map((item) => item.key));
      this.items = [...this.items, ...this.#read(page).filter((item) => !known.has(item.key))];
      this.nextCursor = page.nextCursor;
    } catch (cause) {
      this.error = cause instanceof MarlApiError ? cause.message : 'More items could not be loaded.';
    } finally {
      this.loadingMore = false;
    }
  };

  step = (direction: 1 | -1) => {
    const index = this.items.findIndex((item) => item.key === this.selectedKey);
    const next = this.items[index < 0 ? 0 : Math.min(this.items.length - 1, Math.max(0, index + direction))];
    if (next) this.selectedKey = next.key;
  };
}
