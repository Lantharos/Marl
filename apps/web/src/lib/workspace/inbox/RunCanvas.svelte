<script lang="ts">
  import type { InboxItem } from '@marl/contracts';
  import CircleX from '@lucide/svelte/icons/circle-x';
  import { buttonClass } from '#lib/components/controls/button-styles.js';
  import Time from '#lib/components/page/Time.svelte';

  let { item }: { item: InboxItem } = $props();
</script>

<article class="mx-auto w-full max-w-184 px-4 pt-6 sm:px-8">
  <h1 class="flex items-center gap-2.5 text-2xl font-semibold tracking-tight text-ink-strong">
    <CircleX size={22} class="shrink-0 text-danger" />{item.title}
  </h1>
  <p class="mt-3 text-sm text-ink-muted">
    Run {item.number} in
    <span class="font-mono text-xs text-ink">{item.repository.owner}/{item.repository.name}</span>
    failed <Time value={item.updatedAt} />
  </p>
  <a class={[buttonClass('secondary', 'medium'), 'mt-6']} href={item.href}>Open the run log</a>
</article>
