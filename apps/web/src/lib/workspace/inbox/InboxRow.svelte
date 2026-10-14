<script lang="ts">
  import type { InboxItem } from '@marl/contracts';
  import CircleAlert from '@lucide/svelte/icons/circle-alert';
  import WorkItemReference from '#lib/components/discussion/WorkItemReference.svelte';
  import WorkItemStateIcon from '#lib/components/discussion/WorkItemStateIcon.svelte';
  import { formatAbsoluteTime } from '#lib/time.js';
  import { compactAge } from '../format';
  import { workspace } from '../store/workspace.svelte';
  import { inboxRef } from './inbox-groups';

  let {
    item,
    selected,
    active,
    onSelect
  }: { item: InboxItem; selected: boolean; active: boolean; onSelect: (item: InboxItem) => void } = $props();
  const ref = $derived(inboxRef(item));
  const live = $derived.by(() => {
    const entry = ref && workspace.entry(ref);
    if (entry?.kind === 'pull' && entry.state) return { title: entry.state.pull.title, state: entry.state.pull.state };
    if (entry?.kind === 'issue' && entry.state)
      return { title: entry.state.issue.title, state: entry.state.issue.state };
    return { title: item.title, state: item.state };
  });
</script>

<button
  type="button"
  id="inbox-{item.id}"
  role="option"
  aria-selected={selected}
  tabindex="-1"
  data-inbox-row
  class={[
    'grid w-full grid-cols-[16px_minmax(0,1fr)_auto] items-start gap-x-2.5 rounded-lg px-2.5 py-2 text-left transition-colors',
    selected ? (active ? 'bg-surface-muted' : 'bg-surface-hover') : 'hover:bg-surface-hover'
  ]}
  onclick={() => onSelect(item)}
  onpointerenter={() => ref && workspace.prefetch(ref)}
>
  <span class="mt-0.5">
    {#if item.kind === 'run'}<CircleAlert size={15} class="text-danger" />{:else}<WorkItemStateIcon
        kind={item.kind}
        state={live.state}
        size={15}
      />{/if}
  </span>
  <span class="min-w-0">
    <span class={['block truncate text-sm leading-5', item.unread ? 'font-semibold text-ink-strong' : 'text-ink']}
      >{live.title}</span
    >
    <span class="mt-0.5 block truncate font-mono text-xs text-ink-muted"
      >{#if item.kind === 'run'}{item.repository.owner}/{item.repository.name}<span class="ml-1.5 font-sans"
          >run {item.number}</span
        >{:else}<WorkItemReference
          kind={item.kind}
          number={item.number}
          repository="{item.repository.owner}/{item.repository.name}"
        />{/if}</span
    >
  </span>
  <span class="flex items-center gap-1.5 pt-0.5">
    {#if item.unread}<span class="size-1.5 rounded-full bg-brand" role="img" aria-label="Unread"></span>{/if}
    <time
      class="text-xs text-ink-faint tabular-nums"
      datetime={item.updatedAt}
      title={formatAbsoluteTime(item.updatedAt)}>{compactAge(item.updatedAt)}</time
    >
  </span>
</button>
