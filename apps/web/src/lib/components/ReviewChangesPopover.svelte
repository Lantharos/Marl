<script lang="ts">
  import { onMount } from 'svelte';
  import BadgeCheck from 'lucide-svelte/icons/badge-check';
  import X from 'lucide-svelte/icons/x';
  import { dismissable } from '$lib/actions/dismissable';
  import { positionFloatingPanel } from '$lib/ui/floating';
  import { popoverMotion } from '$lib/ui/popover';
  import Button from './Button.svelte';
  import MarkdownComposer from './MarkdownComposer.svelte';
  import type { MarkdownContext } from '$lib/markdown';
  import '$lib/styles/review-actions.css';

  type ReviewState = 'commented' | 'approved' | 'changes_requested';

  let {
    open = $bindable(false),
    reviewState = $bindable<ReviewState>('commented'),
    body = $bindable(''),
    busy = false,
    onSubmit,
    context
  } = $props<{
    open?: boolean;
    reviewState?: ReviewState;
    body?: string;
    busy?: boolean;
    onSubmit: () => void | Promise<void>;
    context?: MarkdownContext;
  }>();

  const choices: { value: ReviewState; label: string }[] = [
    { value: 'commented', label: 'Comment' },
    { value: 'approved', label: 'Approve' },
    { value: 'changes_requested', label: 'Request changes' }
  ];

  let anchor: HTMLDivElement;
  let panel = $state<HTMLDivElement>();
  let uploading = $state(false);
  let frame = 0;

  function positionPanel() {
    cancelAnimationFrame(frame);
    frame = requestAnimationFrame(() => {
      if (!open || !anchor || !panel) return;

      positionFloatingPanel(anchor, panel, 430);
    });
  }

  function keydown(event: KeyboardEvent) {
    if (open && !uploading && !busy && event.key === 'Escape') open = false;
  }

  function close() { if (!uploading && !busy) open = false; }
  async function submit() { if (!uploading && !busy) await onSubmit(); }

  $effect(() => {
    if (open) positionPanel();
  });

  onMount(() => {
    const reposition = () => open && positionPanel();
    window.addEventListener('resize', reposition);
    window.addEventListener('scroll', reposition, true);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener('resize', reposition);
      window.removeEventListener('scroll', reposition, true);
    };
  });
</script>

<svelte:window onkeydown={keydown} />

<div class="review-anchor" bind:this={anchor} use:dismissable={close}>
  <Button size="small" variant="primary" aria-expanded={open} disabled={uploading || busy} onclick={() => (open = !open)}>
    <BadgeCheck size={14} />Review changes
  </Button>

  {#if open}
    <div class="review-popover" transition:popoverMotion bind:this={panel} role="dialog" aria-label="Review changes">
      <header>
        <strong>Finish your review</strong>
        <Button icon size="small" variant="ghost" aria-label="Close review" disabled={uploading || busy} onclick={close}><X size={14} /></Button>
      </header>

      <MarkdownComposer bind:value={body} bind:uploading {context} disabled={busy} placeholder="Leave a review summary (optional)" minHeight={100} />

      <div class="review-decisions" role="radiogroup" aria-label="Review outcome">
        {#each choices as choice (choice.value)}
          <Button class={`review-choice${reviewState === choice.value ? ' active' : ''}`} variant="ghost" block role="radio" aria-checked={reviewState === choice.value} onclick={() => (reviewState = choice.value)}>
            <span class="choice-mark" aria-hidden="true"></span>
            <span class="choice-copy">{choice.label}</span>
          </Button>
        {/each}
      </div>

      <footer>
        <Button size="small" disabled={uploading || busy} onclick={close}>Cancel</Button>
        <Button size="small" class="review-submit {reviewState}" variant="primary" loading={busy} disabled={uploading} onclick={submit}>Submit review</Button>
      </footer>
    </div>
  {/if}
</div>

<style>
  .review-anchor{position:relative;display:flex}
  .review-popover{position:fixed;z-index:90;display:flex;flex-direction:column;overflow-y:auto;padding:16px;border-radius:18px;background:var(--surface-raised);box-shadow:var(--shadow-popover);transform-origin:top right}
  .review-popover>header{display:flex;align-items:center;justify-content:space-between;gap:12px;margin-bottom:12px}
  .review-popover>header strong{color:var(--text-strong);font-size:14px}
  .review-decisions{display:grid;gap:4px;margin-top:12px}
  .review-decisions :global(.review-choice.button){min-height:38px;justify-content:flex-start;padding:8px 10px;text-align:left}
  .review-decisions :global(.review-choice.button.active){background:var(--surface-muted);color:var(--text-strong)}
  .choice-mark{width:14px;height:14px;flex:none;border:1px solid var(--border-strong);border-radius:50%}
  :global(.review-choice.button.active .choice-mark){border-color:var(--brand);background:var(--brand);box-shadow:inset 0 0 0 3px var(--surface-raised)}
  .choice-copy{font-size:12px}
  .review-popover>footer{display:flex;justify-content:flex-end;gap:8px;margin-top:16px}
</style>
