<script lang="ts">
  import GitBranch from '@lucide/svelte/icons/git-branch';
  import { entryHref } from './entry-path';

  let {
    owner,
    repository,
    revision,
    path,
    file = false
  }: { owner: string; repository: string; revision: string; path: string; file?: boolean } = $props();
  const parts = $derived(path.split('/').filter(Boolean));
</script>

<nav class="mb-4 flex min-w-0 flex-wrap items-center gap-x-1.5 gap-y-1 text-sm" aria-label="Path">
  <span class="mr-1 inline-flex items-center gap-1 rounded-md bg-surface-muted px-2 py-1 font-mono text-xs text-ink"
    ><GitBranch size={12} />{revision}</span
  >
  <a class="font-semibold text-brand hover:underline" href={entryHref(owner, repository, revision, 'tree', '')}
    >{repository}</a
  >
  {#each parts as part, index (`${index}:${part}`)}
    <span class="text-ink-faint">/</span>
    {#if index === parts.length - 1}<span aria-current="page" class="font-semibold break-all text-ink-strong"
        >{part}</span
      >{:else}<a
        class="text-brand hover:underline"
        href={entryHref(owner, repository, revision, 'tree', parts.slice(0, index + 1).join('/'))}>{part}</a
      >{/if}
  {/each}
  {#if !file && parts.length}<span class="text-ink-faint">/</span>{/if}
</nav>
