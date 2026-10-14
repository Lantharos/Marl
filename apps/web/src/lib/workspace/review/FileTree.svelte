<script lang="ts">
  import { SvelteSet } from 'svelte/reactivity';
  import ChevronRight from '@lucide/svelte/icons/chevron-right';
  import Circle from '@lucide/svelte/icons/circle';
  import CircleCheck from '@lucide/svelte/icons/circle-check';
  import MessageSquare from '@lucide/svelte/icons/message-square';
  import { treeRows } from './file-tree';
  import type { ReviewSession } from './review-session.svelte';

  let { session, onPick }: { session: ReviewSession; onPick?: () => void } = $props();
  const collapsed = new SvelteSet<string>();
  const rows = $derived(treeRows(session.tree, collapsed));
  const viewedCount = $derived(session.order.filter((path) => session.isViewed(path)).length);
  const conversations = $derived.by(() => {
    const counts = new Map<string, number>();
    for (const threads of session.threads.values())
      for (const thread of threads) if (!thread.resolved) counts.set(thread.path, (counts.get(thread.path) ?? 0) + 1);
    return counts;
  });

  function toggle(path: string) {
    if (collapsed.has(path)) collapsed.delete(path);
    else collapsed.add(path);
  }
</script>

<div class="flex h-full flex-col">
  <header class="flex h-11 shrink-0 items-center gap-2 border-b border-line-subtle px-4 text-xs">
    <span class="font-semibold text-ink-strong">Files</span>
    <span class="text-ink-faint tabular-nums">{viewedCount} of {session.order.length} viewed</span>
  </header>
  <ul class="min-h-0 flex-1 overflow-y-auto p-1.5 font-mono text-xs" aria-label="Changed files">
    {#each rows as { node, depth } (node.path)}
      <li>
        {#if node.kind === 'folder'}
          <button
            type="button"
            class="flex h-7 w-full items-center gap-1 rounded-md pr-2 text-left text-ink-muted hover:bg-surface-hover"
            style:padding-left="{depth * 12 + 6}px"
            aria-expanded={!collapsed.has(node.path)}
            onclick={() => toggle(node.path)}
            ><ChevronRight size={13} /><span class="truncate">{node.name}</span></button
          >
        {:else}
          {@const viewed = session.isViewed(node.path)}
          {@const selected = session.selectedFile?.path === node.path}
          {@const open = conversations.get(node.path)}
          <div
            class={[
              'group flex h-7 items-center gap-1.5 rounded-md pr-2',
              selected ? 'bg-surface-muted text-ink-strong' : 'text-ink hover:bg-surface-hover'
            ]}
            style:padding-left="{depth * 12 + 4}px"
          >
            <button
              type="button"
              class="grid size-5 shrink-0 place-items-center rounded-sm text-ink-faint hover:text-ink-strong"
              aria-label={viewed ? `Mark ${node.path} as not viewed` : `Mark ${node.path} as viewed`}
              aria-pressed={viewed}
              onclick={() => session.toggleViewed(node.path)}
              >{#if viewed}<CircleCheck size={13} class="text-success" />{:else}<Circle size={13} />{/if}</button
            >
            <button
              type="button"
              class={['min-w-0 flex-1 truncate text-left', viewed && !selected && 'text-ink-faint']}
              aria-current={selected ? 'true' : undefined}
              onclick={() => {
                session.select(node.path);
                onPick?.();
              }}>{node.name}</button
            >
            {#if open}<span class="flex items-center gap-0.5 text-warning"
                ><MessageSquare size={11} aria-label="Open conversations" />{open}</span
              >{/if}
            <span class="text-success tabular-nums">+{node.file.additions}</span>
            <span class="text-danger tabular-nums">−{node.file.deletions}</span>
          </div>
        {/if}
      </li>
    {/each}
  </ul>
</div>
