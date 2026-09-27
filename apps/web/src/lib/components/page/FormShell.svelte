<script lang="ts">
  import type { Snippet } from 'svelte';
  import BackLink from './BackLink.svelte';

  let {
    title,
    description,
    backHref = '/',
    backLabel = 'Marl',
    children
  }: {
    title: string;
    description?: string;
    backHref?: string;
    backLabel?: string;
    children: Snippet;
  } = $props();
</script>

<main class="mx-auto w-full max-w-180 px-4 pt-8 pb-20 sm:px-6 sm:pt-10">
  <header class="mb-7">
    <BackLink href={backHref} label={backLabel} />
    <h1 class="mt-4 text-3xl font-semibold tracking-tight text-ink-strong">{title}</h1>
    {#if description}<p class="mt-2.5 max-w-[58ch] text-sm leading-relaxed text-ink-muted">{description}</p>{/if}
  </header>
  <section class="surface p-5 sm:p-6">{@render children()}</section>
</main>
