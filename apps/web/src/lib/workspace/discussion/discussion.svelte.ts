import type { PullRequestComment, ReviewThread } from '@marl/contracts';
import type { MarkdownContext } from '#lib/markdown/context.js';
import type { PullPageState } from '#lib/pulls/detail/pull-page-state.svelte.js';
import { reporting } from '#lib/reporting/reporting.svelte.js';

type ThreadComment = ReviewThread['comments'][number];
type Removal = { title: string; message: string; remove: () => Promise<unknown> };

export class Discussion {
  removal = $state<Removal | null>(null);
  removing = $state(false);
  editing = $state<string | null>(null);

  constructor(
    readonly pageState: PullPageState,
    readonly viewerId: string
  ) {}

  get pull() {
    return this.pageState.pull;
  }

  get context(): MarkdownContext {
    return { owner: this.pageState.route.owner, repository: this.pageState.route.repo };
  }

  get interactive() {
    return this.pull.canManage && !this.pull.locked;
  }

  confirmRemoval = async () => {
    if (!this.removal) return;
    this.removing = true;
    try {
      await this.removal.remove();
      this.removal = null;
    } finally {
      this.removing = false;
    }
  };

  commentActions(comment: PullRequestComment) {
    return this.#actions(comment, 'pull_comment', () => this.pageState.deletePullComment(comment.id));
  }

  threadCommentActions(comment: ThreadComment) {
    return this.#actions(comment, 'review_comment', () => this.pageState.deleteReviewComment(comment.id));
  }

  saveComment = (id: string) => async (body: string) => this.pageState.savePullComment(id, body);

  saveThreadComment = (id: string) => async (body: string) => {
    await this.pageState.saveReviewComment(id, body);
    return !this.pageState.error;
  };

  #actions(
    comment: { id: string; authorId: string; deleted: boolean; canEdit: boolean },
    type: 'pull_comment' | 'review_comment',
    remove: () => Promise<unknown>
  ) {
    if (comment.deleted) return [];
    const own = comment.authorId === this.viewerId;
    return [
      ...(own && comment.canEdit ? [{ label: 'Edit', onSelect: () => (this.editing = comment.id) }] : []),
      ...(own || this.pull.canModerate
        ? [
            {
              label: 'Delete',
              danger: true,
              onSelect: () =>
                (this.removal = {
                  title: 'Delete this message?',
                  message: 'Its text is removed for everyone. Replies and the conversation stay.',
                  remove
                })
            }
          ]
        : []),
      ...(own ? [] : [{ label: 'Report', onSelect: () => reporting.open({ type, id: comment.id, label: 'comment' }) }])
    ];
  }
}
