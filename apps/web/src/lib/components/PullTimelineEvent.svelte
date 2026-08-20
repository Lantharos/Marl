<script lang="ts">
  import type { PullRequestEvent } from '@marl/contracts';
  import GitBranch from 'lucide-svelte/icons/git-branch';
  import GitCommitHorizontal from 'lucide-svelte/icons/git-commit-horizontal';
  import GitMerge from 'lucide-svelte/icons/git-merge';
  import GitPullRequest from 'lucide-svelte/icons/git-pull-request';
  import Lock from 'lucide-svelte/icons/lock';
  import Pencil from 'lucide-svelte/icons/pencil';
  import RotateCcw from 'lucide-svelte/icons/rotate-ccw';
  import Tag from 'lucide-svelte/icons/tag';
  import Unlock from 'lucide-svelte/icons/unlock';
  import UserRound from 'lucide-svelte/icons/user-round';
  import X from 'lucide-svelte/icons/x';
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
      case 'ready': return 'marked this pull request ready for review';
      case 'closed': return 'closed this pull request';
      case 'reopened': return 'reopened this pull request';
      case 'merged': return `merged this pull request with ${event.details.method}`;
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
  <span class="icon">{#if event.kind === 'locked'}<Lock size={14} />{:else if event.kind === 'unlocked'}<Unlock size={14} />{:else if event.kind.includes('label')}<Tag size={14} />{:else if event.kind.includes('assigned')}<UserRound size={14} />{:else if event.kind === 'title_changed' || event.kind === 'description_changed'}<Pencil size={14} />{:else if event.kind === 'merged'}<GitMerge size={14} />{:else if event.kind === 'commits_added'}<GitCommitHorizontal size={14} />{:else if event.kind === 'force_pushed'}<GitBranch size={14} />{:else if event.kind === 'closed'}<X size={14} />{:else if event.kind === 'reopened'}<RotateCcw size={14} />{:else}<GitPullRequest size={14} />{/if}</span>
  <div>
    <p><UserProfileLink handle={event.actor} displayName={event.actorDisplayName} avatar={false} /> {message}<Time class="end" value={event.createdAt} /></p>
    {#if event.kind === 'commits_added' && commits.length}
      <div class="commits">{#each commits as commit}<a href="/{event.details.owner}/{event.details.repository}/commit/{commit.id}"><code>{commit.id.slice(0, 7)}</code><span>{commit.title}</span></a>{/each}</div>
    {/if}
  </div>
</article>

<style>
  .timeline-event{display:grid;grid-template-columns:29px minmax(0,1fr);align-items:start;gap:9px;padding:2px 6px}.icon{display:grid;width:27px;height:27px;place-items:center;border-radius:50%;background:var(--surface-muted);color:var(--text-muted)}p{display:flex;align-items:center;gap:3px;min-height:27px;margin:0;color:var(--text-muted);font-size:10px;line-height:1.45}p :global(.user-profile-link){font-size:10px;font-weight:650}.commits{display:grid;overflow:hidden;margin-top:6px;border:1px solid var(--border-subtle);border-radius:6px;background:var(--surface)}.commits a{display:grid;grid-template-columns:62px minmax(0,1fr);align-items:center;gap:8px;min-height:34px;padding:0 10px;color:var(--text);text-decoration:none}.commits a+a{border-top:1px solid var(--border-subtle)}.commits a:hover{background:var(--surface-hover)}.commits code{color:var(--brand);font-size:9px}.commits span{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:10px}.closed .icon,.force_pushed .icon{background:var(--danger-soft);color:var(--danger)}.merged .icon{background:color-mix(in srgb,#8b5cf6 18%,transparent);color:#a78bfa}.locked .icon{background:var(--warning-soft);color:var(--warning)}.commits_added .icon{background:var(--success-soft);color:var(--success)}
</style>
