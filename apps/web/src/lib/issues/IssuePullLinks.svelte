<script lang="ts">
  import type { LinkedWorkItem, PullRequestSummary } from '@marl/contracts';
  import Link from '@lucide/svelte/icons/link';
  import { api, MarlApiError } from '$lib/api';
  import Button from '$lib/components/controls/Button.svelte';
  import SearchField from '$lib/components/controls/SearchField.svelte';
  import Spinner from '$lib/components/feedback/Spinner.svelte';
  import Modal from '$lib/components/overlays/Modal.svelte';
  import WorkItemStateIcon from '$lib/components/discussion/WorkItemStateIcon.svelte';
  import WorkItemLinks from '$lib/components/discussion/WorkItemLinks.svelte';

  let {
    items,
    context,
    canLink,
    onLink
  }: {
    items: LinkedWorkItem[];
    context: { owner: string; repository: string };
    canLink: boolean;
    onLink: (pullNumber: number) => Promise<boolean>;
  } = $props();
  let open = $state(false);
  let query = $state('');
  let results = $state.raw<PullRequestSummary[]>([]);
  let cursor = $state<string | null>(null);
  let loading = $state(false);
  let linking = $state<string | null>(null);
  let error = $state('');
  let controller: AbortController | undefined;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const available = $derived(
    results.filter((pull) => !items.some((item) => item.kind === 'pull' && item.id === pull.id))
  );
  const endpoint = $derived(
    `/repositories/${encodeURIComponent(context.owner)}/${encodeURIComponent(context.repository)}/pulls`
  );

  async function search(append = false) {
    controller?.abort();
    const request = new AbortController();
    controller = request;
    loading = true;
    error = '';
    try {
      const params = new URLSearchParams({ state: 'all', limit: '20', q: query.trim() });
      if (append && cursor) params.set('cursor', cursor);
      const result = await api<{ pullRequests: PullRequestSummary[]; nextCursor: string | null }>(
        `${endpoint}?${params}`,
        { signal: request.signal }
      );
      if (request.signal.aborted) return;
      results = append ? [...results, ...result.pullRequests] : result.pullRequests;
      cursor = result.nextCursor;
    } catch (cause) {
      if (!request.signal.aborted) error = cause instanceof MarlApiError ? cause.message : 'Pulls could not be loaded.';
    } finally {
      if (!request.signal.aborted) loading = false;
    }
  }

  function updateQuery(value: string) {
    query = value;
    clearTimeout(timer);
    controller?.abort();
    results = [];
    cursor = null;
    loading = true;
    timer = setTimeout(() => void search(), 200);
  }

  function openPicker() {
    open = true;
    query = '';
    results = [];
    cursor = null;
    void search();
  }

  function cancelSearch() {
    clearTimeout(timer);
    controller?.abort();
  }

  function closePicker() {
    if (linking) return;
    cancelSearch();
    open = false;
  }

  async function link(pull: PullRequestSummary) {
    if (linking) return;
    linking = pull.id;
    error = '';
    try {
      if (await onLink(pull.number)) open = false;
      else error = 'The pull could not be linked. Try again.';
    } finally {
      linking = null;
    }
  }
</script>

{#if items.length || canLink}<WorkItemLinks {items} {context}>
    {#snippet actions()}{#if canLink}<Button size="small" variant="ghost" onclick={openPicker}
          ><Link size={14} />Link a pull</Button
        >{/if}{/snippet}
  </WorkItemLinks>{/if}

<Modal
  {open}
  title="Link a pull"
  description="Linked pulls stay attached even when the report changes."
  onClose={closePicker}
>
  <div class="grid gap-3" {@attach () => cancelSearch}>
    <SearchField
      value={query}
      oninput={(event) => updateQuery(event.currentTarget.value)}
      disabled={Boolean(linking)}
      label="Search by title or number"
      class="h-10"
    />
    {#if error}<p
        class="flex items-center justify-between gap-3 rounded-md bg-danger-soft px-3 py-2 text-sm text-danger"
        role="alert"
      >
        {error}<Button size="small" variant="ghost" onclick={() => search()}>Retry</Button>
      </p>{/if}
    <div class="grid max-h-90 gap-0.5 overflow-y-auto" aria-busy={loading}>
      {#each available as pull (pull.id)}
        <button
          type="button"
          class="grid min-h-13 w-full grid-cols-[20px_minmax(0,1fr)_auto] items-center gap-3 rounded-lg px-3 py-2 text-left transition-colors hover:not-disabled:bg-surface-hover disabled:opacity-60"
          disabled={Boolean(linking)}
          onclick={() => link(pull)}
        >
          <WorkItemStateIcon kind="pull" state={pull.state} size={17} />
          <span class="min-w-0">
            <strong class="block truncate text-sm font-semibold text-ink-strong">{pull.title}</strong>
            <span class="mt-0.5 flex gap-2 truncate text-xs text-ink-muted"
              >!{pull.number}<span class="truncate font-mono">{pull.sourceBranch}</span></span
            >
          </span>
          {#if linking === pull.id}<Spinner />{/if}
        </button>
      {/each}
      {#if loading && !results.length}<p class="flex items-center justify-center gap-2 py-8 text-sm text-ink-muted">
          <Spinner />Finding pulls
        </p>{:else if !available.length && !error}<p class="py-8 text-center text-sm text-ink-muted">
          {query.trim() ? 'No matching pulls' : 'No pulls to link'}
        </p>{/if}
      {#if cursor}<Button
          size="small"
          variant="ghost"
          block
          {loading}
          disabled={Boolean(linking)}
          onclick={() => search(true)}>Load more</Button
        >{/if}
    </div>
  </div>
  {#snippet actions()}<Button size="small" disabled={Boolean(linking)} onclick={closePicker}>Cancel</Button>{/snippet}
</Modal>
