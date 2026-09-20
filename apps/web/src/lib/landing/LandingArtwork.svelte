<script lang="ts">
  import { onMount } from 'svelte';
  import { readTheme, type Theme } from '$lib/theme';

  let { scene, sizes, eager = false } = $props<{
    scene: 'landscape' | 'courtyard' | 'inlay';
    sizes: string;
    eager?: boolean;
  }>();

  let theme = $state<Theme | null>(null);
  onMount(() => { theme = readTheme(); });
</script>

<div class="artwork" data-theme={theme} aria-hidden="true">
  {#if theme}
    <img
      src={`/landing/${scene}-${theme}.webp`}
      srcset={`/landing/${scene}-${theme}-small.webp 960w, /landing/${scene}-${theme}.webp 1536w`}
      {sizes}
      width="1536"
      height={scene === 'landscape' ? 768 : 1024}
      alt=""
      loading={eager ? 'eager' : 'lazy'}
      decoding="async"
      fetchpriority={eager ? 'high' : 'low'}
    />
  {/if}
</div>

<style>
  .artwork{width:100%;aspect-ratio:3/2;isolation:isolate;background:var(--canvas);pointer-events:none;user-select:none}
  img{display:block;width:100%;height:auto;mix-blend-mode:lighten}
  .artwork[data-theme='light'] img{mix-blend-mode:multiply;filter:brightness(1.05)}
</style>
