<script lang="ts">
  import { goto } from '$app/navigation';
  import { untrack } from 'svelte';
  import type { PullRequestDiff, RepositorySummary } from '@marl/contracts';
  import ArrowRight from '@lucide/svelte/icons/arrow-right';
  import FolderGit2 from '@lucide/svelte/icons/folder-git-2';
  import FileDiff from '@lucide/svelte/icons/file-diff';
  import CircleDot from '@lucide/svelte/icons/circle-dot';
  import Checkbox from '$lib/components/controls/Checkbox.svelte';
  import Button from '$lib/components/controls/Button.svelte';
  import Field from '$lib/components/controls/Field.svelte';
  import LinkButton from '$lib/components/controls/LinkButton.svelte';
  import EmptyState from '$lib/components/feedback/EmptyState.svelte';
  import Notice from '$lib/components/feedback/Notice.svelte';
  import DiffStat from '$lib/code/DiffStat.svelte';
  import Spinner from '$lib/components/feedback/Spinner.svelte';
  import FormShell from '$lib/components/page/FormShell.svelte';
  import MarkdownComposer from '$lib/components/markdown/MarkdownComposer.svelte';
  import Select from '$lib/components/controls/Select.svelte';
  import { api, MarlApiError } from '$lib/api';
  import type { PageData } from './$types';

  type Branch = { name: string; commitId: string };
  type PullSource = { owner: string; name: string; defaultBranch: string; branches: Branch[] };
  let { data }: { data: PageData } = $props();
  let repositories = $state<RepositorySummary[]>(untrack(() => data.repositories));
  let sources = $state<PullSource[]>(untrack(() => data.sources));
  let targetBranches = $state<Branch[]>(untrack(() => data.targetBranches));
  let sourceRepository = $state(untrack(() => data.sourceRepository));
  let repository = $state(untrack(() => data.repository));
  let base = $state(untrack(() => data.base));
  let compare = $state(untrack(() => data.compare));
  let title = $state(untrack(() => data.linkedIssue?.title ?? ''));
  let body = $state(
    untrack(() =>
      data.linkedIssue
        ? `Fixes ${data.linkedIssue.repository.owner}/${data.linkedIssue.repository.name}#${data.linkedIssue.number}\n\n${data.linkedIssue.conclusion?.body ?? ''}`
        : ''
    )
  );
  let draft = $state(false);
  let comparison = $state<PullRequestDiff | null>(untrack(() => data.comparison));
  let comparing = $state(false);
  let creating = $state(false);
  let uploading = $state(false);
  const markdownContext = $derived(
    repository ? { owner: repository.split('/')[0], repository: repository.split('/')[1] } : undefined
  );
  let error = $state('');
  let branchRequest = 0;
  let comparisonRequest = 0;
  const repositoryOptions = $derived(
    repositories.map((repo) => ({
      value: `${repo.owner}/${repo.name}`,
      label: `${repo.owner}/${repo.name}`,
      description: repo.description
    }))
  );
  const sourceOptions = $derived(
    sources.map((source) => ({
      value: `${source.owner}/${source.name}`,
      label: `${source.owner}/${source.name}`,
      description: `${source.branches.length} branches`
    }))
  );
  const sourceBranches = $derived(
    sources.find((source) => `${source.owner}/${source.name}` === sourceRepository)?.branches ?? []
  );
  const baseOptions = $derived(
    targetBranches.map((branch) => ({
      value: branch.name,
      label: branch.name,
      description: branch.commitId.slice(0, 7)
    }))
  );
  const compareOptions = $derived(
    sourceBranches
      .filter((branch) => sourceRepository !== repository || branch.name !== base)
      .map((branch) => ({ value: branch.name, label: branch.name, description: branch.commitId.slice(0, 7) }))
  );

  function repoParts() {
    const [owner, ...name] = repository.split('/');
    return { owner, name: name.join('/') };
  }

  async function loadBranches() {
    if (!repository) return;
    const requestedRepository = repository;
    const request = ++branchRequest;
    comparisonRequest += 1;
    comparing = false;
    const { owner, name } = repoParts();
    comparison = null;
    error = '';
    try {
      const result = await api<{ target: { defaultBranch: string; branches: Branch[] }; sources: PullSource[] }>(
        `/repositories/${owner}/${name}/pull-sources`
      );
      if (request !== branchRequest || requestedRepository !== repository) return;
      const nextSourceRepository = result.sources.some(
        (source) => `${source.owner}/${source.name}` === requestedRepository
      )
        ? requestedRepository
        : result.sources[0]
          ? `${result.sources[0].owner}/${result.sources[0].name}`
          : '';
      const nextSource = result.sources.find((source) => `${source.owner}/${source.name}` === nextSourceRepository);
      const nextBase = result.target.defaultBranch;
      sources = result.sources;
      targetBranches = result.target.branches;
      sourceRepository = nextSourceRepository;
      base = nextBase;
      compare =
        nextSource?.branches.find((branch) => nextSourceRepository !== requestedRepository || branch.name !== nextBase)
          ?.name ?? '';
      await loadComparison();
    } catch (cause) {
      if (request === branchRequest)
        error = cause instanceof MarlApiError ? cause.message : 'Branches could not be loaded.';
    }
  }

  async function loadSource() {
    comparison = null;
    compare = sourceBranches.find((branch) => sourceRepository !== repository || branch.name !== base)?.name ?? '';
    await loadComparison();
  }

  async function loadComparison() {
    const request = ++comparisonRequest;
    comparison = null;
    if (!repository || !base || !compare || (sourceRepository === repository && base === compare)) {
      comparing = false;
      return;
    }
    const requested = { repository, sourceRepository, base, compare };
    comparing = true;
    error = '';
    const { owner, name } = repoParts();
    try {
      const result = await api<PullRequestDiff>(
        `/repositories/${owner}/${name}/compare?base=${encodeURIComponent(requested.base)}&head=${encodeURIComponent(requested.compare)}&sourceRepository=${encodeURIComponent(requested.sourceRepository)}`
      );
      if (
        request === comparisonRequest &&
        requested.repository === repository &&
        requested.sourceRepository === sourceRepository &&
        requested.base === base &&
        requested.compare === compare
      )
        comparison = result;
    } catch (cause) {
      if (request === comparisonRequest)
        error = cause instanceof MarlApiError ? cause.message : 'These branches could not be compared.';
    } finally {
      if (request === comparisonRequest) comparing = false;
    }
  }

  async function createPull() {
    if (!title.trim() || !comparison || creating || uploading) return;
    creating = true;
    error = '';
    const { owner, name } = repoParts();
    try {
      const result = await api<{ pullRequest: { number: number } }>(`/repositories/${owner}/${name}/pulls`, {
        method: 'POST',
        body: JSON.stringify({ title, body, sourceRepository, sourceBranch: compare, targetBranch: base, draft })
      });
      await goto(`/${owner}/${name}/pulls/${result.pullRequest.number}`);
    } catch (cause) {
      error = cause instanceof MarlApiError ? cause.message : 'Pull could not be created.';
      creating = false;
    }
  }
</script>

<svelte:head><title>New pull · Marl</title></svelte:head>

<FormShell title="Open a pull" backHref="/pulls" backLabel="Pulls">
  {#if error}<Notice class="mb-5">{error}</Notice>{/if}
  {#if repositories.length === 0}
    <EmptyState
      compact
      icon={FolderGit2}
      title="No repositories yet"
      description="Create a repository and push branches before opening a pull."
    >
      <LinkButton size="small" variant="primary" href="/repositories/new">Create repository</LinkButton>
    </EmptyState>
  {:else}
    <form
      class="grid gap-6"
      onsubmit={(event) => {
        event.preventDefault();
        createPull();
      }}
    >
      {#if data.linkedIssue}
        <a
          class="flex items-center gap-3 rounded-lg bg-brand-soft px-3.5 py-3 text-brand transition-colors hover:bg-brand-soft-strong"
          href="/{data.linkedIssue.repository.owner}/{data.linkedIssue.repository.name}/issues/{data.linkedIssue
            .number}"
        >
          <CircleDot size={16} class="shrink-0" />
          <span class="min-w-0">
            <span class="block text-xs">Moving issue #{data.linkedIssue.number} forward</span>
            <strong class="block truncate text-sm font-semibold text-ink-strong">{data.linkedIssue.title}</strong>
          </span>
        </a>
      {/if}
      <div class="grid gap-5 sm:grid-cols-2">
        <Field label="Repository"
          ><Select
            bind:value={repository}
            options={repositoryOptions}
            ariaLabel="Repository"
            onchange={loadBranches}
          /></Field
        >
        <Field label="Source repository"
          ><Select
            bind:value={sourceRepository}
            options={sourceOptions}
            ariaLabel="Source repository"
            onchange={loadSource}
          /></Field
        >
      </div>
      <div class="grid items-end gap-3 sm:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)]">
        <Field label="Base branch"
          ><Select bind:value={base} options={baseOptions} ariaLabel="Base branch" onchange={loadComparison} /></Field
        >
        <ArrowRight size={18} class="mb-3.5 hidden text-ink-faint sm:block" />
        <Field label="Compare branch"
          ><Select
            bind:value={compare}
            options={compareOptions}
            ariaLabel="Compare branch"
            onchange={loadComparison}
          /></Field
        >
      </div>
      <div
        class="flex min-h-11 items-center gap-2.5 rounded-lg bg-surface-muted px-3.5 text-sm text-ink-muted"
        aria-live="polite"
      >
        {#if comparing}<Spinner />{:else}<FileDiff size={16} />{/if}
        <span class="flex-1"
          >{comparing
            ? 'Building comparison'
            : comparison
              ? `${comparison.files.length} changed ${comparison.files.length === 1 ? 'file' : 'files'}`
              : 'Choose two branches with changes'}</span
        >
        {#if comparison}<DiffStat
            additions={comparison.files.reduce((sum, file) => sum + file.additions, 0)}
            deletions={comparison.files.reduce((sum, file) => sum + file.deletions, 0)}
          />{/if}
      </div>
      <Field label="Title"
        ><input class="field" bind:value={title} maxlength="240" required placeholder="What changes, and why?" /></Field
      >
      <div class="grid gap-2">
        <span class="text-sm font-semibold text-ink-strong">Description</span>
        <MarkdownComposer
          bind:value={body}
          bind:uploading
          context={markdownContext}
          minHeight={180}
          placeholder="Give reviewers the context they need."
        />
      </div>
      <Checkbox
        bind:checked={draft}
        label="Open as draft"
        description="Keep this pull out of the landing queue until it is ready."
      />
      <div class="flex flex-wrap justify-end gap-2">
        <LinkButton variant="ghost" href="/pulls">Cancel</LinkButton>
        <Button type="submit" variant="primary" loading={creating} disabled={uploading || !comparison || !title.trim()}
          >{draft ? 'Open draft' : 'Open pull'}</Button
        >
      </div>
    </form>
  {/if}
</FormShell>
