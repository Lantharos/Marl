<script lang="ts">
  import type { Snippet } from 'svelte';
  import BrandMark from '../identity/BrandMark.svelte';

  let {
    title,
    description,
    children,
    footer
  }: { title: string; description: string; children: Snippet; footer?: Snippet } = $props();
</script>

<main class="grid min-h-dvh place-items-center bg-canvas px-4 py-7 sm:px-5 sm:py-12">
  <section class="w-full max-w-105 surface rounded-2xl px-5 py-6 sm:p-7">
    <a class="mb-8 inline-flex" href="/" aria-label="Marl"><BrandMark /></a>
    <header class="mb-7">
      <h1 class="text-[28px] leading-tight font-semibold tracking-tight text-ink-strong">{title}</h1>
      <p class="mt-2.5 text-sm leading-relaxed text-ink-muted">{description}</p>
    </header>
    {@render children()}
    {#if footer}<footer class="mt-6 text-center text-sm text-ink-muted">{@render footer()}</footer>{/if}
  </section>
</main>
