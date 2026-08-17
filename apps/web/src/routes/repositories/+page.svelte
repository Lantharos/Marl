<script lang="ts">
  import type { RepositorySummary } from '@sty/contracts';
  import Lock from 'lucide-svelte/icons/lock';
  import FilterBar from '$lib/components/FilterBar.svelte';
  import PageHeader from '$lib/components/PageHeader.svelte';
  import Time from '$lib/components/Time.svelte';
  import type { PageData } from './$types';
  let { data } = $props<{ data: PageData }>();
  const items = $derived(data.repositories as RepositorySummary[]);
  let query = $state('');
  let activeFilter = $state('All');
  const filteredItems = $derived(items.filter((repository) => {
    const matchesFilter = activeFilter === 'All' || repository.visibility === activeFilter.toLowerCase();
    const haystack = `${repository.owner}/${repository.name} ${repository.description}`.toLowerCase();
    return matchesFilter && haystack.includes(query.trim().toLowerCase());
  }));

</script>

<svelte:head><title>Repositories · Sty</title></svelte:head>
<main class="page">
  <PageHeader title="Repositories" description="The projects you own and collaborate on." actionHref="/repositories/new" actionLabel="New repository" />
  <FilterBar placeholder="Find a repository" tabs={['All', 'Public', 'Private']} bind:active={activeFilter} bind:query />
  <section class="list" aria-label="Repositories">
    {#each filteredItems as repository}
      <a class="row" href="/{repository.owner}/{repository.name}"><span class="avatar">{repository.name[0].toLowerCase()}</span><span class="main"><strong><i>{repository.owner}/</i>{repository.name}</strong><p>{repository.description || 'No description yet.'}</p><small><Lock size={9} />{repository.visibility}</small></span><Time value={repository.updatedAt} /></a>
    {:else}<div class="empty"><strong>No matching repositories</strong><p>Try a different name or visibility.</p></div>{/each}
  </section>
</main>

<style>
  .page{width:min(1060px,calc(100% - 56px));margin:0 auto;padding:48px 0 72px}.row{display:grid;grid-template-columns:34px minmax(0,1fr) auto;align-items:center;gap:12px;min-height:78px;padding:11px 4px;border-bottom:1px solid var(--border-subtle);color:inherit;text-decoration:none}.row:hover{background:var(--surface-hover)}.avatar{display:grid;width:31px;height:31px;place-items:center;border-radius:7px;background:var(--surface-muted);color:var(--text-muted);font-family:monospace;font-size:12px;font-weight:700}.main{min-width:0}.main strong{color:var(--text-strong);font-size:11px;font-weight:650}.main strong i{color:var(--text-faint);font-style:normal;font-weight:500}.main p{overflow:hidden;margin:4px 0;color:var(--text-muted);font-size:10px;text-overflow:ellipsis;white-space:nowrap}.main small{display:flex;align-items:center;gap:4px;color:var(--text-faint);font-size:9px;text-transform:capitalize}time{color:var(--text-faint);font-size:9px}.empty{padding:50px 4px;color:var(--text-muted);text-align:center}.empty strong{color:var(--text-strong);font-size:12px}.empty p{margin:6px 0 13px;font-size:10px}@media(max-width:680px){.page{width:calc(100% - 28px);padding-top:32px}time{display:none}}
</style>
