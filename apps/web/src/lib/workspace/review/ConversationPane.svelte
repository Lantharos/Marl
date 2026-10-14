<script lang="ts">
  import type { Discussion } from '../discussion/discussion.svelte';
  import Revisions from '../discussion/Revisions.svelte';
  import type { ReviewSession } from './review-session.svelte';
  import ReviewComposer from './ReviewComposer.svelte';

  let {
    session,
    discussion,
    composer = $bindable()
  }: { session: ReviewSession; discussion: Discussion; composer?: HTMLElement } = $props();
  const pull = $derived(session.pull);
</script>

<div class="flex h-full flex-col">
  <header
    class="flex h-11 shrink-0 items-center border-b border-line-subtle px-4 text-xs font-semibold text-ink-strong"
  >
    Conversation
  </header>
  <div class="min-h-0 flex-1 overflow-y-auto p-3">
    <Revisions
      {discussion}
      latestFirst
      onShowThread={session.showThread}
      checksHref="/{pull.repository.owner}/{pull.repository.name}/pulls/{pull.number}/checks"
    />
  </div>
  {#if session.pageState.reviewable}<ReviewComposer {session} bind:element={composer} />{/if}
</div>
