<script lang="ts">
  import type { Snippet } from 'svelte';
  import type { PullRevisionSummary } from '@marl/contracts';
  import type { MarkdownContext } from '#lib/markdown/context.js';
  import type { PullPageState } from '#lib/pulls/detail/pull-page-state.svelte.js';
  import PullRevision from '#lib/pulls/overview/PullRevision.svelte';
  import { revisionParticipation } from '#lib/pulls/overview/revision-activity.js';
  import PullActivity from './PullActivity.svelte';

  let {
    pageState,
    viewerId,
    context,
    checksHref,
    chronological = false,
    composer
  }: {
    pageState: PullPageState;
    viewerId: string;
    context: MarkdownContext;
    checksHref: string;
    chronological?: boolean;
    composer?: Snippet;
  } = $props();
  const pull = $derived(pageState.pull);
  const timeline = $derived(pageState.timeline);
  const repository = $derived(pull.sourceRepository ?? { owner: pageState.route.owner, name: pageState.route.repo });
  const ordered = $derived(chronological ? timeline.revisions : timeline.revisions.toReversed());

  function participation(revision: PullRevisionSummary) {
    if (revision.current) return revisionParticipation(timeline.currentItems);
    return timeline.revisionLoaded(revision.sequence)
      ? revisionParticipation(timeline.revisionItems(revision.sequence))
      : revision;
  }
</script>

<div class="grid gap-3">
  {#each ordered as revision (revision.sequence)}
    {@const { reviewers, unresolvedCount } = participation(revision)}
    <PullRevision
      {revision}
      {reviewers}
      {unresolvedCount}
      {repository}
      checks={revision.current ? { summary: pull.checkSummary, href: checksHref } : undefined}
      expanded={pageState.expandedRevisions.includes(revision.sequence)}
      loading={pageState.loadingRevisions.includes(revision.sequence)}
      onToggle={() => pageState.toggleRevision(revision)}
    >
      {#if revision.current && !chronological}{@render composer?.()}{/if}
      <PullActivity
        {pageState}
        items={revision.current ? timeline.currentItems : timeline.revisionItems(revision.sequence)}
        {viewerId}
        {context}
        {chronological}
      />
      {#if revision.current && chronological}{@render composer?.()}{/if}
    </PullRevision>
  {:else}
    <PullActivity {pageState} items={timeline.currentItems} {viewerId} {context} {chronological} />
    {@render composer?.()}
  {/each}
</div>
