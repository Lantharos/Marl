<script lang="ts">
  import type { PullRequestSummary } from '@marl/contracts';
  import GitPullRequest from '@lucide/svelte/icons/git-pull-request';
  import SearchX from '@lucide/svelte/icons/search-x';
  import Button from '#lib/components/controls/Button.svelte';
  import LinkButton from '#lib/components/controls/LinkButton.svelte';
  import EmptyState from '#lib/components/feedback/EmptyState.svelte';
  import List from '#lib/components/list/List.svelte';
  import Kbd from '#lib/components/page/Kbd.svelte';
  import { plainKey } from '#lib/ui/keyboard.js';
  import { pullSignal, type PullQueueGroup } from '../pull-signal';
  import PullRow from './PullRow.svelte';

  let {
    pulls,
    showRepository = false,
    grouped = false,
    emptyTitle,
    emptyDescription,
    createHref,
    onClearFilters
  }: {
    pulls: PullRequestSummary[];
    showRepository?: boolean;
    grouped?: boolean;
    emptyTitle: string;
    emptyDescription: string;
    createHref?: string;
    onClearFilters?: () => void;
  } = $props();
  let list = $state<HTMLElement>();

  const definitions: Array<{ key: PullQueueGroup; title: string }> = [
    { key: 'ready', title: 'Ready to land' },
    { key: 'attention', title: 'Needs attention' },
    { key: 'review', title: 'In review' },
    { key: 'draft', title: 'Still taking shape' }
  ];
  const sections = $derived.by(() => {
    if (!grouped) return [{ key: 'complete' as PullQueueGroup, title: '', pulls }];
    const byGroup = Map.groupBy(pulls, (pull) => pullSignal(pull).group);
    return definitions.flatMap((section) => {
      const members = byGroup.get(section.key);
      return members ? [{ ...section, pulls: members }] : [];
    });
  });

  function move(event: KeyboardEvent) {
    const key = plainKey(event);
    if ((key !== 'j' && key !== 'k') || !list) return;
    const rows = [...list.querySelectorAll<HTMLAnchorElement>('[data-pull-row]')];
    const current = rows.findIndex((row) => row === document.activeElement);
    const next = rows[current < 0 ? 0 : Math.max(0, Math.min(rows.length - 1, current + (key === 'j' ? 1 : -1)))];
    if (!next) return;
    event.preventDefault();
    next.focus();
    next.scrollIntoView({ block: 'nearest' });
  }
</script>

<svelte:window onkeydown={move} />

{#if pulls.length}
  <section bind:this={list} aria-label="Pulls" class="grid gap-6">
    {#each sections as section (section.key)}
      <div>
        {#if section.title}
          <h2 class="mb-2 flex items-center gap-2 px-1 text-sm font-semibold text-ink-strong">
            {section.title}<span class="font-normal text-ink-faint tabular-nums">{section.pulls.length}</span>
          </h2>
        {/if}
        <List>
          <ul class="grid gap-px">
            {#each section.pulls as pull (pull.id)}
              <li><PullRow {pull} {showRepository} /></li>
            {/each}
          </ul>
        </List>
      </div>
    {/each}
  </section>
  <p class="mt-3 hidden items-center justify-end gap-1.5 px-1 text-xs text-ink-faint pointer-fine:flex">
    <Kbd>J</Kbd><Kbd>K</Kbd> to move <span class="ml-2"><Kbd>Enter</Kbd></span> to open
  </p>
{:else}
  <div class="surface">
    <EmptyState icon={onClearFilters ? SearchX : GitPullRequest} title={emptyTitle} description={emptyDescription}>
      {#if onClearFilters}<Button size="small" onclick={onClearFilters}>Clear filters</Button>
      {:else if createHref}<LinkButton size="small" variant="primary" href={createHref}>Open a pull</LinkButton>{/if}
    </EmptyState>
  </div>
{/if}
