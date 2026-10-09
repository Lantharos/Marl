<script lang="ts">
  import type { PullRequestDiff } from '@marl/contracts';
  import ChevronDown from '@lucide/svelte/icons/chevron-down';
  import FileDiff from '@lucide/svelte/icons/file-diff';
  import DiffStat from '#lib/code/DiffStat.svelte';
  import Spinner from '#lib/components/feedback/Spinner.svelte';

  let { comparison, comparing }: { comparison: PullRequestDiff | null; comparing: boolean } = $props();

  const visibleLimit = 6;
  let expanded = $state(false);
  const files = $derived(comparison?.files ?? []);
  const visible = $derived(expanded ? files : files.slice(0, visibleLimit));
  const additions = $derived(files.reduce((sum, file) => sum + file.additions, 0));
  const deletions = $derived(files.reduce((sum, file) => sum + file.deletions, 0));
  const statusMarks = { added: 'A', modified: 'M', deleted: 'D', renamed: 'R' };
  const statusTones = {
    added: 'text-success',
    modified: 'text-ink-muted',
    deleted: 'text-danger',
    renamed: 'text-merged'
  };
</script>

<div class="surface rounded-xl" aria-live="polite">
  <div class="flex min-h-11 items-center gap-2.5 px-3.5 py-2.5 text-sm">
    {#if comparing}<Spinner />{:else}<FileDiff size={16} class="text-ink-muted" aria-hidden="true" />{/if}
    <span class="flex-1 text-ink">
      {#if comparing}Comparing branches
      {:else if !comparison}Choose two different branches to compare
      {:else if !files.length}These branches have no differences
      {:else}<strong class="font-semibold text-ink-strong">{files.length}</strong>
        {files.length === 1 ? 'file' : 'files'} changed{/if}
    </span>
    {#if files.length}<DiffStat {additions} {deletions} />{/if}
  </div>
  {#if files.length}
    <ul class="grid border-t border-line-subtle px-1.5 py-1.5">
      {#each visible as file (file.path)}
        <li class="grid grid-cols-[14px_minmax(0,1fr)_auto] items-center gap-2.5 rounded-lg px-2 py-1">
          <span class={['font-mono text-2xs font-semibold', statusTones[file.status]]} aria-hidden="true"
            >{statusMarks[file.status]}</span
          >
          <span class="truncate font-mono text-xs text-ink"
            >{file.path}<span class="sr-only"> ({file.status})</span></span
          >
          <DiffStat additions={file.additions} deletions={file.deletions} />
        </li>
      {/each}
      {#if files.length > visibleLimit}
        <li>
          <button
            type="button"
            class="flex w-full items-center gap-1.5 rounded-lg px-2 py-1.5 text-xs font-semibold text-ink-muted hover:bg-surface-hover hover:text-ink-strong"
            aria-expanded={expanded}
            onclick={() => (expanded = !expanded)}
            >{expanded ? 'Show fewer files' : `Show all ${files.length} files`}<ChevronDown size={13} /></button
          >
        </li>
      {/if}
    </ul>
  {/if}
</div>
