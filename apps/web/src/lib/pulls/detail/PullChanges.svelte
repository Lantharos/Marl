<script lang="ts">
  import Spinner from '$lib/components/feedback/Spinner.svelte';
  import type { MarkdownContext } from '$lib/markdown/context';
  import ReviewChangesPopover from '../review/ReviewChangesPopover.svelte';
  import type { PullPageState } from './pull-page-state.svelte';

  let { pageState, viewerId, context }: { pageState: PullPageState; viewerId?: string; context: MarkdownContext } =
    $props();
  const pull = $derived(pageState.pull);
  const viewer = import('$lib/code/DiffViewer.svelte');
</script>

<section class="grid scroll-mt-20 gap-3" aria-label="Changes">
  <header class="flex flex-wrap items-center justify-between gap-3">
    <p class="text-sm text-ink-muted">
      Reviewing <code class="font-mono text-xs text-ink">{pull.sourceCommitId.slice(0, 7)}</code> from
      <span class="font-medium text-ink">{pull.sourceBranch}</span> into
      <span class="font-medium text-ink">{pull.targetBranch}</span>
    </p>
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
        onLoadPatch={(file) => pageState.loadPatch(file.path)}
        onCreate={pageState.createLineComment}
        onReply={pageState.reply}
        onResolve={pageState.setThreadResolved}
        onEdit={pageState.saveReviewComment}
        onDelete={pageState.deleteReviewComment}
      />{/if}
  {/await}
</section>
