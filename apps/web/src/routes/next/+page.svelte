<script lang="ts">
  import { page } from '$app/state';
  import { goto } from '$app/navigation';
  import { tick } from 'svelte';
  import type { InboxItem } from '@marl/contracts';
  import Check from '@lucide/svelte/icons/check';
  import CheckCheck from '@lucide/svelte/icons/check-check';
  import Mail from '@lucide/svelte/icons/mail';
  import Undo2 from '@lucide/svelte/icons/undo-2';
  import { plainKey } from '#lib/ui/keyboard.js';
  import ItemPanes from '#lib/workspace/canvas/ItemPanes.svelte';
  import { inboxRef } from '#lib/workspace/inbox/inbox-groups.js';
  import InboxPane from '#lib/workspace/inbox/InboxPane.svelte';
  import RunCanvas from '#lib/workspace/inbox/RunCanvas.svelte';
  import type { ShellAction } from '#lib/workspace/shell/shell-state.svelte.js';
  import { workspace } from '#lib/workspace/store/workspace.svelte.js';
  import type { PageProps } from './$types';

  let { data }: PageProps = $props();
  const queue = $derived(workspace.inbox);
  const selected = $derived(queue.selected);
  const ref = $derived(selected && inboxRef(selected));
  let zone = $state<'list' | 'canvas'>('list');
  let mobileOpen = $state(false);
  let canvas = $state<HTMLElement>();

  $effect(() => {
    if (queue.status !== 'ready' || queue.selectedId) return;
    const requested = page.url.searchParams.get('item');
    const initial = queue.ordered.find((item) => item.id === requested);
    if (initial) queue.select(initial);
    else if (queue.ordered[0] && matchMedia('(width >= 48rem)').matches) queue.select(queue.ordered[0]);
  });

  $effect(() => {
    const id = queue.selectedId;
    if (id && page.url.searchParams.get('item') !== id)
      void goto(`/next?item=${encodeURIComponent(id)}`, { shallow: true, replace: true });
  });

  $effect(() => {
    if (!selected) return;
    const index = queue.ordered.indexOf(selected);
    for (const neighbour of [queue.ordered[index + 1], queue.ordered[index - 1]]) {
      const next = neighbour && inboxRef(neighbour);
      if (next) workspace.prefetch(next);
    }
  });

  function open(item: InboxItem) {
    queue.select(item);
    mobileOpen = true;
    zone = 'list';
  }

  async function enterCanvas() {
    zone = 'canvas';
    mobileOpen = true;
    await tick();
    canvas?.focus({ preventScroll: true });
  }

  function leaveCanvas() {
    zone = 'list';
    mobileOpen = false;
    canvas?.blur();
  }

  const actions = $derived<ShellAction[]>([
    ...(selected
      ? [
          { id: 'done', label: 'Mark done', keys: 'E', icon: Check, run: () => queue.markDone(selected) },
          {
            id: 'unread',
            label: selected.unread ? 'Mark read' : 'Mark unread',
            keys: 'U',
            icon: Mail,
            run: () => queue.toggleUnread(selected)
          }
        ]
      : []),
    ...(queue.finished ? [{ id: 'undo', label: 'Undo mark done', keys: 'Z', icon: Undo2, run: queue.undo }] : []),
    ...(queue.counts.unread
      ? [{ id: 'read-all', label: 'Mark everything read', icon: CheckCheck, run: queue.markAllRead }]
      : [])
  ]);

  function keydown(event: KeyboardEvent) {
    if (event.key === 'Escape' && zone === 'canvas' && !event.defaultPrevented) {
      const target = event.target as HTMLElement | null;
      if (target?.closest('input, textarea, dialog')) return;
      event.preventDefault();
      leaveCanvas();
      return;
    }
    const key = plainKey(event);
    if (!key) return;
    if (zone === 'canvas' && (key === 'j' || key === 'k')) {
      canvas?.scrollBy({ top: (key === 'j' ? 1 : -1) * canvas.clientHeight * 0.4, behavior: 'smooth' });
    } else if (key === 'j' || key === 'ArrowDown') queue.step(1);
    else if (key === 'k' || key === 'ArrowUp') queue.step(-1);
    else if (key === 'e' && selected) void queue.markDone(selected);
    else if (key === 'u' && selected) void queue.toggleUnread(selected);
    else if (key === 'z' && queue.finished) void queue.undo();
    else if (key === 'Enter' && selected && zone === 'list') void enterCanvas();
    else return;
    event.preventDefault();
  }
</script>

<svelte:head><title>Inbox · Marl</title></svelte:head>
<svelte:window onkeydown={keydown} />

<ItemPanes
  {ref}
  viewerId={data.shellUser?.id ?? ''}
  bind:canvasElement={canvas}
  mobileView={mobileOpen && selected ? 'canvas' : 'list'}
  onBack={leaveCanvas}
  {actions}
>
  {#snippet list()}
    <InboxPane {queue} active={zone === 'list'} onSelect={open} />
  {/snippet}
  {#snippet empty()}
    {#if selected?.kind === 'run'}<RunCanvas item={selected} />{:else}<div
        class="grid h-[60%] place-items-center px-6 text-sm text-ink-faint"
      >
        {queue.items.length ? 'Pick something from the list.' : ''}
      </div>{/if}
  {/snippet}
</ItemPanes>
