import type { IssueDetail } from '@marl/contracts';
import { api, MarlApiError } from '#lib/api.js';
import { IssuePageState } from '#lib/issues/discussion/issue-page-state.svelte.js';
import { itemEndpoint, type ItemRef } from './refs';

export class IssueEntry {
  readonly kind = 'issue';
  readonly ref: ItemRef;
  state = $state.raw<IssuePageState | null>(null);
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
      const { issue } = await api<{ issue: IssueDetail }>(this.endpoint);
      const endpoint = this.endpoint;
      this.state = new IssuePageState(() => ({ issue, endpoint, signedIn: true }));
    } catch (cause) {
      this.error = cause instanceof MarlApiError ? cause.message : 'This issue could not be loaded.';
    }
  }
}
