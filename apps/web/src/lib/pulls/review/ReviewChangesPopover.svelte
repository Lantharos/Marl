<script lang="ts">
  import BadgeCheck from '@lucide/svelte/icons/badge-check';
  import X from '@lucide/svelte/icons/x';
  import { dismissable } from '#lib/actions/dismissable.js';
  import Button from '../../components/controls/Button.svelte';
  import MarkdownComposer from '../../components/markdown/MarkdownComposer.svelte';
  import Popover from '../../components/overlays/Popover.svelte';
  import type { MarkdownContext } from '#lib/markdown/context.js';

  type ReviewState = 'commented' | 'approved' | 'changes_requested';

  let {
    open = $bindable(false),
    reviewState = $bindable<ReviewState>('commented'),
    body = $bindable(''),
    busy = false,
    onSubmit,
    context
  }: {
    open?: boolean;
    reviewState?: ReviewState;
    body?: string;
    busy?: boolean;
    onSubmit: () => void | Promise<void>;
    context?: MarkdownContext;
  } = $props();

  const choices: { value: ReviewState; label: string }[] = [
    { value: 'commented', label: 'Comment' },
    { value: 'approved', label: 'Approve' },
    { value: 'changes_requested', label: 'Request changes' }
  ];

  const toneVariant = { commented: 'primary', approved: 'success-soft', changes_requested: 'warning-soft' } as const;
  let panel = $state<HTMLElement>();
  let uploading = $state(false);

  function close() {
    if (!uploading && !busy) open = false;
  }

  function keydown(event: KeyboardEvent) {
    if (!open || event.key !== 'Escape') return;
    const owner = (event.target as Element).closest('[popover]');
    if (!owner || owner.contains(panel ?? null)) close();
  }

  async function submit() {
    if (!uploading && !busy) await onSubmit();
  }
</script>

<svelte:window onkeydown={keydown} />

<div class="flex" use:dismissable={close}>
  <Popover
    bind:open
    dismiss="manual"
    class="w-[min(440px,calc(100vw-24px))] rounded-2xl p-4"
    role="dialog"
    aria-label="Review changes"
    {@attach (node) => {
      panel = node;
    }}
  >
    {#snippet trigger(popover)}
      <Button size="small" variant="primary" disabled={uploading || busy} {...popover}>
        <BadgeCheck size={15} />Review changes
      </Button>
    {/snippet}
    <header class="mb-3 flex items-center justify-between gap-3">
      <strong class="text-base font-semibold text-ink-strong">Finish your review</strong>
      <Button icon size="small" variant="ghost" aria-label="Close review" disabled={uploading || busy} onclick={close}
        ><X size={15} /></Button
      >
    </header>

    <MarkdownComposer
      bind:value={body}
      bind:uploading
      {context}
      disabled={busy}
      placeholder="Leave a review summary (optional)"
      minHeight={100}
      onsubmit={submit}
    />

    <div class="mt-3 grid gap-1" role="radiogroup" aria-label="Review outcome">
      {#each choices as choice (choice.value)}
        {@const checked = reviewState === choice.value}
        <button
          type="button"
          role="radio"
          aria-checked={checked}
          onclick={() => (reviewState = choice.value)}
          class={[
            'flex min-h-10 items-center gap-2.5 rounded-lg px-2.5 text-left text-sm transition-colors',
            checked ? 'bg-surface-muted text-ink-strong' : 'text-ink-muted hover:bg-surface-hover hover:text-ink-strong'
          ]}
        >
          <span
            class={[
              'size-3.5 shrink-0 rounded-full border',
              checked
                ? 'border-brand bg-brand shadow-[inset_0_0_0_3px_var(--color-surface-raised)]'
                : 'border-line-strong'
            ]}
            aria-hidden="true"
          ></span>{choice.label}
        </button>
      {/each}
    </div>

    <footer class="mt-4 flex justify-end gap-2">
      <Button size="small" disabled={uploading || busy} onclick={close}>Cancel</Button>
      <Button size="small" variant={toneVariant[reviewState]} loading={busy} disabled={uploading} onclick={submit}
        >Submit review</Button
      >
    </footer>
  </Popover>
</div>
