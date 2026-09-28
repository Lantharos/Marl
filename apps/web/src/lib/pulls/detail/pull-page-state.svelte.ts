import type {
  MergeMethod,
  PullRealtimeUpdate,
  PullRequestDetail,
  PullRequestDiff,
  PullRevisionSummary,
  PullRevisionWindow,
  PullTimelineWindow,
  ReviewThread
} from '@marl/contracts';
import { api, MarlApiError } from '$lib/api';
import { reviewThreadContext, type ThreadCodeLine } from '$lib/code/diff';
import { PullTimelineState } from '../timeline/PullTimelineState.svelte';
import type { PullLifecycleAction } from '../PullLifecycleActions.svelte';
import type { PullComposerAction } from '../review/PullActionComposer.svelte';
import { applyPullUpdate } from './pull-updates';

export type PullTab = 'overview' | 'commits' | 'changes' | 'checks';
type Route = { owner: string; repo: string; number: number };
type MetadataChange = { assigneeIds?: string[]; labelIds?: string[]; locked?: boolean };
type LineDraft = { path: string; side: 'old' | 'new'; startLine: number; line: number };
type UpdateResult = { update?: PullRealtimeUpdate };

export class PullPageState {
  readonly route: Route;
  pull: PullRequestDetail;
  timeline: PullTimelineState;
  diff = $state<PullRequestDiff | null>(null);
  diffLoading = $state(false);
  diffScope = $state<'all' | 'since'>('all');
  tab = $state<PullTab>('overview');
  error = $state('');
  busy = $state(false);
  approvingChecks = $state(false);
  revisionNotice = $state(false);
  reviewOpen = $state(false);
  reviewState = $state<'commented' | 'approved' | 'changes_requested'>('commented');
  reviewBody = $state('');
  commentBody = $state('');
  mergeMethod = $state<MergeMethod>('merge');
  expandedRevisions = $state<number[]>([]);
  loadingRevisions = $state<number[]>([]);
  #patches = new Map<string, Promise<string>>();
  #catchUp: Promise<void> | null = null;
  #stateRefreshQueued = false;

  constructor(route: Route, source: () => PullRequestDetail) {
    this.route = route;
    this.pull = $derived(source());
    this.timeline = $derived(new PullTimelineState(source().timeline));
  }

  get endpoint() {
    return `/repositories/${this.route.owner}/${this.route.repo}/pulls/${this.route.number}`;
  }

  get open() {
    return this.pull.state !== 'merged' && this.pull.state !== 'closed';
  }

  get reviewable() {
    return this.pull.canManage && !this.pull.locked && this.open;
  }

  get sinceCommit() {
    const reviewed = this.pull.viewerLastReview?.commitId;
    return reviewed && reviewed !== this.pull.sourceCommitId ? reviewed : null;
  }

  setDiffScope = (scope: 'all' | 'since') => {
    if (scope === this.diffScope) return;
    this.diffScope = scope;
    this.diff = null;
    void this.loadDiff();
  };

  get changeThreads() {
    const threads = new Map((this.diff?.threads ?? []).map((thread) => [thread.id, thread]));
    for (const key of this.timeline.order) {
      const item = this.timeline.items.get(key);
      if (item?.kind === 'thread') threads.set(item.value.id, item.value);
    }
    return [...threads.values()];
  }

  async #run(fallback: string, action: () => Promise<void>) {
    if (this.busy) return false;
    this.busy = true;
    this.error = '';
    try {
      await action();
      return true;
    } catch (cause) {
      this.error = cause instanceof MarlApiError ? cause.message : fallback;
      return false;
    } finally {
      this.busy = false;
    }
  }

  #send(path: string, method: string, body?: unknown) {
    return api<UpdateResult>(path, { method, body: body === undefined ? undefined : JSON.stringify(body) }).then(
      (result) => this.applyUpdate(result.update)
    );
  }

  applyUpdate = (update?: PullRealtimeUpdate) => {
    if (!update || update.version <= this.pull.realtimeVersion) return;
    if (update.version !== this.pull.realtimeVersion + 1) {
      void this.catchUp();
      return;
    }
    const previousSource = this.pull.sourceCommitId;
    const previousTarget = this.pull.targetCommitId;
    const next = applyPullUpdate(this.pull, this.timeline, this.diff, update);
    this.pull = next.pull;
    this.diff = next.diff;
    if (this.pull.sourceCommitId !== previousSource) {
      this.reviewOpen = false;
      this.revisionNotice = true;
    }
    if (this.pull.sourceCommitId !== previousSource || this.pull.targetCommitId !== previousTarget)
      this.#revisionChanged();
    if (update.payload.refreshState) this.#scheduleStateRefresh();
  };

  #revisionChanged() {
    this.diff = null;
    this.diffLoading = false;
    this.#patches.clear();
    void this.#refreshTimeline();
    if (this.tab === 'changes') void this.loadDiff();
  }

  catchUp = () => {
    this.#catchUp ??= this.#runCatchUp().finally(() => (this.#catchUp = null));
    return this.#catchUp;
  };

  async #runCatchUp() {
    let hasMore = true;
    while (hasMore) {
      const result = await api<{ updates: PullRealtimeUpdate[]; hasMore: boolean; version: number }>(
        `${this.endpoint}/updates?after=${this.pull.realtimeVersion}`
      );
      for (const update of result.updates) this.applyUpdate(update);
      hasMore = result.hasMore;
      if (!result.updates.length)
        this.pull = { ...this.pull, realtimeVersion: Math.max(this.pull.realtimeVersion, result.version) };
    }
  }

  async #refreshState() {
    const result = await api<{ state: Partial<PullRequestDetail> }>(`${this.endpoint}/state`);
    if (Number(result.state.realtimeVersion ?? 0) >= this.pull.realtimeVersion)
      this.pull = { ...this.pull, ...result.state, realtimeVersion: this.pull.realtimeVersion };
  }

  #scheduleStateRefresh() {
    if (this.#stateRefreshQueued) return;
    this.#stateRefreshQueued = true;
    queueMicrotask(async () => {
      await this.#refreshState().catch(() => {});
      this.#stateRefreshQueued = false;
    });
  }

  async #refreshTimeline() {
    try {
      const result = await api<{ timeline: PullTimelineWindow }>(`${this.endpoint}/timeline`);
      this.timeline.replace(result.timeline);
      this.expandedRevisions = [];
      this.loadingRevisions = [];
    } catch (cause) {
      this.error = cause instanceof MarlApiError ? cause.message : 'Revision history could not be refreshed.';
    }
  }

  toggleRevision = async (revision: PullRevisionSummary) => {
    const { sequence } = revision;
    if (this.expandedRevisions.includes(sequence)) {
      this.expandedRevisions = this.expandedRevisions.filter((item) => item !== sequence);
      return;
    }
    this.expandedRevisions = [...this.expandedRevisions, sequence];
    if (this.timeline.revisionLoaded(sequence) || this.loadingRevisions.includes(sequence)) return;
    this.loadingRevisions = [...this.loadingRevisions, sequence];
    try {
      const result = await api<{ timeline: PullRevisionWindow }>(`${this.endpoint}/timeline?revision=${sequence}`);
      this.timeline.loadRevision(result.timeline);
    } catch (cause) {
      this.expandedRevisions = this.expandedRevisions.filter((item) => item !== sequence);
      this.error = cause instanceof MarlApiError ? cause.message : 'Revision activity could not be loaded.';
    } finally {
      this.loadingRevisions = this.loadingRevisions.filter((item) => item !== sequence);
    }
  };

  async loadDiff() {
    if (this.diff || this.diffLoading) return;
    const head = this.pull.sourceCommitId;
    const since = this.diffScope === 'since' ? this.sinceCommit : null;
    this.diffLoading = true;
    try {
      const diff = await api<PullRequestDiff>(`${this.endpoint}/diff${since ? `?since=${since}` : ''}`);
      if (head === this.pull.sourceCommitId && since === (this.diffScope === 'since' ? this.sinceCommit : null))
        this.diff = diff;
    } catch (cause) {
      this.error = cause instanceof MarlApiError ? cause.message : 'Changes could not be loaded.';
    } finally {
      this.diffLoading = false;
    }
  }

  loadPatch = (path: string, revision = this.pull.sourceCommitId, since: string | null = null) => {
    const key = `${since ?? ''}:${revision}:${path}`;
    const cached = this.#patches.get(key);
    if (cached) return cached;
    const query = new URLSearchParams({ path, revision, ...(since ? { since } : {}) });
    const request = api<{ patch: string }>(`${this.endpoint}/patch?${query}`).then((result) => result.patch);
    this.#patches.set(key, request);
    request.catch(() => this.#patches.get(key) === request && this.#patches.delete(key));
    return request;
  };

  loadThreadContext = async (thread: ReviewThread): Promise<ThreadCodeLine[]> =>
    reviewThreadContext(await this.loadPatch(thread.path, thread.commitId), thread.side, thread.startLine, thread.line);

  #markReviewed() {
    this.pull = {
      ...this.pull,
      viewerLastReview: { commitId: this.pull.sourceCommitId, createdAt: new Date().toISOString() }
    };
    this.diffScope = 'all';
  }

  submitReview = async () => {
    const submitted = await this.#run('Review could not be submitted.', () =>
      this.#send(`${this.endpoint}/reviews`, 'POST', {
        state: this.reviewState,
        body: this.reviewBody,
        commitId: this.pull.sourceCommitId
      })
    );
    if (!submitted) return;
    this.#markReviewed();
    this.reviewBody = '';
    this.reviewOpen = false;
    this.tab = 'overview';
  };

  addComment = async () => {
    if (!this.commentBody.trim()) return;
    if (
      await this.#run('Comment could not be added.', () =>
        this.#send(`${this.endpoint}/comments`, 'POST', { body: this.commentBody })
      )
    )
      this.commentBody = '';
  };

  savePullComment = (id: string, body: string) =>
    this.#run('Comment could not be updated.', () => this.#send(`/pull-comments/${id}`, 'PATCH', { body }));

  deletePullComment = (id: string) =>
    this.#run('Comment could not be deleted.', () => this.#send(`/pull-comments/${id}`, 'DELETE'));

  deleteReviewBody = (id: string) =>
    this.#run('Review comment could not be deleted.', () => this.#send(`/pull-reviews/${id}/body`, 'DELETE'));

  reply = async (threadId: string, body: string) => {
    if (body.trim())
      await this.#run('Reply could not be added.', () =>
        this.#send(`/review-threads/${threadId}/comments`, 'POST', { body })
      );
  };

  saveReviewComment = async (id: string, body: string) => {
    if (body.trim())
      await this.#run('Comment could not be updated.', () => this.#send(`/review-comments/${id}`, 'PATCH', { body }));
  };

  deleteReviewComment = async (id: string) => {
    await this.#run('Comment could not be deleted.', () => this.#send(`/review-comments/${id}`, 'DELETE'));
  };

  createLineComment = async (draft: LineDraft, body: string) => {
    if (!body.trim()) return;
    await this.#run('Comment could not be added.', () =>
      this.#send(`${this.endpoint}/threads`, 'POST', { ...draft, startSide: draft.side, body })
    );
  };

  setThreadResolved = async (threadId: string, resolved: boolean) => {
    const before = this.timeline.get('thread', threadId);
    this.timeline.patch('thread', threadId, { resolved });
    const saved = await this.#run('Conversation could not be updated.', () =>
      this.#send(`/review-threads/${threadId}/resolve`, 'POST', { resolved })
    );
    if (!saved) this.timeline.restore(before);
  };

  updateMetadata = async (change: MetadataChange) => {
    await this.#run('Pull metadata could not be updated.', () =>
      this.#send(`${this.endpoint}/metadata`, 'PATCH', change)
    );
  };

  createLabel = async (name: string) => {
    await this.#run('Label could not be created.', async () => {
      const result = await api<{ label: PullRequestDetail['labels'][number] } & UpdateResult>(
        `${this.endpoint}/labels`,
        {
          method: 'POST',
          body: JSON.stringify({ name })
        }
      );
      if (result.update) return this.applyUpdate(result.update);
      const include = (labels: PullRequestDetail['labels']) =>
        labels.some((label) => label.id === result.label.id) ? labels : [...labels, result.label];
      this.pull = {
        ...this.pull,
        availableLabels: include(this.pull.availableLabels),
        labels: include(this.pull.labels)
      };
    });
  };

  saveDetails = (title: string, body: string) =>
    this.#run('Pull details could not be updated.', () => this.#send(this.endpoint, 'PATCH', { title, body }));

  act = async (action: PullComposerAction | PullLifecycleAction) => {
    const review = action === 'approve' || action === 'request_changes';
    const done = await this.#run('Pull action could not be completed.', () => {
      if (review)
        return this.#send(`${this.endpoint}/reviews`, 'POST', {
          state: action === 'approve' ? 'approved' : 'changes_requested',
          body: this.commentBody,
          commitId: this.pull.sourceCommitId
        });
      if (action === 'merge' || action === 'enqueue')
        return this.#send(
          `${this.endpoint}/${action === 'merge' ? 'merge' : 'queue'}`,
          action === 'merge' ? 'POST' : 'PUT',
          {
            method: this.mergeMethod,
            commitId: this.pull.sourceCommitId
          }
        );
      if (action === 'dequeue') return this.#send(`${this.endpoint}/queue`, 'DELETE');
      return this.#send(`${this.endpoint}/${action}`, 'POST', {});
    });
    if (done && review) {
      this.commentBody = '';
      this.#markReviewed();
    }
  };

  approveChecks = async () => {
    if (!this.pull.checksApproval.waiting || !this.pull.checksApproval.canApprove) return;
    this.approvingChecks = true;
    await this.#run('Checks could not be approved.', async () => {
      await api(`${this.endpoint}/approve-checks`, {
        method: 'POST',
        body: JSON.stringify({ commitId: this.pull.sourceCommitId })
      });
      await this.#refreshState();
    });
    this.approvingChecks = false;
  };
}
