<script lang="ts">
  import type { Snippet } from 'svelte';
  import type { PullRevisionSummary, ReviewThread } from '@marl/contracts';
  import PullRevision from '#lib/pulls/overview/PullRevision.svelte';
  import { revisionParticipation } from '#lib/pulls/overview/revision-activity.js';
  import Activity from './Activity.svelte';
  import type { Discussion } from './discussion.svelte';

  let {
    discussion,
    checksHref,
    latestFirst = false,
    onShowThread,
    composer
  }: {
    discussion: Discussion;
    checksHref: string;
    latestFirst?: boolean;
    onShowThread?: (thread: ReviewThread) => void;
    composer?: Snippet;
  } = $props();
  const pageState = $derived(discussion.pageState);
  const timeline = $derived(pageState.timeline);
  const pull = $derived(pageState.pull);
  const repository = $derived(pull.sourceRepository ?? { owner: pageState.route.owner, name: pageState.route.repo });
  const ordered = $derived(latestFirst ? timeline.revisions.toReversed() : timeline.revisions);

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
      <div class="grid gap-6 px-2 pt-2 pb-3 sm:px-3">
        <Activity
          {discussion}
          items={revision.current ? timeline.currentItems : timeline.revisionItems(revision.sequence)}
          {onShowThread}
        />
        {#if revision.current}{@render composer?.()}{/if}
      </div>
    </PullRevision>
  {:else}
    <Activity {discussion} items={timeline.currentItems} {onShowThread} />
    {@render composer?.()}
  {/each}
</div>
