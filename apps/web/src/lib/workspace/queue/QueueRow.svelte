<script lang="ts">
  import WorkItemReference from '#lib/components/discussion/WorkItemReference.svelte';
  import WorkItemStateIcon from '#lib/components/discussion/WorkItemStateIcon.svelte';
  import { formatAbsoluteTime } from '#lib/time.js';
  import { compactAge } from '../format';
  import { workspace } from '../store/workspace.svelte';
  import type { QueueItem } from './work-queue.svelte';

  let {
    item,
    selected,
    active,
    onSelect
  }: { item: QueueItem; selected: boolean; active: boolean; onSelect: (item: QueueItem) => void } = $props();
  const live = $derived.by(() => {
    const entry = workspace.entry(item.ref);
    if (entry.kind === 'pull' && entry.state) return { title: entry.state.pull.title, state: entry.state.pull.state };
    if (entry.kind === 'issue' && entry.state)
      return { title: entry.state.issue.title, state: entry.state.issue.state };
    return item;
  });
</script>

<button
  type="button"
  id="queue-{item.key}"
  role="option"
  aria-selected={selected}
  tabindex="-1"
  class={[
    'grid w-full grid-cols-[16px_minmax(0,1fr)_auto] items-start gap-x-2.5 rounded-lg px-2.5 py-2 text-left transition-colors',
    selected ? 'bg-surface-muted' : 'hover:bg-surface-hover',
    selected && active && 'shadow-[inset_2px_0_var(--color-brand)]'
  ]}
  onclick={() => onSelect(item)}
  onpointerenter={() => workspace.prefetch(item.ref)}
>
  <span class="mt-0.5"><WorkItemStateIcon kind={item.ref.kind} state={live.state} size={15} /></span>
  <span class="min-w-0">
    <span class="block truncate text-sm leading-5 text-ink-strong">{live.title}</span>
    <span class="mt-0.5 block truncate font-mono text-xs text-ink-muted"
      ><WorkItemReference
        kind={item.ref.kind}
        number={item.ref.number}
        repository="{item.ref.owner}/{item.ref.repo}"
      /><span class="ml-1.5 font-sans">{item.author}</span></span
    >
  </span>
  <time
    class="pt-0.5 text-xs text-ink-faint tabular-nums"
    datetime={item.updatedAt}
    title={formatAbsoluteTime(item.updatedAt)}>{compactAge(item.updatedAt)}</time
  >
</button>
