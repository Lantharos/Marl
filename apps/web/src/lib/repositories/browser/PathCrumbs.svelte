<script lang="ts">
  import { treeHref, type CodeLocation } from './entry-path';

  let { location, path, file = false }: { location: CodeLocation; path: string; file?: boolean } = $props();
  const parts = $derived(path.split('/').filter(Boolean));
</script>

<nav class="flex min-w-0 flex-wrap items-center gap-x-1.5 gap-y-1 text-sm" aria-label="Path">
  <a class="font-semibold text-brand hover:underline" href={treeHref(location)}>{location.repository}</a>
  {#each parts as part, index (`${index}:${part}`)}
    <span class="text-ink-faint">/</span>
    {#if index === parts.length - 1}<span aria-current="page" class="font-semibold break-all text-ink-strong"
        >{part}</span
      >{:else}<a class="text-brand hover:underline" href={treeHref(location, parts.slice(0, index + 1).join('/'))}
        >{part}</a
      >{/if}
  {/each}
  {#if !file && parts.length}<span class="text-ink-faint">/</span>{/if}
</nav>
