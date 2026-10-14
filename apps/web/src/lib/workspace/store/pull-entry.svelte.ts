import type { PullRequestDetail } from '@marl/contracts';
import { api, MarlApiError } from '#lib/api.js';
import { PullPageState } from '#lib/pulls/detail/pull-page-state.svelte.js';
import { connectPullLive } from '#lib/pulls/pull-live.js';
import { PullMergeability } from '#lib/pulls/PullMergeability.svelte.js';
import { itemEndpoint, type ItemRef } from './refs';

export class PullEntry {
  readonly kind = 'pull';
  readonly ref: ItemRef;
  readonly mergeability = new PullMergeability();
  state = $state.raw<PullPageState | null>(null);
  error = $state('');
  #request: Promise<void> | null = null;

  constructor(ref: ItemRef) {
    this.ref = ref;
  }

  get endpoint() {
    return itemEndpoint(this.ref);
  }

  load() {
    if (this.state) return Promise.resolve();
    this.#request ??= this.#fetch().finally(() => (this.#request = null));
    return this.#request;
  }

  async #fetch() {
    this.error = '';
    try {
      const { pullRequest } = await api<{ pullRequest: PullRequestDetail }>(this.endpoint);
      const route = { owner: this.ref.owner, repo: this.ref.repo, number: this.ref.number };
      this.state = new PullPageState(
        () => route,
        () => pullRequest,
        () => 'overview'
      );
    } catch (cause) {
      this.error = cause instanceof MarlApiError ? cause.message : 'This pull could not be loaded.';
    }
  }

  live() {
    const state = this.state;
    if (!state) return;
    return connectPullLive({
      path: `/api/v1${this.endpoint}/live`,
      onUpdate: state.applyUpdate,
      catchUp: state.catchUp
    });
  }

  checkMergeability(base: string, head: string) {
    return this.mergeability.check(this.endpoint, base, head);
  }
}
