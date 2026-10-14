<script lang="ts">
  import type { InboxItem } from '@marl/contracts';
  import CheckCheck from '@lucide/svelte/icons/check-check';
  import Inbox from '@lucide/svelte/icons/inbox';
  import Button from '#lib/components/controls/Button.svelte';
  import EmptyState from '#lib/components/feedback/EmptyState.svelte';
  import Notice from '#lib/components/feedback/Notice.svelte';
  import Spinner from '#lib/components/feedback/Spinner.svelte';
  import Tooltip from '#lib/components/overlays/Tooltip.svelte';
  import Kbd from '#lib/components/page/Kbd.svelte';
  import type { InboxQueue } from './inbox-queue.svelte';
  import InboxRow from './InboxRow.svelte';

  let { queue, active, onSelect }: { queue: InboxQueue; active: boolean; onSelect: (item: InboxItem) => void } =
    $props();

  $effect(() => {
    if (queue.selectedId) document.getElementById(`inbox-${queue.selectedId}`)?.scrollIntoView({ block: 'nearest' });
  });

  function loadOlder(node: HTMLElement) {
    const observer = new IntersectionObserver((entries) => {
      if (entries.some((entry) => entry.isIntersecting)) void queue.loadMore();
    });
    observer.observe(node);
    return () => observer.disconnect();
  }
</script>

<div class="flex h-full flex-col">
  <header class="flex h-12 shrink-0 items-center gap-2 px-4">
    <h1 class="text-md font-semibold text-ink-strong">Inbox</h1>
    {#if queue.counts.unread}<span class="text-sm text-ink-muted tabular-nums">{queue.counts.unread} unread</span>{/if}
    {#if queue.counts.unread}<Tooltip text="Mark all read" as="label" placement="bottom-end">
        {#snippet children(tooltip)}
          <Button {...tooltip} class="ml-auto" icon size="small" variant="ghost" onclick={queue.markAllRead}
            ><CheckCheck size={16} /></Button
          >
        {/snippet}
      </Tooltip>{/if}
  </header>
  {#if queue.error}<Notice class="mx-3 mb-2" ondismiss={() => (queue.error = '')}>{queue.error}</Notice>{/if}

  <div
    class="min-h-0 flex-1 overflow-y-auto px-2 pb-4"
    role="listbox"
    tabindex="0"
    aria-label="Inbox items"
    aria-activedescendant={queue.selectedId ? `inbox-${queue.selectedId}` : undefined}
  >
    {#if queue.status === 'loading' || queue.status === 'idle'}
      <div class="flex items-center gap-2 px-3 py-6 text-sm text-ink-muted" role="status"><Spinner />Loading</div>
    {:else if !queue.items.length}
      <EmptyState
        compact
        icon={Inbox}
        title="All caught up"
        description="New mentions, reviews, and updates land here."
      />
    {:else}
      {#each queue.groups as group (group.id)}
        <div role="group" aria-label={group.label}>
          <div class="flex items-baseline gap-2 px-2.5 pt-4 pb-1.5 text-xs">
            <span class="font-semibold text-ink-muted">{group.label}</span>
            <span class="text-ink-faint tabular-nums">{group.items.length}</span>
          </div>
          {#each group.items as item (item.id)}
            <InboxRow {item} selected={item.id === queue.selectedId} {active} {onSelect} />
          {/each}
        </div>
      {/each}
      {#if queue.nextCursor}<div class="flex justify-center py-4" {@attach loadOlder}>
          {#if queue.loadingMore}<Spinner class="text-ink-faint" />{/if}
        </div>{/if}
    {/if}
  </div>

  {#if queue.finished}
    <div class="flex h-11 shrink-0 items-center gap-2 border-t border-line-subtle px-4 text-sm" role="status">
      <span class="min-w-0 flex-1 truncate text-ink-muted">Done · {queue.finished.item.title}</span>
      <Button size="small" variant="ghost" onclick={queue.undo}>Undo <Kbd>Z</Kbd></Button>
    </div>
  {/if}
</div>
