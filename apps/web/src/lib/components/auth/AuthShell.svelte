<script lang="ts">
  import type { Snippet } from 'svelte';
  import BrandMark from '../identity/BrandMark.svelte';
  import Scene from '../page/Scene.svelte';

  let {
    title,
    description,
    children,
    footer
  }: { title: string; description?: string; children: Snippet; footer?: Snippet } = $props();
</script>

<main id="main-content" tabindex="-1" class="grid min-h-dvh grid-rows-[minmax(0,1fr)_auto] bg-canvas outline-none">
  <div class="flex flex-col items-center px-4 pt-5 pb-8 sm:px-6">
    <a class="flex min-h-11 items-center self-start sm:self-center" href="/" aria-label="Marl home"><BrandMark /></a>
    <section class="my-auto w-full max-w-96 pt-8">
      <header class="mb-7">
        <h1 class="text-3xl leading-tight font-semibold tracking-tight text-balance text-ink-strong">{title}</h1>
        {#if description}<p class="mt-2.5 text-sm leading-relaxed text-pretty text-ink-muted">{description}</p>{/if}
      </header>
      {@render children()}
      {#if footer}<footer class="mt-6 text-center text-sm text-ink-muted">{@render footer()}</footer>{/if}
    </section>
  </div>
  <Scene scene="access" class="h-[min(200px,26dvh)] sm:h-[min(26vw,34dvh,400px)] sm:bg-[position:center_35%]" />
</main>
