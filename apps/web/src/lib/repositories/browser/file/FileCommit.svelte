<script lang="ts">
  import History from '@lucide/svelte/icons/rotate-ccw-clock';
  import UserProfileLink from '#lib/components/identity/UserProfileLink.svelte';
  import Time from '#lib/components/page/Time.svelte';
  import type { TreeEntry } from '../types';

  let { entry, base, historyHref }: { entry?: TreeEntry; base: string; historyHref: string } = $props();
</script>

<div class="flex min-h-12 flex-wrap items-center gap-x-3 gap-y-1 px-4 py-2">
  {#if entry?.commitId}
    <UserProfileLink displayName={entry.author ?? ''} size={22} class="text-sm font-semibold" />
    <a class="min-w-0 flex-1 truncate text-sm text-ink-muted hover:text-brand" href="{base}/commit/{entry.commitId}"
      >{entry.message}</a
    >
    <span class="flex items-center gap-3">
      <a class="font-mono text-xs text-ink-muted hover:text-brand max-sm:hidden" href="{base}/commit/{entry.commitId}"
        >{entry.commitId.slice(0, 7)}</a
      >
      {#if entry.updatedAt}<Time value={entry.updatedAt} class="text-xs whitespace-nowrap text-ink-muted" />{/if}
    </span>
  {:else}
    <span class="min-w-0 flex-1"></span>
  {/if}
  <a
    class="inline-flex items-center gap-1.5 text-sm font-medium text-ink hover:text-brand"
    href={historyHref}
    aria-label="History"><History size={14} /><span class="max-sm:hidden">History</span></a
  >
</div>
