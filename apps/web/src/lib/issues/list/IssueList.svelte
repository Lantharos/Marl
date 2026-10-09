<script lang="ts">
  import type { IssueSummary } from '@marl/contracts';
  import CircleDot from '@lucide/svelte/icons/circle-dot';
  import List from '#lib/components/list/List.svelte';
  import EmptyState from '#lib/components/feedback/EmptyState.svelte';
  import { plainKey } from '#lib/ui/keyboard.js';
  import IssueRow from './IssueRow.svelte';
  import { groupByUpdated } from './issue-list';

  let {
    issues,
    showRepository = false,
    emptyTitle,
    emptyDescription
  }: {
    issues: IssueSummary[];
    showRepository?: boolean;
    emptyTitle: string;
    emptyDescription: string;
  } = $props();
  let list = $state<HTMLElement>();
  const groups = $derived(groupByUpdated(issues));

  function move(event: KeyboardEvent) {
    const key = plainKey(event);
    if (key !== 'j' && key !== 'k') return;
    const links = [...(list?.querySelectorAll<HTMLAnchorElement>('a[data-issue-link]') ?? [])];
    if (!links.length) return;
    event.preventDefault();
    const current = links.indexOf(document.activeElement as HTMLAnchorElement);
    const next = current < 0 ? 0 : Math.max(0, Math.min(current + (key === 'j' ? 1 : -1), links.length - 1));
    links[next].focus({ preventScroll: true });
    links[next].closest('article')?.scrollIntoView({ block: 'nearest' });
  }
</script>

<svelte:window onkeydown={move} />
<List as="section" bind:element={list} aria-label="Issues">
  {#each groups as group (group.title)}
    <h2 class="px-3 pt-2.5 pb-1 text-xs font-semibold text-ink-muted first:pt-1.5">{group.title}</h2>
    {#each group.issues as issue (issue.id)}<IssueRow {issue} {showRepository} />{/each}
  {:else}
    <EmptyState compact icon={CircleDot} title={emptyTitle} description={emptyDescription} />
  {/each}
</List>
