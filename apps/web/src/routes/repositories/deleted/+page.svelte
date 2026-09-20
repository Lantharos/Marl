<script lang="ts">
  import { invalidateAll } from '$app/navigation';
  import { api } from '$lib/api';
  import Button from '$lib/components/Button.svelte';
  import type { PageData } from './$types';
  let { data } = $props<{ data: PageData }>();
  let busy = $state('');
  let error = $state('');
  async function restore(owner: string, name: string) {
    busy = `${owner}/${name}`; error = '';
    try {
      await api(`/repositories/${encodeURIComponent(owner)}/${encodeURIComponent(name)}/settings/restore`, { method: 'POST' });
      await invalidateAll();
    } catch (reason) { error = reason instanceof Error ? reason.message : 'The repository could not be restored.'; }
    finally { busy = ''; }
  }
</script>
<svelte:head><title>Recently deleted · Marl</title></svelte:head>
<section><a href="/repositories">Back to repositories</a><h1>Recently deleted</h1><p>Restore repositories within 30 days of deletion. Code and discussions are kept until that period ends; cancelled runs stay cancelled.</p>
{#if error}<p role="alert">{error}</p>{/if}
{#each data.repositories as repository (`${repository.owner}/${repository.name}`)}
  <div class="repository"><div><strong>{repository.owner}/{repository.name}</strong><small>{repository.deletionStartedAt ? 'Permanently deleting' : `Recover before ${new Date(repository.deletionScheduledAt).toLocaleDateString()}`}</small></div><Button size="small" disabled={Boolean(busy) || Boolean(repository.deletionStartedAt) || Date.parse(repository.deletionScheduledAt) <= Date.now()} loading={busy === `${repository.owner}/${repository.name}`} onclick={() => restore(repository.owner, repository.name)}>Restore</Button></div>
{:else}<p>No recently deleted repositories.</p>{/each}
</section>
<style>
section{max-width:850px;margin:32px auto;padding:0 24px}section>a{color:var(--text-muted);font-size:13px}h1{color:var(--text-strong);font-size:24px}p{color:var(--text-muted);line-height:1.6}.repository{display:flex;align-items:center;justify-content:space-between;gap:20px;padding:20px 0;border-bottom:1px solid var(--border)}.repository>div{display:grid;gap:5px}small{color:var(--text-faint)}
</style>
