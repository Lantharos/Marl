<script lang="ts">
  import type { Snippet } from 'svelte';

  let { title, description, action }: { title: string; description?: string; action?: Snippet } = $props();
</script>

<header class="mb-7 flex flex-wrap items-start justify-between gap-x-6 gap-y-3">
  <div class="min-w-0 flex-[1_1_260px]">
    <h1 class="text-2xl font-semibold tracking-tight text-ink-strong sm:text-[28px]">{title}</h1>
    {#if description}<p class="mt-2 max-w-[60ch] text-sm leading-relaxed text-pretty text-ink-muted">
        {description}
      </p>{/if}
  </div>
  {#if action}<div class="flex shrink-0 gap-2">{@render action()}</div>{/if}
</header>
