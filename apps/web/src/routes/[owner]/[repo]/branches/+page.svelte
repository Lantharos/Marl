<script lang="ts">
  import { page } from '$app/stores';
  import { api, MarlApiError } from '$lib/api';
  import Button from '$lib/components/Button.svelte';
  import Modal from '$lib/components/Modal.svelte';
  import Trash2 from 'lucide-svelte/icons/trash-2';
  import GitBranch from 'lucide-svelte/icons/git-branch';
  import Search from 'lucide-svelte/icons/search';
  import Seo from '$lib/components/Seo.svelte';
  import Time from '$lib/components/Time.svelte';
  import { encodeRevision } from '$lib/repository-path';
  import type { PageData } from './$types';

  let { data } = $props<{ data: PageData }>();
  const owner = $derived($page.params.owner ?? '');
  const repo = $derived($page.params.repo ?? '');
  const base = $derived(`/${owner}/${repo}`);
  let query = $state('');
  type Branch = { name: string; commitId: string; commit: string; title: string; updatedAt: string; isDefault: boolean; canDelete: boolean };
  let items = $derived<Branch[]>(data.branches);
  let deleting = $state<Branch | null>(null);
  let busy = $state(false);
  let error = $state('');
  async function deleteBranch() {
    if (!deleting || busy) return;
    const branch = deleting;
    busy = true; error = '';
    try {
      await api(`/repositories/${owner}/${repo}/branches/${encodeURIComponent(branch.name)}`, { method: 'DELETE', body: JSON.stringify({ expectedCommitId: branch.commitId }) });
      items = items.filter((item) => item.name !== branch.name);
      deleting = null;
    } catch (cause) { error = cause instanceof MarlApiError ? cause.message : 'The branch could not be deleted.'; }
    finally { busy = false; }
  }
  const visible = $derived(items.filter((branch) => branch.name.toLowerCase().includes(query.toLowerCase())));

  function compareHref(branch: string) {
    const repository = `${owner}/${repo}`;
    return `/pulls/new?${new URLSearchParams({ repository, sourceRepository: repository, base: data.defaultBranch, compare: branch })}`;
  }
</script>

<Seo title={`Branches · ${owner}/${repo} · Marl`} description={`Browse branches and active lines of work for ${owner}/${repo} on Marl.`} path={$page.url.pathname} robots={data.repository.visibility === 'public' ? 'index, follow' : 'noindex, nofollow'} />
<header><h1>Branches</h1></header>
<label class="search"><Search size={14} /><input bind:value={query} placeholder="Find a branch" /></label>
<section class="list">
  {#each visible as branch (branch.name)}
    <div class="row"><span class="icon"><GitBranch size={16} /></span><span class="main"><a href="{base}/tree/{encodeRevision(branch.name)}">{branch.name}</a><small><code>{branch.commit}</code> {branch.title} · <Time value={branch.updatedAt} /></small></span><div class="row-actions">{#if branch.isDefault}<span class="default">Default</span>{:else if data.shellUser}<a class="compare" href={compareHref(branch.name)}>Compare</a>{/if}{#if branch.canDelete}<Button icon size="small" variant="ghost" aria-label={`Delete branch ${branch.name}`} onclick={() => { deleting = branch; error = ''; }}><Trash2 size={15} /></Button>{/if}</div></div>
  {/each}
</section>

<Modal open={Boolean(deleting)} title="Delete branch?" onClose={() => { if (!busy) deleting = null; }}>
  {#snippet children()}<p class="delete-copy"><code>{deleting?.name}</code> will be removed from the repository. Existing pull discussions and pinned revisions will stay.</p>{#if error}<p role="alert" class="error">{error}</p>{/if}{/snippet}
  {#snippet actions()}<Button size="small" disabled={busy} onclick={() => (deleting = null)}>Cancel</Button><Button variant="danger" size="small" loading={busy} onclick={deleteBranch}>Delete branch</Button>{/snippet}
</Modal>

<style>
  .row-actions{display:flex;align-items:center;gap:8px}.delete-copy{margin:0;font-size:14px;line-height:1.6}.delete-copy code{overflow-wrap:anywhere}.error{color:var(--danger);font-size:13px}
  header{margin-bottom:20px}h1{margin:0;color:var(--text-strong);font-size:22px;letter-spacing:-.025em}.search{display:flex;width:min(340px,100%);height:34px;align-items:center;gap:7px;margin-bottom:11px;padding:0 9px;border:1px solid var(--border);border-radius:7px;background:var(--surface);color:var(--text-faint)}input{flex:1;border:0;outline:0;background:transparent;color:var(--text-strong);font-size:11px}.list{overflow:hidden;border:1px solid var(--border);border-radius:9px;background:var(--surface)}.row{display:grid;grid-template-columns:32px minmax(0,1fr) auto;align-items:center;gap:11px;min-height:70px;padding:11px 14px;border-top:1px solid var(--border-subtle)}.row:first-child{border:0}.icon{display:grid;width:30px;height:30px;place-items:center;border-radius:7px;background:var(--brand-soft);color:var(--brand)}.main{min-width:0}.main a{color:var(--text-strong);font-size:12px;font-weight:650;text-decoration:none}.main a:hover{color:var(--brand)}.main small{display:block;overflow:hidden;margin-top:5px;color:var(--text-faint);font-size:11px;text-overflow:ellipsis;white-space:nowrap}code{color:var(--text-muted)}.default{padding:4px 7px;border-radius:99px;background:var(--surface-muted);color:var(--text-muted);font-size:11px;font-weight:620}.compare{padding:5px 8px;border:1px solid var(--border);border-radius:6px;color:var(--text-muted);font-size:11px;font-weight:620;text-decoration:none}
</style>
