<script lang="ts">
  import type { Snippet } from 'svelte';
  import Page from './Page.svelte';

  let {
    title,
    description,
    children
  }: {
    title: string;
    description?: string;
    children: Snippet;
  } = $props();
</script>

<Page width="narrow">
  <header class="mb-7">
    <h1 class="text-3xl font-semibold tracking-tight text-ink-strong">{title}</h1>
    {#if description}<p class="mt-2.5 max-w-[58ch] text-sm leading-relaxed text-ink-muted">{description}</p>{/if}
  </header>
  <section class="surface p-5 sm:p-6">{@render children()}</section>
</Page>
