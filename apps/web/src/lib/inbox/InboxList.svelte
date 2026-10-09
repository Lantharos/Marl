<script lang="ts">
  import { tick } from 'svelte';
  import WorkItemReference from '#lib/components/discussion/WorkItemReference.svelte';
  import type { InboxItem } from '@marl/contracts';
  import AtSign from '@lucide/svelte/icons/at-sign';
  import Check from '@lucide/svelte/icons/check';
  import CircleAlert from '@lucide/svelte/icons/circle-alert';
  import CircleDot from '@lucide/svelte/icons/circle-dot';
  import GitPullRequest from '@lucide/svelte/icons/git-pull-request';
  import RotateCcw from '@lucide/svelte/icons/rotate-ccw';
  import Button from '#lib/components/controls/Button.svelte';
  import List from '#lib/components/list/List.svelte';
  import EmptyState from '#lib/components/feedback/EmptyState.svelte';
  import Tooltip from '#lib/components/overlays/Tooltip.svelte';
  import Time from '#lib/components/page/Time.svelte';
  import { plainKey } from '#lib/ui/keyboard.js';
  import { inboxReason } from './inbox-item';

  let {
    items,
    compact = false,
    emptyTitle = 'All caught up',
    emptyDescription = 'Mentions, assignments, and updates will appear here.',
    onOpen,
    onToggleDone
  }: {
    items: InboxItem[];
    compact?: boolean;
    emptyTitle?: string;
    emptyDescription?: string;
    onOpen: (item: InboxItem) => void;
    onToggleDone?: (item: InboxItem) => void;
  } = $props();
  let list = $state<HTMLElement>();

  function open(event: MouseEvent, item: InboxItem) {
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    event.preventDefault();
    onOpen(item);
  }

  function links() {
    return [...(list?.querySelectorAll<HTMLAnchorElement>('[data-inbox-item]') ?? [])];
  }

  function focusItem(index: number) {
    const targets = links();
    targets[Math.max(0, Math.min(index, targets.length - 1))]?.focus();
  }

  async function triage(event: KeyboardEvent, toggleDone: (item: InboxItem) => void) {
    const key = plainKey(event);
    if (key !== 'j' && key !== 'k' && key !== 'e') return;
    const current = links().findIndex((link) => link === document.activeElement);
    if (key === 'e') {
      if (current < 0) return;
      event.preventDefault();
      toggleDone(items[current]);
      await tick();
      focusItem(current);
      return;
    }
    event.preventDefault();
    focusItem(current < 0 ? 0 : current + (key === 'j' ? 1 : -1));
  }
</script>

<svelte:window onkeydown={onToggleDone && ((event) => triage(event, onToggleDone))} />
<List as="section" bind:element={list} aria-label="Inbox items">
  {#each items as item (item.id)}
    <article
      class="group relative flex items-center gap-1 rounded-lg transition-colors hover:bg-surface-hover has-[a:focus-visible]:bg-surface-hover"
    >
      <a
        href={item.href}
        data-inbox-item
        onclick={(event) => open(event, item)}
        class={[
          'grid min-w-0 flex-1 grid-cols-[32px_minmax(0,1fr)] items-center gap-3 rounded-lg px-3',
          compact ? 'min-h-15 py-2.5' : 'min-h-17 py-3'
        ]}
      >
        <span
          class={[
            'grid size-8 place-items-center rounded-full',
            item.kind === 'run'
              ? 'bg-danger-soft text-danger'
              : item.unread
                ? 'bg-brand-soft text-brand'
                : 'bg-surface-muted text-ink-muted'
          ]}
          >{#if item.reason === 'mention'}<AtSign size={16} />{:else if item.kind === 'issue'}<CircleDot
              size={16}
            />{:else if item.kind === 'pull'}<GitPullRequest size={16} />{:else}<CircleAlert size={16} />{/if}</span
        >
        <span class="min-w-0">
          <span class="flex min-w-0 items-center gap-2">
            <strong class={['truncate text-sm', item.unread ? 'font-semibold text-ink-strong' : 'font-medium text-ink']}
              >{item.title}</strong
            >
            {#if item.unread}<span class="size-1.5 shrink-0 rounded-full bg-brand" role="img" aria-label="Unread"
              ></span>{/if}
          </span>
          <span class="mt-0.5 block truncate text-xs text-ink-muted"
            ><span class="text-ink">{item.repository.owner}/{item.repository.name}</span> · {#if item.kind === 'run'}run {item.number}{:else}<WorkItemReference
                kind={item.kind}
                number={item.number}
              />{/if} · {inboxReason(item)} · <Time value={item.updatedAt} class="text-ink-muted" /></span
          >
        </span>
      </a>
      {#if onToggleDone}<Tooltip text={item.done ? 'Move back to inbox' : 'Mark as done'} as="label">
          {#snippet children(tooltip)}
            <Button
              {...tooltip}
              icon
              size="small"
              variant="ghost"
              class="mr-2 focus-visible:opacity-100 sm:opacity-0 sm:group-hover:opacity-100 sm:group-has-[a:focus-visible]:opacity-100"
              onclick={() => onToggleDone(item)}
              >{#if item.done}<RotateCcw size={15} />{:else}<Check size={16} />{/if}</Button
            >
          {/snippet}
        </Tooltip>{/if}
    </article>
  {:else}
    <EmptyState compact icon={Check} title={emptyTitle} description={emptyDescription} />
  {/each}
</List>
