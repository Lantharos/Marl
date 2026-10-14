import type { PullRealtimeUpdate, PullRequestDiff, PullRevisionSummary, ReviewThread } from '@marl/contracts';
import { SvelteMap } from 'svelte/reactivity';
import { api, MarlApiError } from '#lib/api.js';
import { comparisonTokens, type CodeComparison, type ComparisonTokens } from '#lib/code/comparison.js';
import { parsePatchLines, type PatchLine } from '#lib/code/diff.js';
import type { PullEntry } from '../store/pull-entry.svelte';
import { buildTree, fileOrder, type ChangedFile } from './file-tree';
import { readViewed, writeViewed } from './viewed';

export type ReviewOutcome = 'commented' | 'approved' | 'changes_requested';
type FilePatch = { lines: PatchLine[] } | { error: string } | { loading: true };

const sessions = new WeakMap<PullEntry, ReviewSession>();

export function reviewSession(entry: PullEntry) {
  let session = sessions.get(entry);
  if (!session) {
    session = new ReviewSession(entry);
    sessions.set(entry, session);
  }
  return session;
}

function failure(cause: unknown, fallback: string) {
  return cause instanceof MarlApiError ? cause.message : fallback;
}

export class ReviewSession {
  readonly entry: PullEntry;
  base = $state(0);
  head = $state<number | 'current'>('current');
  diff = $state.raw<PullRequestDiff | null>(null);
  error = $state('');
  selectedPath = $state<string | null>(null);
  outcome = $state<ReviewOutcome>('commented');
  body = $state('');
  submitting = $state(false);
  submitError = $state('');
  #loadedKey = $state('');
  #viewedVersion = $state(0);
  #patches = new SvelteMap<string, FilePatch>();
  #tokens = new SvelteMap<string, ComparisonTokens>();
  #highlighting = new Set<string>();

  readonly pull = $derived(this.pageState.pull);
  readonly revisions = $derived(this.pageState.timeline.revisions);
  readonly headRevision = $derived(
    (this.head === 'current' ? undefined : this.revisions.find((revision) => revision.number === this.head)) ??
      this.revisions.at(-1)
  );
  readonly baseRevision = $derived(
    this.base ? this.revisions.find((revision) => revision.number === this.base) : undefined
  );
  readonly headCommit = $derived(
    this.headRevision?.current === false ? this.headRevision.commitId : this.pull.sourceCommitId
  );
  readonly baseCommit = $derived(this.baseRevision?.commitId ?? null);
  readonly currentHead = $derived(this.headRevision?.current !== false);
  readonly key = $derived(`${this.baseCommit ?? 'target'}..${this.headCommit}`);
  readonly loading = $derived(this.#loadedKey !== this.key && !this.error);
  readonly lastReviewed = $derived.by(() => {
    const reviewed = this.pull.viewerLastReview?.commitId;
    return this.revisions.find((revision) => revision.commitId === reviewed && !revision.current);
  });
  readonly files = $derived(this.#loadedKey === this.key ? (this.diff?.files ?? []) : []);
  readonly tree = $derived(buildTree(this.files));
  readonly order = $derived(fileOrder(this.tree));
  readonly selectedFile = $derived(
    this.files.find((file) => file.path === this.selectedPath) ??
      this.files.find((file) => file.path === this.order[0]) ??
      null
  );
  readonly viewed = $derived.by(() => {
    void this.#viewedVersion;
    return readViewed(this.pull.id, this.headCommit);
  });
  readonly comparison = $derived<CodeComparison>({
    old: {
      owner: this.pageState.route.owner,
      repository: this.pageState.route.repo,
      revision: this.baseCommit ?? this.diff?.mergeBase ?? this.pull.targetCommitId
    },
    new: {
      owner: this.pull.sourceRepository?.owner ?? this.pageState.route.owner,
      repository: this.pull.sourceRepository?.name ?? this.pageState.route.repo,
      revision: this.headCommit
    }
  });
  readonly canComment = $derived(this.currentHead && this.pageState.reviewable);
  readonly threads = $derived.by(() => {
    const threads = new Map((this.diff?.threads ?? []).map((thread) => [thread.id, thread]));
    for (const item of this.pageState.timeline.items.values())
      if (item.kind === 'thread') threads.set(item.value.id, item.value);
    const index = new Map<string, ReviewThread[]>();
    for (const thread of threads.values()) {
      const visible = this.currentHead ? !thread.outdated : thread.commitId === this.headCommit;
      if (!visible || (this.base && thread.side === 'old')) continue;
      const key = `${thread.path}:${thread.side}:${thread.line}`;
      index.set(key, [...(index.get(key) ?? []), thread]);
    }
    return index;
  });

  constructor(entry: PullEntry) {
    this.entry = entry;
  }

  get pageState() {
    return this.entry.state!;
  }

  compare = (base: number, head: number | 'current') => {
    this.base = base;
    this.head = head;
    this.error = '';
  };

  loadDiff = async () => {
    const key = this.key;
    if (this.#loadedKey === key) return;
    this.error = '';
    const query = new URLSearchParams();
    if (!this.currentHead) query.set('revision', this.headCommit);
    if (this.baseCommit) query.set('since', this.baseCommit);
    try {
      const diff = await api<PullRequestDiff>(`${this.entry.endpoint}/diff${query.size ? `?${query}` : ''}`);
      if (key !== this.key) return;
      this.diff = diff;
      this.#loadedKey = key;
    } catch (cause) {
      if (key === this.key) this.error = failure(cause, 'These changes could not be loaded.');
    }
  };

  patch(file: ChangedFile): FilePatch | undefined {
    if (!file.patchOmitted && file.patch) return { lines: parsePatchLines(file.patch) };
    return this.#patches.get(`${this.key}:${file.path}`);
  }

  loadPatch = async (file: ChangedFile) => {
    const key = `${this.key}:${file.path}`;
    if ((!file.patchOmitted && file.patch) || this.#patches.has(key)) return;
    this.#patches.set(key, { loading: true });
    try {
      const patch = await this.pageState.loadPatch(file.path, this.headCommit, this.baseCommit);
      this.#patches.set(key, { lines: parsePatchLines(patch) });
    } catch (cause) {
      this.#patches.set(key, { error: failure(cause, 'This file could not be loaded.') });
    }
  };

  retryPatch = (file: ChangedFile) => {
    this.#patches.delete(`${this.key}:${file.path}`);
    void this.loadPatch(file);
  };

  tokens(file: ChangedFile) {
    return this.#tokens.get(`${this.key}:${file.path}`);
  }

  highlight = async (file: ChangedFile) => {
    const key = `${this.key}:${file.path}`;
    if (this.#tokens.has(key) || this.#highlighting.has(key)) return;
    this.#highlighting.add(key);
    const comparison = file.status === 'added' ? { new: this.comparison.new } : this.comparison;
    const tokens = await comparisonTokens(
      comparison,
      file.path,
      file.oldPath ?? file.path,
      AbortSignal.timeout(30_000)
    );
    this.#highlighting.delete(key);
    this.#tokens.set(key, tokens);
  };

  select = (path: string) => {
    this.selectedPath = path;
  };

  stepFile = (direction: 1 | -1) => {
    const index = this.order.indexOf(this.selectedFile?.path ?? '');
    const next = this.order[index + direction];
    if (next) this.selectedPath = next;
  };

  toggleViewed = (path: string) => {
    const viewed = new Set(this.viewed);
    if (viewed.has(path)) viewed.delete(path);
    else viewed.add(path);
    writeViewed(this.pull.id, this.headCommit, viewed);
    this.#viewedVersion += 1;
  };

  isViewed(path: string) {
    return this.viewed.has(path);
  }

  label(revision: PullRevisionSummary | undefined) {
    return revision ? `R${revision.number}` : this.pull.targetBranch;
  }

  submit = async () => {
    if (this.submitting || (this.outcome === 'commented' && !this.body.trim())) return false;
    this.submitting = true;
    this.submitError = '';
    try {
      const result = await api<{ update?: PullRealtimeUpdate }>(`${this.entry.endpoint}/reviews`, {
        method: 'POST',
        body: JSON.stringify({ state: this.outcome, body: this.body, commitId: this.pull.sourceCommitId })
      });
      this.pageState.applyUpdate(result.update);
      this.pageState.pull = {
        ...this.pageState.pull,
        viewerLastReview: { commitId: this.pull.sourceCommitId, createdAt: new Date().toISOString() }
      };
      this.body = '';
      this.outcome = 'commented';
      return true;
    } catch (cause) {
      this.submitError = failure(cause, 'Your review could not be submitted.');
      return false;
    } finally {
      this.submitting = false;
    }
  };
}
