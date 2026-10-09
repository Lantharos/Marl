<script lang="ts">
  import SegmentedControl from '#lib/components/controls/SegmentedControl.svelte';
  import Spinner from '#lib/components/feedback/Spinner.svelte';
  import type { MarkdownContext } from '#lib/markdown/context.js';
  import ReviewChangesPopover from '../review/ReviewChangesPopover.svelte';
  import type { PullPageState } from './pull-page-state.svelte';

  let { pageState, viewerId, context }: { pageState: PullPageState; viewerId?: string; context: MarkdownContext } =
    $props();
  const pull = $derived(pageState.pull);
  const viewer = import('#lib/code/DiffViewer.svelte');
  const revision = $derived(pageState.timeline.revisions.find((item) => item.current));
  const scopes = [
    { value: 'all', label: 'All changes' },
    { value: 'since', label: 'Since your review' }
  ] as const;
</script>

<section class="grid scroll-mt-20 gap-3" aria-label="Changes">
  <header class="flex flex-wrap items-center gap-x-4 gap-y-3 rounded-2xl bg-surface-muted/60 px-4 py-3">
    <div class="min-w-0 flex-1">
      <h2 class="flex items-baseline gap-2 text-sm">
        <strong class="font-semibold text-ink-strong">{revision ? `Revision ${revision.number}` : 'Changes'}</strong>
        <code class="font-mono text-xs text-ink-faint">{pull.sourceCommitId.slice(0, 7)}</code>
      </h2>
      <p class="mt-0.5 truncate text-xs text-ink-muted">
        {#if pageState.diffScope === 'since'}Only what changed after you reviewed <code class="font-mono"
            >{pull.viewerLastReview?.commitId.slice(0, 7)}</code
          >{:else if pageState.sinceCommit}New commits arrived after your last review{:else}<code class="font-mono"
            >{pull.targetBranch}</code
          >
          ← <code class="font-mono">{pull.sourceBranch}</code>{/if}
      </p>
    </div>
    {#if pageState.sinceCommit}<SegmentedControl
        label="Changes to show"
        options={scopes}
        value={pageState.diffScope}
        onchange={pageState.setDiffScope}
      />{/if}
    {#if pageState.reviewable}<ReviewChangesPopover
        bind:open={pageState.reviewOpen}
        bind:reviewState={pageState.reviewState}
        bind:body={pageState.reviewBody}
        {context}
        busy={pageState.busy}
        onSubmit={pageState.submitReview}
      />{/if}
  </header>
  {#await viewer}
    <span class="flex items-center gap-2 py-10 text-sm text-ink-muted"><Spinner />Loading changes</span>
  {:then { default: DiffViewer }}
    {#if pageState.diffLoading}<span class="flex items-center gap-2 py-10 text-sm text-ink-muted"
        ><Spinner />Loading changes</span
      >{:else if pageState.diff}<DiffViewer
        canResolve={pull.canModerate}
        canModerate={pull.canModerate}
        {viewerId}
        files={pageState.diff.files}
        comparison={{
          old: { owner: pageState.route.owner, repository: pageState.route.repo, revision: pageState.diff.mergeBase },
          new: {
            owner: pull.sourceRepository?.owner ?? pageState.route.owner,
            repository: pull.sourceRepository?.name ?? pageState.route.repo,
            revision: pageState.diff.head
          }
        }}
        threads={pageState.changeThreads}
        {context}
        busy={pageState.busy}
        reviewable={pageState.reviewable}
        onLoadPatch={(file) =>
          pageState.loadPatch(
            file.path,
            pull.sourceCommitId,
            pageState.diffScope === 'since' ? pageState.sinceCommit : null
          )}
        onCreate={pageState.createLineComment}
        onReply={pageState.reply}
        onResolve={pageState.setThreadResolved}
        onEdit={pageState.saveReviewComment}
        onDelete={pageState.deleteReviewComment}
      />{/if}
  {/await}
</section>
