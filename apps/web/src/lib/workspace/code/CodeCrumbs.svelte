<script lang="ts">
  import type { CodeLocation } from '#lib/repositories/browser/entry-path.js';
  import { workspaceLinks } from './code-repository';

  let { location, path }: { location: CodeLocation; path: string } = $props();
  const segments = $derived(
    path
      .split('/')
      .filter(Boolean)
      .map((name, index, parts) => ({ name, path: parts.slice(0, index + 1).join('/') }))
  );
</script>

<nav class="flex min-w-0 items-center gap-1.5 text-sm text-ink-muted" aria-label="Location">
  <span class="truncate max-sm:hidden">{location.owner}</span>
  <span class="text-ink-faint max-sm:hidden" aria-hidden="true">/</span>
  <a
    class={['truncate hover:text-ink-strong', !segments.length && 'text-ink-strong']}
    href={workspaceLinks.tree(location)}>{location.repository}</a
  >
  {#each segments as segment, index (segment.path)}
    <span class="text-ink-faint" aria-hidden="true">/</span>
    {#if index === segments.length - 1}
      <span class="truncate font-medium text-ink-strong" aria-current="page">{segment.name}</span>
    {:else}
      <a class="truncate hover:text-ink-strong" href={workspaceLinks.tree(location, segment.path)}>{segment.name}</a>
    {/if}
  {/each}
</nav>
