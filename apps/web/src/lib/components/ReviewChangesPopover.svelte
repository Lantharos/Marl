<script lang="ts">
  import { onMount } from 'svelte';
  import BadgeCheck from 'lucide-svelte/icons/badge-check';
  import X from 'lucide-svelte/icons/x';
  import { dismissable } from '$lib/actions/dismissable';
  import { positionFloatingPanel } from '$lib/ui/floating';
  import Button from './Button.svelte';
  import MarkdownComposer from './MarkdownComposer.svelte';
  import type { MarkdownContext } from '$lib/markdown';

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

  const choices: { value: ReviewState; label: string; detail: string }[] = [
    { value: 'commented', label: 'Comment', detail: 'Leave feedback without approving.' },
    { value: 'approved', label: 'Approve', detail: 'Approve the current changes.' },
    { value: 'changes_requested', label: 'Request changes', detail: 'Block merging until concerns are addressed.' }
  ];

  let anchor: HTMLDivElement;
  let panel = $state<HTMLDivElement>();
  let frame = 0;

  function positionPanel() {
    cancelAnimationFrame(frame);
    frame = requestAnimationFrame(() => {
      if (!open || !anchor || !panel) return;

      positionFloatingPanel(anchor, panel, 430);
    });
  }

  function keydown(event: KeyboardEvent) {
    if (open && event.key === 'Escape') open = false;
  }

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

<div class="review-anchor" bind:this={anchor} use:dismissable={() => (open = false)}>
  <Button size="small" variant="primary" aria-expanded={open} onclick={() => (open = !open)}>
    <BadgeCheck size={14} />Review changes
  </Button>

  {#if open}
    <div class="review-popover" bind:this={panel} role="dialog" aria-label="Review changes">
      <header>
        <div><strong>Finish your review</strong><span>Share a summary and choose an outcome.</span></div>
        <Button icon size="small" variant="ghost" aria-label="Close review" onclick={() => (open = false)}><X size={14} /></Button>
      </header>

      <MarkdownComposer bind:value={body} {context} placeholder="Leave a review summary (optional)" minHeight={100} />

      <div class="review-decisions" role="radiogroup" aria-label="Review outcome">
        {#each choices as choice (choice.value)}
          <Button class={`review-choice${reviewState === choice.value ? ' active' : ''}`} variant="ghost" block role="radio" aria-checked={reviewState === choice.value} onclick={() => (reviewState = choice.value)}>
            <span class="choice-mark" aria-hidden="true"></span>
            <span class="choice-copy"><strong>{choice.label}</strong><small>{choice.detail}</small></span>
          </Button>
        {/each}
      </div>

      <footer>
        <Button size="small" onclick={() => (open = false)}>Cancel</Button>
        <Button size="small" variant="primary" loading={busy} onclick={onSubmit}>Submit review</Button>
      </footer>
    </div>
  {/if}
</div>

<style>
  .review-anchor{position:relative;display:flex}.review-popover{position:fixed;z-index:90;display:flex;flex-direction:column;overflow-y:auto;padding:14px;border:1px solid var(--border-strong);border-radius:10px;background:var(--surface-raised);box-shadow:0 18px 54px rgb(0 0 0/.38)}.review-popover>header{display:flex;align-items:flex-start;justify-content:space-between;gap:12px;margin-bottom:13px}.review-popover>header strong,.review-popover>header span{display:block}.review-popover>header strong{color:var(--text-strong);font-size:13px}.review-popover>header span{margin-top:3px;color:var(--text-faint);font-size:11px}.review-decisions{display:grid;gap:4px;margin-top:10px}.review-decisions :global(.review-choice.button){height:auto;min-height:48px;justify-content:flex-start;padding:8px 9px;text-align:left;white-space:normal}.review-decisions :global(.review-choice.button.active){background:var(--surface-muted);color:var(--text-strong)}.choice-mark{width:14px;height:14px;flex:0 0 auto;border:1px solid var(--border-strong);border-radius:50%;box-shadow:inset 0 0 0 3px transparent}:global(.review-choice.button.active .choice-mark){border-color:var(--brand);background:var(--brand);box-shadow:inset 0 0 0 3px var(--surface-raised)}.choice-copy strong,.choice-copy small{display:block}.choice-copy strong{font-size:11px}.choice-copy small{margin-top:3px;color:var(--text-faint);font-size:11px;line-height:1.4}.review-popover>footer{display:flex;justify-content:flex-end;gap:7px;margin:13px -14px -14px;padding:11px 14px;border-top:1px solid var(--border-subtle);border-radius:0 0 9px 9px;background:var(--surface-muted)}
</style>
