<script lang="ts">
  import BadgeCheck from '@lucide/svelte/icons/badge-check';
  import MessageSquare from '@lucide/svelte/icons/message-square';
  import ShieldAlert from '@lucide/svelte/icons/shield-alert';
  import Button from '#lib/components/controls/Button.svelte';
  import SegmentedControl from '#lib/components/controls/SegmentedControl.svelte';
  import Notice from '#lib/components/feedback/Notice.svelte';
  import MarkdownComposer from '#lib/components/markdown/MarkdownComposer.svelte';
  import Kbd from '#lib/components/page/Kbd.svelte';
  import type { ReviewSession } from './review-session.svelte';

  let { session, element = $bindable() }: { session: ReviewSession; element?: HTMLElement } = $props();
  const outcomes = [
    { value: 'commented', label: 'Comment', icon: MessageSquare },
    { value: 'approved', label: 'Approve', icon: BadgeCheck },
    { value: 'changes_requested', label: 'Request changes', icon: ShieldAlert }
  ] as const;
  const variants = { commented: 'primary', approved: 'success-soft', changes_requested: 'warning-soft' } as const;
  const context = $derived({ owner: session.pageState.route.owner, repository: session.pageState.route.repo });
  let uploading = $state(false);
  const ready = $derived(!uploading && (session.outcome !== 'commented' || Boolean(session.body.trim())));
</script>

<section bind:this={element} class="shrink-0 border-t border-line-subtle bg-canvas p-3" aria-label="Finish your review">
  {#if session.submitError}<Notice class="mb-2" ondismiss={() => (session.submitError = '')}
      >{session.submitError}</Notice
    >{/if}
  <SegmentedControl label="Review outcome" options={outcomes} bind:value={session.outcome} class="mb-2" />
  <MarkdownComposer
    bind:value={session.body}
    bind:uploading
    {context}
    compact
    disabled={session.submitting}
    placeholder={session.outcome === 'commented' ? 'Summarize your review' : 'Add a note (optional)'}
    minHeight={64}
    onsubmit={() => void session.submit()}
  />
  <footer class="mt-2 flex items-center justify-end gap-2">
    <span class="flex items-center gap-1 text-xs text-ink-faint max-sm:hidden"><Kbd>Ctrl</Kbd><Kbd>Enter</Kbd></span>
    <Button
      size="small"
      variant={variants[session.outcome]}
      loading={session.submitting}
      disabled={!ready}
      onclick={() => session.submit()}>Submit review</Button
    >
  </footer>
</section>
