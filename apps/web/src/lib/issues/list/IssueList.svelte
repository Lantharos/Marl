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
<section bind:this={list} aria-label="Issues" class="grid gap-6">
  {#each groups as group (group.title)}
    <div>
      <h2 class="mb-2 px-1 text-sm font-semibold text-ink-strong">{group.title}</h2>
      <List>
        {#each group.issues as issue (issue.id)}<IssueRow {issue} {showRepository} />{/each}
      </List>
    </div>
  {:else}
    <List><EmptyState compact icon={CircleDot} title={emptyTitle} description={emptyDescription} /></List>
  {/each}
</section>
