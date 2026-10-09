<script lang="ts">
  import type { ClassValue } from 'svelte/elements';

  type Scene = 'landscape' | 'courtyard' | 'inlay';
  type Theme = 'light' | 'dark';

  let {
    scene,
    sizes,
    priority = false,
    class: className
  }: { scene: Scene; sizes: string; priority?: boolean; class: ClassValue } = $props();

  const heights: Record<Scene, number> = { landscape: 768, courtyard: 1024, inlay: 1024 };
  const themes: Theme[] = ['light', 'dark'];
  const blend = { light: 'mix-blend-darken dark:hidden', dark: 'mix-blend-lighten light:hidden' };
  const source = (theme: Theme) => `/landing/${scene}/${theme}.webp`;
  const sources = (theme: Theme) => `/landing/${scene}/${theme}-small.webp 960w, ${source(theme)} 1536w`;
</script>

{#if priority}
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset={sources('dark')} {sizes} />
    <img
      class={[
        'pointer-events-none mix-blend-darken select-none dark:mix-blend-lighten [:root[data-theme]_&]:hidden',
        className
      ]}
      src={source('light')}
      srcset={sources('light')}
      {sizes}
      width={1536}
      height={heights[scene]}
      alt=""
      fetchpriority="high"
    />
  </picture>
{/if}
{#each themes as theme (theme)}
  <img
    class={[
      'pointer-events-none select-none',
      blend[theme],
      priority && '[:root:not([data-theme])_&]:hidden',
      className
    ]}
    src={source(theme)}
    srcset={sources(theme)}
    {sizes}
    width={1536}
    height={heights[scene]}
    alt=""
    loading="lazy"
    decoding="async"
  />
{/each}
