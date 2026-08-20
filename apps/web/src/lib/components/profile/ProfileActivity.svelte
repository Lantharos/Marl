<script lang="ts">
  import GitCommit from 'lucide-svelte/icons/git-commit-horizontal';
  import Time from '../Time.svelte';
  type Activity = { id: string; title: string; authoredAt: string; owner?: string; repository: string; author?: string | null };
  let { activity, owner = '' } = $props<{ activity: Activity[]; owner?: string }>();
</script>

<div class="activity">
  {#each activity as item}
    <a href="/{item.owner || owner}/{item.repository}/commit/{item.id}"><span class="mark"><GitCommit size={14} /></span><span><strong>{item.title}</strong><small>{item.author ? `${item.author} · ` : ''}{item.owner ? `${item.owner}/` : ''}{item.repository} · <Time value={item.authoredAt} /></small></span><code>{item.id.slice(0, 7)}</code></a>
  {:else}<p>No public activity yet.</p>{/each}
</div>

<style>
  .activity{border-top:1px solid var(--border)}.activity>a{display:grid;grid-template-columns:28px minmax(0,1fr) auto;align-items:center;gap:9px;min-height:55px;padding:8px 4px;border-bottom:1px solid var(--border-subtle);color:inherit;text-decoration:none}.activity>a:hover{background:var(--surface-hover)}.mark{display:grid;width:26px;height:26px;place-items:center;border-radius:50%;background:var(--surface-muted);color:var(--text-faint)}.activity strong,.activity small{display:block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.activity strong{color:var(--text-strong);font-size:10px}.activity small{margin-top:3px;color:var(--text-faint);font-size:9px}.activity small :global(time){font-size:inherit}.activity code{color:var(--text-faint);font-size:9px}.activity>p{margin:0;padding:20px 4px;border-bottom:1px solid var(--border-subtle);color:var(--text-faint);font-size:10px}
</style>
