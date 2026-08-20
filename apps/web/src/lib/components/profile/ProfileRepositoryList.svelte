<script lang="ts">
  import type { PublicProfileRepository } from '@marl/contracts';
  import BookOpen from 'lucide-svelte/icons/book-open';
  import ArrowUpRight from 'lucide-svelte/icons/arrow-up-right';
  import Time from '../Time.svelte';
  let { repositories, empty = 'No public repositories yet.' } = $props<{ repositories: PublicProfileRepository[]; empty?: string }>();
</script>

<div class="repositories">
  {#each repositories as repository}
    <a href="/{repository.owner}/{repository.name}"><BookOpen size={16} /><span><strong>{repository.name}</strong><p>{repository.description || 'No description yet.'}</p><small>{repository.defaultBranch} · Updated <Time value={repository.updatedAt} /></small></span><ArrowUpRight size={14} /></a>
  {:else}<p class="empty">{empty}</p>{/each}
</div>

<style>
  .repositories{border-top:1px solid var(--border)}.repositories>a{display:grid;grid-template-columns:24px minmax(0,1fr) 16px;align-items:start;gap:9px;padding:15px 4px;border-bottom:1px solid var(--border-subtle);color:var(--text-faint);text-decoration:none}.repositories>a:hover{background:var(--surface-hover);color:var(--brand)}.repositories span{min-width:0}.repositories strong{display:block;color:var(--text-strong);font-size:12px}.repositories p{overflow:hidden;margin:4px 0;color:var(--text-muted);font-size:10px;text-overflow:ellipsis;white-space:nowrap}.repositories small{display:flex;align-items:center;gap:3px;color:var(--text-faint);font-size:9px}.repositories small :global(time){font-size:inherit}.empty{margin:0;padding:20px 4px;border-bottom:1px solid var(--border-subtle);color:var(--text-faint);font-size:10px}
</style>
