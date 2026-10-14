<script lang="ts">
  import { goto } from '$app/navigation';
  import { page } from '$app/state';
  import { tick } from 'svelte';
  import CircleDot from '@lucide/svelte/icons/circle-dot';
  import GitPullRequest from '@lucide/svelte/icons/git-pull-request';
  import SegmentedControl from '#lib/components/controls/SegmentedControl.svelte';
  import EmptyState from '#lib/components/feedback/EmptyState.svelte';
  import Notice from '#lib/components/feedback/Notice.svelte';
  import Spinner from '#lib/components/feedback/Spinner.svelte';
  import { plainKey } from '#lib/ui/keyboard.js';
  import ItemPanes from '../canvas/ItemPanes.svelte';
  import type { ItemKind } from '../store/refs';
  import { workspace } from '../store/workspace.svelte';
  import QueueRow from './QueueRow.svelte';
  import type { QueueItem, QueueState } from './work-queue.svelte';

  let { kind, viewerId }: { kind: ItemKind; viewerId: string } = $props();
  const states = $derived(
    kind === 'pull'
      ? ([
          { value: 'open', label: 'Open' },
          { value: 'merged', label: 'Merged' },
          { value: 'closed', label: 'Closed' }
        ] as const)
      : ([
          { value: 'open', label: 'Open' },
          { value: 'closed', label: 'Closed' }
        ] as const)
  );
  const repository = $derived(page.url.searchParams.get('repository'));
  const filter = $derived(
    (states.find((option) => option.value === page.url.searchParams.get('state'))?.value ?? 'open') as QueueState
  );
  const queue = $derived(workspace.queue(kind, repository, filter));
  const title = $derived(repository ?? (kind === 'pull' ? 'Pulls' : 'Issues'));
  let zone = $state<'list' | 'canvas'>('list');
  let mobileOpen = $state(false);
  let canvas = $state<HTMLElement>();

  $effect(() => void queue.load());

  $effect(() => {
    if (queue.status !== 'ready' || queue.selectedKey) return;
    const requested = page.url.searchParams.get('item');
    const initial = queue.items.find((item) => item.key === requested);
    if (initial) queue.selectedKey = initial.key;
    else if (queue.items[0] && matchMedia('(width >= 48rem)').matches) queue.selectedKey = queue.items[0].key;
  });

  $effect(() => {
    const key = queue.selectedKey;
    if (!key || page.url.searchParams.get('item') === key) return;
    const url = new URL(page.url.href);
    url.searchParams.set('item', key);
    void goto(url, { shallow: true, replace: true });
  });

  $effect(() => {
    if (queue.selectedKey) document.getElementById(`queue-${queue.selectedKey}`)?.scrollIntoView({ block: 'nearest' });
  });

  function choose(next: QueueState) {
    const url = new URL(page.url.href);
    url.searchParams.set('state', next);
    url.searchParams.delete('item');
    void goto(url, { reset: false });
  }

  function select(item: QueueItem) {
    queue.selectedKey = item.key;
    mobileOpen = true;
    zone = 'list';
  }

  function loadMore(node: HTMLElement) {
    const observer = new IntersectionObserver((entries) => {
      if (entries.some((entry) => entry.isIntersecting)) void queue.loadMore();
    });
    observer.observe(node);
    return () => observer.disconnect();
  }

  async function keydown(event: KeyboardEvent) {
    if (
      event.key === 'Escape' &&
      zone === 'canvas' &&
      !(event.target as HTMLElement | null)?.closest('input, textarea, dialog')
    ) {
      event.preventDefault();
      zone = 'list';
      mobileOpen = false;
      canvas?.blur();
      return;
    }
    const key = plainKey(event);
    if (zone === 'canvas' && (key === 'j' || key === 'k'))
      canvas?.scrollBy({ top: (key === 'j' ? 1 : -1) * canvas.clientHeight * 0.4, behavior: 'smooth' });
    else if (key === 'j' || key === 'ArrowDown') queue.step(1);
    else if (key === 'k' || key === 'ArrowUp') queue.step(-1);
    else if (key === 'Enter' && queue.selected && zone === 'list') {
      zone = 'canvas';
      mobileOpen = true;
      await tick();
      canvas?.focus({ preventScroll: true });
    } else return;
    event.preventDefault();
  }
</script>

<svelte:head><title>{title} · Marl</title></svelte:head>
<svelte:window onkeydown={keydown} />

<ItemPanes
  ref={queue.selected?.ref ?? null}
  {viewerId}
  bind:canvasElement={canvas}
  mobileView={mobileOpen && queue.selected ? 'canvas' : 'list'}
  onBack={() => (mobileOpen = false)}
>
  {#snippet list()}
    <div class="flex h-full flex-col">
      <header class="flex h-12 shrink-0 items-center gap-3 px-4">
        <h1 class="min-w-0 truncate text-md font-semibold text-ink-strong">{title}</h1>
        <SegmentedControl label="State" options={states} value={filter} onchange={choose} class="ml-auto" />
      </header>
      {#if queue.error}<Notice class="mx-3 mb-2" ondismiss={() => (queue.error = '')}>{queue.error}</Notice>{/if}
      <div
        class="min-h-0 flex-1 overflow-y-auto px-2 pb-4"
        role="listbox"
        tabindex="0"
        aria-label={title}
        aria-activedescendant={queue.selectedKey ? `queue-${queue.selectedKey}` : undefined}
      >
        {#if queue.status === 'idle' || queue.status === 'loading'}
          <div class="flex items-center gap-2 px-3 py-6 text-sm text-ink-muted" role="status"><Spinner />Loading</div>
        {:else if !queue.items.length}
          <EmptyState compact icon={kind === 'pull' ? GitPullRequest : CircleDot} title="Nothing here" />
        {:else}
          {#each queue.items as item (item.key)}
            <QueueRow {item} selected={item.key === queue.selectedKey} active={zone === 'list'} onSelect={select} />
          {/each}
          {#if queue.nextCursor}<div class="flex justify-center py-4" {@attach loadMore}>
              {#if queue.loadingMore}<Spinner class="text-ink-faint" />{/if}
            </div>{/if}
        {/if}
      </div>
    </div>
  {/snippet}
</ItemPanes>
