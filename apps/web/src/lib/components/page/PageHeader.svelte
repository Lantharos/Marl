<script lang="ts">
  import type { Snippet } from 'svelte';
  import LinkButton from '../controls/LinkButton.svelte';

  let {
    title,
    description,
    actionHref,
    actionLabel,
    action
  }: { title: string; description?: string; actionHref?: string; actionLabel?: string; action?: Snippet } = $props();
</script>

<header class="mb-7 flex flex-wrap items-end justify-between gap-x-6 gap-y-4">
  <div class="min-w-0 flex-[1_1_220px]">
    <h1 class="text-2xl font-semibold tracking-tight text-ink-strong sm:text-3xl">{title}</h1>
    {#if description}<p class="mt-2 max-w-[62ch] text-sm text-pretty text-ink-muted">{description}</p>{/if}
  </div>
  {#if action}{@render action()}{:else if actionHref && actionLabel}<LinkButton href={actionHref} variant="primary"
      >{actionLabel}</LinkButton
    >{/if}
</header>
