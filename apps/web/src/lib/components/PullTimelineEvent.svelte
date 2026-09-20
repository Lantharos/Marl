<script lang="ts">
  import type { PullRequestEvent } from '@marl/contracts';
  import Time from './Time.svelte';
  import UserProfileLink from './UserProfileLink.svelte';

  let { event, repository } = $props<{ event: PullRequestEvent; repository: { owner: string; name: string } }>();
  const commits = $derived.by(() => {
    if (event.kind !== 'head_updated') return [];
    try {
      const parsed: unknown = JSON.parse(event.details.commits ?? '[]');
      return Array.isArray(parsed) ? parsed.filter((commit): commit is { id: string; title: string } => Boolean(commit && typeof commit === 'object' && typeof commit.id === 'string' && typeof commit.title === 'string')) : [];
    } catch { return []; }
  });
  const message = $derived.by(() => {
    switch (event.kind) {
      case 'title_changed': return `changed the title from “${event.details.from}” to “${event.details.to}”`;
      case 'description_changed': return 'updated the description';
      case 'locked': return 'locked this conversation';
      case 'unlocked': return 'unlocked this conversation';
      case 'assigned': return `assigned ${event.details.handle}`;
      case 'unassigned': return `unassigned ${event.details.handle}`;
      case 'label_added': return `added the ${event.details.label} label`;
      case 'label_removed': return `removed the ${event.details.label} label`;
      case 'ready': return 'marked this pull ready for review';
      case 'closed': return 'closed this pull';
      case 'reopened': return 'reopened this pull';
      case 'merged': return `merged this pull with ${event.details.method}`;
      case 'commits_added': return 'uploaded a revision';
      case 'head_updated': return 'updated this revision';
      case 'force_pushed': return `force-pushed ${event.details.branch} from ${event.details.from} to ${event.details.to}`;
    }
  });

</script>

<article class="timeline-event {event.kind}">
  <span class="mark"></span>
  <div>
    <p><UserProfileLink handle={event.actor} displayName={event.actorDisplayName} avatar={false} /> {message}<Time class="end" value={event.createdAt} /></p>
    {#if commits.length}
      <div class="commits">{#each commits.slice(0, 3) as commit (commit.id)}<a href="/{repository.owner}/{repository.name}/commit/{encodeURIComponent(commit.id)}" title={commit.title}><code>{commit.id.slice(0, 7)}</code></a>{/each}{#if commits.length > 3}<span>+{commits.length - 3} more</span>{/if}</div>
    {/if}
  </div>
</article>

<style>
  .commits{display:flex;flex-wrap:wrap;align-items:center;gap:8px;margin-top:3px;font-size:11px}.commits a{color:var(--text-muted);text-decoration:none}.commits a:hover{color:var(--brand)}.commits span{color:var(--text-faint)}
  .timeline-event{display:grid;grid-template-columns:10px minmax(0,1fr);align-items:start;gap:9px;padding:5px 12px}.mark{width:5px;height:5px;margin-top:10px;border-radius:50%;background:var(--text-faint)}p{display:flex;flex-wrap:wrap;align-items:center;gap:3px;min-height:24px;margin:0;color:var(--text-muted);font-size:11px;line-height:1.45}p :global(.user-profile-link){font-size:11px;font-weight:650}.closed .mark,.force_pushed .mark{background:var(--danger)}.merged .mark,.commits_added .mark{background:var(--success)}.locked .mark{background:var(--warning)}
</style>
