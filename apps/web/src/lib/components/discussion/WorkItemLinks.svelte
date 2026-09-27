<script lang="ts">
  import type { Snippet } from 'svelte';
  import type { LinkedWorkItem } from '@marl/contracts';
  import WorkItemStateIcon from './WorkItemStateIcon.svelte';

  let {
    items,
    context,
    actions
  }: {
    items: LinkedWorkItem[];
    context?: { owner: string; repository: string };
    actions?: Snippet;
  } = $props();
  const href = (item: LinkedWorkItem) =>
    `/${encodeURIComponent(item.repository.owner)}/${encodeURIComponent(item.repository.name)}/${item.kind === 'issue' ? 'issues' : 'pulls'}/${item.number}`;
  const sameRepository = (item: LinkedWorkItem) =>
    context?.owner === item.repository.owner && context.repository === item.repository.name;
</script>

{#if items.length || actions}
  <section class="min-w-0">
    <header class="flex min-h-7 items-center justify-between gap-2.5">
      <h3 class="text-xs font-semibold text-ink-muted">Linked work</h3>
      {#if actions}{@render actions()}{/if}
    </header>
    {#if items.length}
      <div class="mt-2 grid gap-0.5 rounded-lg bg-surface-muted p-1">
        {#each items as item (`${item.kind}:${item.id}`)}
          <a
            href={href(item)}
            title={item.title}
            class="grid grid-cols-[18px_minmax(0,1fr)] items-start gap-2 rounded-md px-2 py-2.5 transition-colors hover:bg-surface-hover"
          >
            <WorkItemStateIcon kind={item.kind} state={item.state} size={15} />
            <span class="min-w-0">
              <strong class="line-clamp-2 text-sm leading-snug font-semibold text-ink-strong">{item.title}</strong>
              <span class="mt-1 block truncate text-xs text-ink-muted"
                >{#if !sameRepository(item)}{item.repository.owner}/{item.repository.name}{/if}{item.kind === 'issue'
                  ? '#'
                  : '!'}{item.number}{#if item.closes}<span class="ml-2 text-ink">Closes on merge</span>{/if}</span
              >
            </span>
          </a>
        {/each}
      </div>
    {/if}
  </section>
{/if}
