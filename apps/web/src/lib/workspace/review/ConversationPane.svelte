<script lang="ts">
  import PullRevisions from '../canvas/PullRevisions.svelte';
  import type { ReviewSession } from './review-session.svelte';
  import ReviewComposer from './ReviewComposer.svelte';

  let {
    session,
    viewerId,
    composer = $bindable()
  }: { session: ReviewSession; viewerId: string; composer?: HTMLElement } = $props();
  const pull = $derived(session.pull);
  const context = $derived({ owner: session.pageState.route.owner, repository: session.pageState.route.repo });
</script>

<div class="flex h-full flex-col">
  <header
    class="flex h-11 shrink-0 items-center border-b border-line-subtle px-4 text-xs font-semibold text-ink-strong"
  >
    Conversation
  </header>
  <div class="min-h-0 flex-1 overflow-y-auto p-3">
    <PullRevisions
      pageState={session.pageState}
      {viewerId}
      {context}
      checksHref="/{pull.repository.owner}/{pull.repository.name}/pulls/{pull.number}/checks"
    />
  </div>
  {#if session.pageState.reviewable}<ReviewComposer {session} bind:element={composer} />{/if}
</div>
