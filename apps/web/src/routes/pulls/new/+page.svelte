<script lang="ts">
  import { goto } from '$app/navigation';
  import { untrack } from 'svelte';
  import type { PullRequestDiff, RepositorySummary } from '@marl/contracts';
  import ArrowRight from 'lucide-svelte/icons/arrow-right';
  import CircleAlert from 'lucide-svelte/icons/circle-alert';
  import FileDiff from 'lucide-svelte/icons/file-diff';
  import Checkbox from '$lib/components/Checkbox.svelte';
  import FormShell from '$lib/components/FormShell.svelte';
  import Select from '$lib/components/Select.svelte';
  import { api, MarlApiError } from '$lib/api';
  import type { PageData } from './$types';

  type Branch = { name: string; commitId: string };
  let { data } = $props<{ data: PageData }>();
  let repositories = $state<RepositorySummary[]>(untrack(() => data.repositories));
  let branches = $state<Branch[]>(untrack(() => data.branches));
  let repository = $state(untrack(() => data.repository));
  let base = $state(untrack(() => data.base));
  let compare = $state(untrack(() => data.compare));
  let title = $state('');
  let body = $state('');
  let draft = $state(false);
  let comparison = $state<PullRequestDiff | null>(untrack(() => data.comparison));
  let comparing = $state(false);
  let creating = $state(false);
  let error = $state('');
  const repositoryOptions = $derived(repositories.map((repo) => ({ value: `${repo.owner}/${repo.name}`, label: `${repo.owner}/${repo.name}`, description: repo.description })));
  const baseOptions = $derived(branches.map((branch) => ({ value: branch.name, label: branch.name, description: branch.commitId.slice(0, 7) })));
  const compareOptions = $derived(branches.filter((branch) => branch.name !== base).map((branch) => ({ value: branch.name, label: branch.name, description: branch.commitId.slice(0, 7) })));

  function repoParts() {
    const [owner, ...name] = repository.split('/');
    return { owner, name: name.join('/') };
  }

  async function loadBranches() {
    if (!repository) return;
    const { owner, name } = repoParts();
    comparison = null; error = '';
    try {
      const result = await api<{ defaultBranch: string; branches: Branch[] }>(`/repositories/${owner}/${name}/branches`);
      branches = result.branches;
      base = result.defaultBranch;
      compare = branches.find((branch) => branch.name !== base)?.name ?? '';
      await loadComparison();
    } catch (cause) { error = cause instanceof MarlApiError ? cause.message : 'Branches could not be loaded.'; }
  }

  async function loadComparison() {
    comparison = null;
    if (!repository || !base || !compare || base === compare) return;
    comparing = true; error = '';
    const { owner, name } = repoParts();
    try { comparison = await api<PullRequestDiff>(`/repositories/${owner}/${name}/compare?base=${encodeURIComponent(base)}&head=${encodeURIComponent(compare)}`); }
    catch (cause) { error = cause instanceof MarlApiError ? cause.message : 'These branches could not be compared.'; }
    finally { comparing = false; }
  }

  async function createPull() {
    if (!title.trim() || !comparison || creating) return;
    creating = true; error = '';
    const { owner, name } = repoParts();
    try {
      const result = await api<{ pullRequest: { number: number } }>(`/repositories/${owner}/${name}/pulls`, { method: 'POST', body: JSON.stringify({ title, body, sourceBranch: compare, targetBranch: base, draft }) });
      await goto(`/${owner}/${name}/pulls/${result.pullRequest.number}`);
    } catch (cause) { error = cause instanceof MarlApiError ? cause.message : 'Pull request could not be created.'; creating = false; }
  }

</script>

<svelte:head><title>New pull request · Marl</title></svelte:head>

<FormShell title="Open a pull request" description="Compare live Git branches, describe the change, then open it for review.">
  {#if error}<div class="error" role="alert"><CircleAlert size={15} />{error}</div>{/if}
  {#if repositories.length === 0}
    <div class="empty"><strong>No repositories yet</strong><p>Create a repository and push branches before opening a pull request.</p><a href="/repositories/new">Create repository</a></div>
  {:else}
    <form class="form-grid" onsubmit={(event) => { event.preventDefault(); createPull(); }}>
      <label class="field"><span>Repository</span><Select bind:value={repository} options={repositoryOptions} ariaLabel="Repository" onchange={loadBranches} /></label>
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
      <Checkbox bind:checked={draft} label="Open as draft" description="Mark this pull request as not ready to merge." />
      <div class="form-actions"><a href="/pulls">Cancel</a><button type="submit" disabled={!comparison || !title.trim() || creating}>{creating ? 'Opening…' : draft ? 'Open draft' : 'Open pull request'}</button></div>
    </form>
  {/if}
</FormShell>

<style>
  .compare{display:grid;grid-template-columns:1fr 18px 1fr;align-items:center;gap:10px}.compare>:global(svg){margin-top:18px;color:var(--text-faint)}.comparison{display:flex;min-height:42px;align-items:center;gap:8px;padding:0 12px;border-top:1px solid var(--border-subtle);border-bottom:1px solid var(--border-subtle);color:var(--text-muted);font-size:10px}.comparison.busy{opacity:.65}.comparison small{display:flex;gap:6px;margin-left:auto}.comparison b{color:var(--success)}.comparison i{color:var(--danger);font-style:normal}.field textarea{min-height:130px;resize:vertical}.error{display:flex;align-items:center;gap:7px;padding:10px 11px;border-left:2px solid var(--danger);background:var(--danger-soft);color:var(--danger);font-size:10px}.empty{padding:48px 20px;text-align:center}.empty strong{color:var(--text-strong);font-size:12px}.empty p{color:var(--text-faint);font-size:10px}.empty a{color:var(--brand);font-size:10px}
  @media(max-width:600px){.compare{grid-template-columns:1fr}.compare>:global(svg){display:none}.comparison{flex-wrap:wrap;padding-block:10px}}
</style>
