<script lang="ts">
  import type { Snippet } from 'svelte';
  import type { ClassValue } from 'svelte/elements';

  let {
    title,
    description,
    label,
    divided = true,
    class: className,
    action,
    children
  }: {
    title?: string;
    description?: string;
    label?: string;
    divided?: boolean;
    class?: ClassValue;
    action?: Snippet;
    children: Snippet;
  } = $props();
  const id = $props.id();
</script>

<section class={className} aria-labelledby={title ? `${id}-title` : undefined} aria-label={title ? undefined : label}>
  {#if title || action}
    <header class="mb-3 flex flex-wrap items-end justify-between gap-x-4 gap-y-2">
      <div class="min-w-0">
        {#if title}<h2 id="{id}-title" class="text-lg font-semibold tracking-tight text-ink-strong">{title}</h2>{/if}
        {#if description}<p class="mt-1 max-w-[64ch] text-sm text-pretty text-ink-muted">{description}</p>{/if}
      </div>
      {#if action}<div class="flex shrink-0 items-center gap-2">{@render action()}</div>{/if}
    </header>
  {/if}
  {#if divided}<div class="divide-y divide-line-subtle border-y border-line-subtle">{@render children()}</div>
  {:else}{@render children()}{/if}
</section>
