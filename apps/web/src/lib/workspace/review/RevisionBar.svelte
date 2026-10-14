<script lang="ts">
  import type { Snippet } from 'svelte';
  import ChevronDown from '@lucide/svelte/icons/chevron-down';
  import Button from '#lib/components/controls/Button.svelte';
  import WorkItemReference from '#lib/components/discussion/WorkItemReference.svelte';
  import Menu from '#lib/components/overlays/menu/Menu.svelte';
  import MenuItem from '#lib/components/overlays/menu/MenuItem.svelte';
  import Tooltip from '#lib/components/overlays/Tooltip.svelte';
  import type { ReviewSession } from './review-session.svelte';

  let { session, actions }: { session: ReviewSession; actions: Snippet } = $props();
  const pull = $derived(session.pull);
  const headNumber = $derived(session.headRevision?.number ?? 0);
  const lastNumber = $derived(session.revisions.at(-1)?.number ?? 0);
  const allChanges = $derived(session.base === 0 && session.currentHead);
  const sinceReview = $derived(
    Boolean(session.lastReviewed && session.base === session.lastReviewed.number && session.currentHead)
  );

  function pickHead(number: number) {
    session.compare(Math.min(session.base, number - 1), number === lastNumber ? 'current' : number);
  }
</script>

<header class="flex min-h-12 shrink-0 flex-wrap items-center gap-x-4 gap-y-2 border-b border-line-subtle px-4 py-1.5">
  <p class="flex min-w-0 items-center gap-1.5 text-sm">
    <span class="truncate text-ink-muted">{pull.repository.owner}/{pull.repository.name}</span>
    <WorkItemReference kind="pull" number={pull.number} class="text-ink-muted" />
    <span class="truncate font-semibold text-ink-strong max-lg:hidden">{pull.title}</span>
  </p>

  <nav class="flex items-center font-mono text-xs" aria-label="Compare revisions">
    <Menu label="Compare from" placement="bottom-start" class="min-w-52">
      {#snippet trigger(menu)}
        <button
          {...menu}
          type="button"
          class="flex h-7 items-center gap-1 rounded-md bg-surface-muted px-2 text-ink-strong hover:bg-surface-hover"
          >{session.label(session.baseRevision)}<ChevronDown size={12} /></button
        >
      {/snippet}
      <MenuItem checked={session.base === 0} onselect={() => session.compare(0, session.head)}
        >{pull.targetBranch}</MenuItem
      >
      {#each session.revisions.filter((revision) => revision.number < headNumber) as revision (revision.number)}
        <MenuItem
          checked={session.base === revision.number}
          onselect={() => session.compare(revision.number, session.head)}
          >R{revision.number} · {revision.title}</MenuItem
        >
      {/each}
    </Menu>
    {#each session.revisions as revision (revision.number)}
      {@const inRange = revision.number > session.base && revision.number <= headNumber}
      <span class={['h-px w-5', inRange ? 'bg-brand' : 'bg-line-strong']} aria-hidden="true"></span>
      <Tooltip text="Show changes up to R{revision.number}: {revision.title}">
        {#snippet children(tooltip)}
          <button
            {...tooltip}
            type="button"
            aria-pressed={revision.number === headNumber}
            class={[
              'h-7 rounded-md px-2 tabular-nums transition-colors',
              revision.number === headNumber
                ? 'bg-brand text-on-brand'
                : inRange
                  ? 'bg-brand-soft text-brand-strong'
                  : 'text-ink-faint hover:bg-surface-hover hover:text-ink'
            ]}
            onclick={() => pickHead(revision.number)}>R{revision.number}</button
          >
        {/snippet}
      </Tooltip>
    {/each}
  </nav>

  <div class="flex items-center gap-1">
    <Button
      size="small"
      variant="ghost"
      aria-pressed={allChanges}
      class="aria-pressed:bg-surface-muted aria-pressed:text-ink-strong"
      onclick={() => session.compare(0, 'current')}>All changes</Button
    >
    {#if session.lastReviewed}
      {@const reviewed = session.lastReviewed}
      <Button
        size="small"
        variant="ghost"
        aria-pressed={sinceReview}
        class="aria-pressed:bg-surface-muted aria-pressed:text-ink-strong"
        onclick={() => session.compare(reviewed.number, 'current')}>Since your review</Button
      >
    {/if}
  </div>

  <div class="ml-auto flex items-center gap-1">{@render actions()}</div>
</header>
