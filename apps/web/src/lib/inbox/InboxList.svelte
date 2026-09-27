<script lang="ts">
  import { goto } from '$app/navigation';
  import type { InboxItem } from '@marl/contracts';
  import AtSign from '@lucide/svelte/icons/at-sign';
  import Check from '@lucide/svelte/icons/check';
  import CircleAlert from '@lucide/svelte/icons/circle-alert';
  import CircleDot from '@lucide/svelte/icons/circle-dot';
  import GitPullRequest from '@lucide/svelte/icons/git-pull-request';
  import RotateCcw from '@lucide/svelte/icons/rotate-ccw';
  import EmptyState from '$lib/components/feedback/EmptyState.svelte';
  import Time from '$lib/components/page/Time.svelte';
  import { api } from '$lib/api';

  let {
    items,
    compact = false,
    emptyTitle = 'All caught up',
    emptyDescription = 'Mentions, assignments, and updates will appear here.',
    onChange = () => {}
  }: {
    items: InboxItem[];
    compact?: boolean;
    emptyTitle?: string;
    emptyDescription?: string;
    onChange?: () => void | Promise<void>;
  } = $props();

  function reason(item: InboxItem) {
    if (item.reason === 'mention') return 'mentioned you';
    if (item.reason === 'assignment') return `assigned this ${item.kind === 'pull' ? 'pull' : 'issue'} to you`;
    if (item.reason === 'failure') return 'run you triggered failed';
    if (item.reason === 'authored') return `updated ${item.kind === 'pull' ? 'a pull' : 'an issue'} you opened`;
    return `updated ${item.kind === 'pull' ? 'a pull' : 'an issue'} you joined`;
  }

  async function open(event: MouseEvent, item: InboxItem) {
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    event.preventDefault();
    if (item.unread)
      await api(`/inbox/${item.kind}/${item.id.slice(item.id.indexOf(':') + 1)}`, {
        method: 'PATCH',
        body: JSON.stringify({ read: true })
      });
    await goto(item.href);
  }

  async function setDone(item: InboxItem) {
    await api(`/inbox/${item.kind}/${item.id.slice(item.id.indexOf(':') + 1)}`, {
      method: 'PATCH',
      body: JSON.stringify({ done: !item.done })
    });
    await onChange();
  }
</script>

<section class="surface p-1.5" aria-label="Inbox items">
  {#each items as item (item.id)}
    <article class="group relative flex items-center gap-1 rounded-lg transition-colors hover:bg-surface-hover">
      <a
        href={item.href}
        onclick={(event) => open(event, item)}
        class={[
          'grid min-w-0 flex-1 grid-cols-[32px_minmax(0,1fr)] items-center gap-3 px-3',
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
            ><span class="text-ink">{item.repository.owner}/{item.repository.name}</span> · {item.kind === 'issue'
              ? `#${item.number}`
              : item.kind === 'pull'
                ? `!${item.number}`
                : `run ${item.number}`} · {reason(item)} · <Time value={item.updatedAt} class="text-ink-muted" /></span
          >
        </span>
      </a>
      {#if !compact}<button
          class="mr-2 grid size-8 shrink-0 place-items-center rounded-md text-ink-muted opacity-100 transition hover:bg-surface-muted hover:text-ink-strong focus-visible:opacity-100 sm:opacity-0 sm:group-hover:opacity-100"
          aria-label={item.done ? 'Move back to inbox' : 'Mark as done'}
          title={item.done ? 'Move back to inbox' : 'Mark as done'}
          onclick={() => setDone(item)}
          >{#if item.done}<RotateCcw size={15} />{:else}<Check size={16} />{/if}</button
        >{/if}
    </article>
  {:else}
    <EmptyState compact icon={Check} title={emptyTitle} description={emptyDescription} />
  {/each}
</section>
