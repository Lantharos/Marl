<script lang="ts">
  import type { PublicProfileRepository } from '@marl/contracts';
  import ArrowUpRight from 'lucide-svelte/icons/arrow-up-right';
  import Time from '../Time.svelte';
  import RepositoryIcon from '../RepositoryIcon.svelte';
  let { repositories, empty = 'No public repositories yet.' } = $props<{ repositories: PublicProfileRepository[]; empty?: string }>();
</script>

<div class="repositories">
  {#each repositories as repository (repository.id)}
    <a href="/{repository.owner}/{repository.name}"><RepositoryIcon name={repository.name} src={repository.iconUrl} size={24} /><span><strong>{repository.name}</strong><p>{repository.description || ''}</p><small>{repository.defaultBranch} · Updated <Time value={repository.updatedAt} /></small></span><ArrowUpRight size={14} /></a>
  {:else}<p class="empty">{empty}</p>{/each}
</div>

<style>
  .repositories{padding:6px;border-radius:12px;background:var(--surface)}.repositories>a{display:grid;grid-template-columns:24px minmax(0,1fr) 16px;align-items:start;gap:9px;padding:16px 12px;border-radius:8px;color:var(--text-faint);text-decoration:none}.repositories>a:hover{background:var(--surface-hover);color:var(--brand)}.repositories span{min-width:0}.repositories strong{display:block;color:var(--text-strong);font-size:13px}.repositories p:empty{display:none}.repositories p{overflow:hidden;margin:4px 0;color:var(--text-muted);font-size:11px;text-overflow:ellipsis;white-space:nowrap}.repositories small{display:flex;flex-wrap:wrap;align-items:center;gap:3px;color:var(--text-faint);font-size:11px}.repositories small :global(time){font-size:inherit}.empty{margin:0;padding:20px 12px;color:var(--text-faint);font-size:11px}
</style>
