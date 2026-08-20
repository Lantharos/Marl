<script lang="ts">
  import GitCommit from 'lucide-svelte/icons/git-commit-horizontal';
  import Time from '../Time.svelte';
  import UserProfileLink from '../UserProfileLink.svelte';
  type Activity = { id: string; title: string; authoredAt: string; owner?: string; repository: string; author?: string | null; authorDisplayName?: string | null };
  let { activity, owner = '' } = $props<{ activity: Activity[]; owner?: string }>();
</script>

<div class="activity">
  {#each activity as item}
    <article><span class="mark"><GitCommit size={14} /></span><span><a class="commit-title" href="/{item.owner || owner}/{item.repository}/commit/{item.id}">{item.title}</a><small>{#if item.author}<UserProfileLink handle={item.author} displayName={item.authorDisplayName || item.author} avatar={false} /> · {/if}{item.owner ? `${item.owner}/` : ''}{item.repository} · <Time value={item.authoredAt} /></small></span><code>{item.id.slice(0, 7)}</code></article>
  {:else}<p>No public activity yet.</p>{/each}
</div>

<style>
  .activity{border-top:1px solid var(--border)}.activity>article{position:relative;display:grid;grid-template-columns:28px minmax(0,1fr) auto;align-items:center;gap:9px;min-height:55px;padding:8px 4px;border-bottom:1px solid var(--border-subtle);color:inherit}.activity>article:hover{background:var(--surface-hover)}.mark{display:grid;width:26px;height:26px;place-items:center;border-radius:50%;background:var(--surface-muted);color:var(--text-faint)}.activity .commit-title,.activity small{display:block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.activity .commit-title{color:var(--text-strong);font-size:10px;font-weight:650;text-decoration:none}.activity .commit-title::after{position:absolute;z-index:0;inset:0;content:''}.activity small{display:flex;align-items:center;gap:3px;margin-top:3px;color:var(--text-faint);font-size:9px}.activity small :global(.user-profile-link){position:relative;z-index:1;color:var(--text-muted);font-size:9px}.activity small :global(time){font-size:inherit}.activity code{color:var(--text-faint);font-size:9px}.activity>p{margin:0;padding:20px 4px;border-bottom:1px solid var(--border-subtle);color:var(--text-faint);font-size:10px}
</style>
