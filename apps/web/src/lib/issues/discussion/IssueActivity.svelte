<script lang="ts">
  import type { WorkItemLabel } from '@marl/contracts';
  import ChevronRight from '@lucide/svelte/icons/chevron-right';
  import History from '@lucide/svelte/icons/history';
  import IssueActivityRow from './IssueActivityRow.svelte';
  import { isMechanical, type ActivityEntry } from './issue-discussion';

  let { entries, labels }: { entries: ActivityEntry[]; labels: WorkItemLabel[] } = $props();
  let expanded = $state(false);
  const changes = $derived(entries.filter(isMechanical));
  const collapsible = $derived(changes.length > 2);
  const summary = $derived.by(() => {
    const actors = [
      ...new Set(changes.flatMap((entry) => (entry.kind === 'event' ? [entry.value.actorDisplayName] : [])))
    ];
    const names =
      actors.length === 1
        ? actors[0]
        : actors.length === 2
          ? `${actors[0]} and ${actors[1]}`
          : `${actors[0]} and ${actors.length - 1} others`;
    return `${names} made ${changes.length} changes`;
  });
</script>

<section class="grid rounded-lg bg-surface-muted/60 p-0.5" aria-label="Activity">
  {#each entries as entry (entry.sequence)}
    {#if collapsible && entry === changes[0]}
      <button
        type="button"
        class="grid grid-cols-[16px_minmax(0,1fr)_auto] items-center gap-x-2.5 rounded-md px-2.5 py-1.5 text-left text-sm text-ink-muted transition-colors hover:bg-surface-hover hover:text-ink-strong"
        aria-expanded={expanded}
        onclick={() => (expanded = !expanded)}
        ><History size={14} class="text-ink-faint" /><span class="truncate">{summary}</span><ChevronRight
          size={14}
        /></button
      >
    {/if}
    {#if expanded || !collapsible || !isMechanical(entry)}<IssueActivityRow {entry} {labels} />{/if}
  {/each}
</section>
