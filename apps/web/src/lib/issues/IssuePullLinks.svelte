<script lang="ts">
  import type { LinkedWorkItem, PullRequestSummary } from '@marl/contracts';
  import GitMerge from 'lucide-svelte/icons/git-merge';
  import GitPullRequest from 'lucide-svelte/icons/git-pull-request';
  import Link from 'lucide-svelte/icons/link';
  import Search from 'lucide-svelte/icons/search';
  import { api, MarlApiError } from '$lib/api';
  import Button from '$lib/components/Button.svelte';
  import Modal from '$lib/components/Modal.svelte';
  import WorkItemLinks from '$lib/components/WorkItemLinks.svelte';

  let { items, context, canLink, onLink } = $props<{
    items: LinkedWorkItem[];
    context: { owner: string; repository: string };
    canLink: boolean;
    onLink: (pullNumber: number) => Promise<boolean>;
  }>();
  let open = $state(false);
  let query = $state('');
  let results = $state.raw<PullRequestSummary[]>([]);
  let cursor = $state<string | null>(null);
  let loading = $state(false);
  let linking = $state<string | null>(null);
  let error = $state('');
  let controller: AbortController | undefined;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const available = $derived(results.filter((pull) => !items.some((item: LinkedWorkItem) => item.kind === 'pull' && item.id === pull.id)));
  const endpoint = $derived(`/repositories/${encodeURIComponent(context.owner)}/${encodeURIComponent(context.repository)}/pulls`);

  async function search(append = false) {
    controller?.abort();
    const request = new AbortController();
    controller = request;
    loading = true;
    error = '';
    try {
      const params = new URLSearchParams({ state: 'all', limit: '20', q: query.trim() });
      if (append && cursor) params.set('cursor', cursor);
      const result = await api<{ pullRequests: PullRequestSummary[]; nextCursor: string | null }>(`${endpoint}?${params}`, { signal: request.signal });
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
    } finally { linking = null; }
  }
</script>

{#if items.length || canLink}<WorkItemLinks {items} {context}>
  {#snippet actions()}{#if canLink}<Button size="small" variant="ghost" class="link-pull" onclick={openPicker}><Link size={13} />Link a pull</Button>{/if}{/snippet}
</WorkItemLinks>{/if}

<Modal {open} title="Link a pull" --modal-width="560px" onClose={closePicker}>
  <div class="pull-search" {@attach () => cancelSearch}>
    <label><Search size={16} /><input value={query} oninput={(event) => updateQuery(event.currentTarget.value)} disabled={Boolean(linking)} placeholder="Search by title or number" aria-label="Find a pull" /></label>
    {#if error}<p class="error" role="alert">{error}<Button size="small" variant="ghost" onclick={() => search()}>Retry</Button></p>{/if}
    <div class="results" aria-busy={loading}>
      {#each available as pull (pull.id)}
        <Button variant="ghost" block class="pull-option" disabled={Boolean(linking)} loading={linking === pull.id} onclick={() => link(pull)}>
          <span class="state {pull.state}">{#if pull.state === 'merged'}<GitMerge size={17} />{:else}<GitPullRequest size={17} />{/if}</span>
          <span><strong>{pull.title}</strong><small>!{pull.number}<span>{pull.sourceBranch}</span></small></span>
        </Button>
      {/each}
      {#if loading && !results.length}<p class="empty">Finding pulls…</p>{:else if !available.length && !error}<p class="empty">{query.trim() ? 'No matching pulls.' : 'No pulls to link.'}</p>{/if}
      {#if cursor}<Button size="small" variant="ghost" block loading={loading} disabled={Boolean(linking)} onclick={() => search(true)}>Load more</Button>{/if}
    </div>
  </div>
  {#snippet actions()}<Button size="small" disabled={Boolean(linking)} onclick={closePicker}>Cancel</Button>{/snippet}
</Modal>

<style>
  :global(.link-pull.button){gap:5px;margin-right:-8px;padding-inline:7px;font-size:11px}
  .pull-search>label{display:flex;align-items:center;gap:10px;min-height:44px;padding:0 12px;border-radius:9px;background:var(--surface);box-shadow:var(--shadow-surface);color:var(--text-faint)}
  input{width:100%;min-width:0;border:0;background:transparent;color:var(--text-strong);outline:0;font-size:13px}
  .pull-search>label:focus-within{outline:2px solid var(--brand);outline-offset:2px}
  .results{display:grid;gap:3px;max-height:340px;min-height:120px;margin:14px -4px -8px;overflow-y:auto;align-content:start;scrollbar-gutter:stable}
  :global(.pull-option.button){height:auto;min-height:60px;justify-content:flex-start;align-items:flex-start;gap:10px;padding:10px;border-radius:9px;text-align:left;white-space:normal}
  :global(.pull-option.button>span:last-child){min-width:0}
  .state{display:flex;align-items:center;height:21px;color:var(--success)}
  .state.draft,.state.closed{color:var(--text-faint)}
  .state.merged{color:var(--merged,#9670d1)}
  strong{display:-webkit-box;overflow:hidden;line-clamp:2;-webkit-line-clamp:2;-webkit-box-orient:vertical;color:var(--text-strong);font-size:13px;font-weight:600;line-height:1.5}
  small{display:flex;gap:10px;margin-top:4px;color:var(--text-faint);font-size:11px;line-height:1.5}
  small>span{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
  .empty{margin:0;padding:34px 12px;text-align:center;color:var(--text-muted);font-size:13px}
  .error{display:flex;align-items:center;justify-content:space-between;gap:10px;color:var(--danger);font-size:12px}
</style>
