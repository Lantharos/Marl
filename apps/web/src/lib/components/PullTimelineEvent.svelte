<script lang="ts">
  import type { PullRequestEvent } from '@marl/contracts';
  import Time from './Time.svelte';
  import UserProfileLink from './UserProfileLink.svelte';

  type TimelineCommit = { id: string; title: string };
  let { event } = $props<{ event: PullRequestEvent }>();
  const commits = $derived(parseCommits(event));
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
      case 'commits_added': return `added ${commits.length} commit${commits.length === 1 ? '' : 's'}`;
      case 'force_pushed': return `force-pushed ${event.details.branch} from ${event.details.from} to ${event.details.to}`;
      case 'thread_resolved': return `resolved a conversation on ${event.details.path}:${event.details.lines}`;
      case 'thread_reopened': return `reopened a conversation on ${event.details.path}:${event.details.lines}`;
    }
  });

  function parseCommits(value: PullRequestEvent): TimelineCommit[] {
    if (value.kind !== 'commits_added') return [];
    try {
      const parsed = JSON.parse(value.details.commits ?? '[]') as unknown;
      return Array.isArray(parsed) ? parsed.filter((commit): commit is TimelineCommit => Boolean(commit && typeof commit === 'object' && typeof (commit as TimelineCommit).id === 'string' && typeof (commit as TimelineCommit).title === 'string')) : [];
    } catch { return []; }
  }
</script>

<article class="timeline-event {event.kind}">
  <span class="mark"></span>
  <div>
    <p><UserProfileLink handle={event.actor} displayName={event.actorDisplayName} avatar={false} /> {message}<Time class="end" value={event.createdAt} /></p>
    {#if event.kind === 'commits_added' && commits.length}
      <div class="commits">{#each commits as commit (commit.id)}<a href="/{event.details.owner}/{event.details.repository}/commit/{commit.id}"><code>{commit.id.slice(0, 7)}</code><span>{commit.title}</span></a>{/each}</div>
    {/if}
  </div>
</article>

<style>
  .timeline-event{display:grid;grid-template-columns:10px minmax(0,1fr);align-items:start;gap:9px;padding:3px 5px}.mark{width:5px;height:5px;margin-top:10px;border-radius:50%;background:var(--text-faint)}p{display:flex;flex-wrap:wrap;align-items:center;gap:3px;min-height:24px;margin:0;color:var(--text-muted);font-size:10px;line-height:1.45}p :global(.user-profile-link){font-size:10px;font-weight:650}.commits{display:grid;gap:1px;margin-top:5px}.commits a{display:grid;grid-template-columns:57px minmax(0,1fr);align-items:center;gap:8px;min-height:29px;padding:0 7px;border-radius:5px;color:var(--text);text-decoration:none}.commits a:hover{background:var(--surface-hover)}.commits code{color:var(--brand);font-size:9px}.commits span{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:10px}.closed .mark,.force_pushed .mark{background:var(--danger)}.merged .mark,.commits_added .mark{background:var(--success)}.locked .mark{background:var(--warning)}
</style>
