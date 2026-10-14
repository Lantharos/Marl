<script lang="ts">
  import Button from '#lib/components/controls/Button.svelte';
  import Notice from '#lib/components/feedback/Notice.svelte';
  import MarkdownComposer from '#lib/components/markdown/MarkdownComposer.svelte';
  import type { ReviewOutcome, ReviewSession } from './review-session.svelte';

  let { session, element = $bindable() }: { session: ReviewSession; element?: HTMLElement } = $props();
  const context = $derived({ owner: session.pageState.route.owner, repository: session.pageState.route.repo });
  let uploading = $state(false);
  const placeholders = {
    commented: 'Summarize your review',
    approved: 'Approve with a note (optional)',
    changes_requested: 'Say what needs to change (optional)'
  };

  function submit(outcome: ReviewOutcome) {
    session.outcome = outcome;
    void session.submit();
  }
</script>

<section bind:this={element} class="shrink-0 bg-canvas p-3" aria-label="Finish your review">
  {#if session.submitError}<Notice class="mb-2" ondismiss={() => (session.submitError = '')}
      >{session.submitError}</Notice
    >{/if}
  <MarkdownComposer
    bind:value={session.body}
    bind:uploading
    variant="inline"
    {context}
    disabled={session.submitting}
    placeholder={placeholders[session.outcome]}
    minHeight="64px"
    onsubmit={() => void session.submit()}
  >
    {#snippet actions()}
      <Button
        size="small"
        variant={session.outcome === 'changes_requested' ? 'warning-soft' : 'ghost'}
        disabled={session.submitting || uploading}
        loading={session.submitting && session.outcome === 'changes_requested'}
        onclick={() => submit('changes_requested')}>Request changes</Button
      >
      <Button
        size="small"
        variant={session.outcome === 'approved' ? 'success-soft' : 'ghost'}
        disabled={session.submitting || uploading}
        loading={session.submitting && session.outcome === 'approved'}
        onclick={() => submit('approved')}>Approve</Button
      >
      <Button
        size="small"
        variant="primary"
        disabled={session.submitting || uploading || !session.body.trim()}
        loading={session.submitting && session.outcome === 'commented'}
        onclick={() => submit('commented')}>Comment</Button
      >
    {/snippet}
  </MarkdownComposer>
</section>
