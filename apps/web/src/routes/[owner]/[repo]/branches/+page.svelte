<script lang="ts">
  import { page } from '$app/state';
  import { untrack } from 'svelte';
  import GitBranch from '@lucide/svelte/icons/git-branch';
  import GitPullRequestArrow from '@lucide/svelte/icons/git-pull-request-arrow';
  import Trash2 from '@lucide/svelte/icons/trash';
  import { api, MarlApiError } from '$lib/api';
  import Button from '$lib/components/controls/Button.svelte';
  import LinkButton from '$lib/components/controls/LinkButton.svelte';
  import SearchField from '$lib/components/controls/SearchField.svelte';
  import ConfirmDialog from '$lib/components/overlays/ConfirmDialog.svelte';
  import PageHeader from '$lib/components/page/PageHeader.svelte';
  import Seo from '$lib/components/page/Seo.svelte';
  import Time from '$lib/components/page/Time.svelte';
  import { encodeRevision } from '$lib/repositories/repository-path';
  import type { PageData } from './$types';

  type Branch = PageData['branches'][number];

  let { data }: { data: PageData } = $props();
  const owner = $derived(page.params.owner ?? '');
  const repo = $derived(page.params.repo ?? '');
  let branches = $state(untrack(() => data.branches));
  let query = $state('');
  let deleting = $state<Branch | null>(null);
  let busy = $state(false);
  let error = $state('');
  const visible = $derived(branches.filter((branch) => branch.name.toLowerCase().includes(query.trim().toLowerCase())));

  $effect(() => {
    branches = data.branches;
  });

  async function deleteBranch() {
    if (!deleting || busy) return;
    const branch = deleting;
    busy = true;
    error = '';
    try {
      await api(`/repositories/${owner}/${repo}/branches/${encodeURIComponent(branch.name)}`, {
        method: 'DELETE',
        body: JSON.stringify({ expectedCommitId: branch.commitId })
      });
      branches = branches.filter((item) => item.name !== branch.name);
      deleting = null;
    } catch (cause) {
      error = cause instanceof MarlApiError ? cause.message : 'The branch could not be deleted.';
    } finally {
      busy = false;
    }
  }

  function compareHref(branch: string) {
    const repository = `${owner}/${repo}`;
    return `/pulls/new?${new URLSearchParams({ repository, sourceRepository: repository, base: data.defaultBranch, compare: branch })}`;
  }
</script>

<Seo
  title={`Branches · ${owner}/${repo} · Marl`}
  description={`Browse branches and active lines of work for ${owner}/${repo} on Marl.`}
  path={page.url.pathname}
  robots={data.repository.visibility === 'public' ? 'index, follow' : 'noindex, nofollow'}
/>
<PageHeader title="Branches">
  {#snippet action()}<SearchField
      label="Find a branch"
      bind:value={query}
      class="w-full sm:w-64"
      data-1p-ignore
    />{/snippet}
</PageHeader>

<div class="surface p-1.5">
  {#each visible as branch (branch.name)}
    <article
      class="grid grid-cols-[32px_minmax(0,1fr)_auto] items-center gap-3 rounded-lg px-3 py-3 transition-colors hover:bg-surface-hover"
    >
      <span
        class={[
          'grid size-8 place-items-center rounded-lg',
          branch.name === data.defaultBranch ? 'bg-brand-soft text-brand' : 'bg-surface-muted text-ink-muted'
        ]}><GitBranch size={16} /></span
      >
      <div class="min-w-0">
        <div class="flex min-w-0 items-center gap-2">
          <a
            class="truncate font-mono text-sm font-semibold text-ink-strong hover:text-brand"
            href="/{owner}/{repo}/tree/{encodeRevision(branch.name)}">{branch.name}</a
          >
          {#if branch.name === data.defaultBranch}<span
              class="rounded-full bg-brand-soft px-2 py-0.5 text-2xs font-semibold text-brand">Default</span
            >{/if}
        </div>
        <p class="mt-1 flex min-w-0 items-center gap-1.5 text-xs text-ink-muted">
          <a class="font-mono hover:text-brand" href="/{owner}/{repo}/commit/{branch.commitId}"
            >{branch.commitId.slice(0, 7)}</a
          >
          <span class="min-w-0 truncate">{branch.title}</span><span aria-hidden="true">·</span><Time
            value={branch.updatedAt}
            class="shrink-0 text-ink-muted"
          />
        </p>
      </div>
      <div class="flex items-center gap-1">
        {#if branch.name !== data.defaultBranch && data.shellUser}<LinkButton
            size="small"
            variant="ghost"
            href={compareHref(branch.name)}
            ><GitPullRequestArrow size={14} /><span class="max-sm:hidden">Compare</span></LinkButton
          >{/if}
        {#if branch.canDelete}<Button
            icon
            size="small"
            variant="ghost"
            aria-label={`Delete branch ${branch.name}`}
            onclick={() => {
              error = '';
              deleting = branch;
            }}><Trash2 size={15} /></Button
          >{/if}
      </div>
    </article>
  {:else}
    <p class="px-3 py-10 text-center text-sm text-ink-muted">
      {query ? 'No matching branches' : 'This repository has no branches yet.'}
    </p>
  {/each}
</div>

<ConfirmDialog
  open={deleting !== null}
  title="Delete branch?"
  confirmLabel="Delete branch"
  {busy}
  {error}
  onConfirm={deleteBranch}
  onClose={() => (deleting = null)}
>
  <code class="font-mono text-ink-strong">{deleting?.name}</code> will be removed from the repository. Existing pull discussions
  and pinned revisions stay intact.
</ConfirmDialog>
