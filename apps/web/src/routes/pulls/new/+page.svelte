<script lang="ts">
  import { goto } from '$app/navigation';
  import { untrack } from 'svelte';
  import type { PullRequestDiff, RepositorySummary } from '@marl/contracts';
  import ArrowRight from 'lucide-svelte/icons/arrow-right';
  import CircleAlert from 'lucide-svelte/icons/circle-alert';
  import FileDiff from 'lucide-svelte/icons/file-diff';
  import CircleDot from 'lucide-svelte/icons/circle-dot';
  import Checkbox from '$lib/components/Checkbox.svelte';
  import Button from '$lib/components/Button.svelte';
  import FormShell from '$lib/components/FormShell.svelte';
  import Select from '$lib/components/Select.svelte';
  import { api, MarlApiError } from '$lib/api';
  import type { PageData } from './$types';

  type Branch = { name: string; commitId: string };
  type PullSource = { owner: string; name: string; defaultBranch: string; branches: Branch[] };
  let { data } = $props<{ data: PageData }>();
  let repositories = $state<RepositorySummary[]>(untrack(() => data.repositories));
  let sources = $state<PullSource[]>(untrack(() => data.sources));
  let targetBranches = $state<Branch[]>(untrack(() => data.targetBranches));
  let sourceRepository = $state(untrack(() => data.sourceRepository));
  let repository = $state(untrack(() => data.repository));
  let base = $state(untrack(() => data.base));
  let compare = $state(untrack(() => data.compare));
  let title = $state(untrack(() => data.linkedIssue?.title ?? ''));
  let body = $state(untrack(() => data.linkedIssue ? `Fixes #${data.linkedIssue.number}\n\n` : ''));
  let draft = $state(false);
  let comparison = $state<PullRequestDiff | null>(untrack(() => data.comparison));
  let comparing = $state(false);
  let creating = $state(false);
  let error = $state('');
  let branchRequest = 0;
  let comparisonRequest = 0;
  const repositoryOptions = $derived(repositories.map((repo) => ({ value: `${repo.owner}/${repo.name}`, label: `${repo.owner}/${repo.name}`, description: repo.description })));
  const sourceOptions = $derived(sources.map((source) => ({ value: `${source.owner}/${source.name}`, label: `${source.owner}/${source.name}`, description: `${source.branches.length} branches` })));
  const sourceBranches = $derived(sources.find((source) => `${source.owner}/${source.name}` === sourceRepository)?.branches ?? []);
  const baseOptions = $derived(targetBranches.map((branch) => ({ value: branch.name, label: branch.name, description: branch.commitId.slice(0, 7) })));
  const compareOptions = $derived(sourceBranches.filter((branch) => sourceRepository !== repository || branch.name !== base).map((branch) => ({ value: branch.name, label: branch.name, description: branch.commitId.slice(0, 7) })));

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
    comparison = null; error = '';
    try {
      const result = await api<{ target: { defaultBranch: string; branches: Branch[] }; sources: PullSource[] }>(`/repositories/${owner}/${name}/pull-sources`);
      if (request !== branchRequest || requestedRepository !== repository) return;
      const nextSourceRepository = result.sources.some((source) => `${source.owner}/${source.name}` === requestedRepository)
        ? requestedRepository
        : result.sources[0] ? `${result.sources[0].owner}/${result.sources[0].name}` : '';
      const nextSource = result.sources.find((source) => `${source.owner}/${source.name}` === nextSourceRepository);
      const nextBase = result.target.defaultBranch;
      sources = result.sources;
      targetBranches = result.target.branches;
      sourceRepository = nextSourceRepository;
      base = nextBase;
      compare = nextSource?.branches.find((branch) => nextSourceRepository !== requestedRepository || branch.name !== nextBase)?.name ?? '';
      await loadComparison();
    } catch (cause) {
      if (request === branchRequest) error = cause instanceof MarlApiError ? cause.message : 'Branches could not be loaded.';
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
    comparing = true; error = '';
    const { owner, name } = repoParts();
    try {
      const result = await api<PullRequestDiff>(`/repositories/${owner}/${name}/compare?base=${encodeURIComponent(requested.base)}&head=${encodeURIComponent(requested.compare)}&sourceRepository=${encodeURIComponent(requested.sourceRepository)}`);
      if (request === comparisonRequest && requested.repository === repository && requested.sourceRepository === sourceRepository && requested.base === base && requested.compare === compare) comparison = result;
    } catch (cause) {
      if (request === comparisonRequest) error = cause instanceof MarlApiError ? cause.message : 'These branches could not be compared.';
    } finally {
      if (request === comparisonRequest) comparing = false;
    }
  }

  async function createPull() {
    if (!title.trim() || !comparison || creating) return;
    creating = true; error = '';
    const { owner, name } = repoParts();
    try {
      const result = await api<{ pullRequest: { number: number } }>(`/repositories/${owner}/${name}/pulls`, { method: 'POST', body: JSON.stringify({ title, body, sourceRepository, sourceBranch: compare, targetBranch: base, draft }) });
      await goto(`/${owner}/${name}/pulls/${result.pullRequest.number}`);
    } catch (cause) { error = cause instanceof MarlApiError ? cause.message : 'Pull could not be created.'; creating = false; }
  }

</script>

<svelte:head><title>New pull · Marl</title></svelte:head>

<FormShell title="Open a pull" backHref="/pulls" backLabel="Pulls">
  {#if error}<div class="error" role="alert"><CircleAlert size={15} />{error}</div>{/if}
  {#if repositories.length === 0}
    <div class="empty"><strong>No repositories yet</strong><p>Create a repository and push branches before opening a pull.</p><a href="/repositories/new">Create repository</a></div>
  {:else}
    <form class="form-grid" onsubmit={(event) => { event.preventDefault(); createPull(); }}>
      {#if data.linkedIssue}
        <a class="issue-context" href="/{data.linkedIssue.repository.owner}/{data.linkedIssue.repository.name}/issues/{data.linkedIssue.number}">
          <CircleDot size={15} /><span><small>Moving issue #{data.linkedIssue.number} forward</small><strong>{data.linkedIssue.title}</strong></span>
        </a>
      {/if}
      <label class="field"><span>Repository</span><Select bind:value={repository} options={repositoryOptions} ariaLabel="Repository" onchange={loadBranches} /></label>
      <label class="field"><span>Source repository</span><Select bind:value={sourceRepository} options={sourceOptions} ariaLabel="Source repository" onchange={loadSource} /></label>
      <div class="compare">
        <label class="field"><span>Base branch</span><Select bind:value={base} options={baseOptions} ariaLabel="Base branch" onchange={loadComparison} /></label>
        <ArrowRight size={17} />
        <label class="field"><span>Compare branch</span><Select bind:value={compare} options={compareOptions} ariaLabel="Compare branch" onchange={loadComparison} /></label>
      </div>
      <div class="comparison" class:busy={comparing}>
        <FileDiff size={15} /><span>{comparing ? 'Building comparison…' : comparison ? `${comparison.files.length} changed ${comparison.files.length === 1 ? 'file' : 'files'}` : 'Choose two branches with changes'}</span>
        {#if comparison}<small><b>+{comparison.files.reduce((sum, file) => sum + file.additions, 0)}</b><i>−{comparison.files.reduce((sum, file) => sum + file.deletions, 0)}</i></small>{/if}
      </div>
      <label class="field"><span>Title</span><input bind:value={title} maxlength="240" required placeholder="What changes, and why?" /></label>
      <label class="field"><span>Description</span><textarea bind:value={body} maxlength="100000" placeholder="Give reviewers the context they need."></textarea></label>
      <Checkbox bind:checked={draft} label="Open as draft" description="Keep this pull out of the landing queue until it is ready." />
      <div class="form-actions"><a href="/pulls">Cancel</a><Button type="submit" variant="primary" loading={creating} disabled={!comparison || !title.trim()}>{draft ? 'Open draft' : 'Open pull'}</Button></div>
    </form>
  {/if}
</FormShell>

<style>
  .issue-context{display:grid;grid-template-columns:24px minmax(0,1fr);align-items:center;gap:8px;padding:6px 2px 10px;color:var(--success);text-decoration:none}.issue-context:hover strong{color:var(--brand)}.issue-context small,.issue-context strong{display:block}.issue-context small{color:var(--text-faint);font-size:11px}.issue-context strong{margin-top:2px;overflow:hidden;color:var(--text-strong);font-size:11px;font-weight:650;text-overflow:ellipsis;white-space:nowrap}.compare{display:grid;grid-template-columns:1fr 18px 1fr;align-items:center;gap:10px}.compare>:global(svg){margin-top:18px;color:var(--text-faint)}.comparison{display:flex;min-height:42px;align-items:center;gap:8px;padding:0 2px;color:var(--text-muted);font-size:11px}.comparison.busy{opacity:.65}.comparison small{display:flex;gap:6px;margin-left:auto}.comparison b{color:var(--success)}.comparison i{color:var(--danger);font-style:normal}.field textarea{min-height:130px;resize:vertical}.error{display:flex;align-items:center;gap:7px;padding:10px 11px;border-radius:8px;background:var(--danger-soft);color:var(--danger);font-size:11px}.empty{padding:48px 20px;text-align:center}.empty strong{color:var(--text-strong);font-size:12px}.empty p{color:var(--text-faint);font-size:11px}.empty a{color:var(--brand);font-size:11px}
  @media(max-width:600px){.compare{grid-template-columns:1fr}.compare>:global(svg){display:none}.comparison{flex-wrap:wrap;padding-block:10px}}
</style>
