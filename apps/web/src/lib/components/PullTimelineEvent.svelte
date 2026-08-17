<script lang="ts">
  import type { PullRequestEvent } from '@sty/contracts';
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

  let { event } = $props<{ event: PullRequestEvent }>();
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
      case 'thread_resolved': return `resolved a conversation on ${event.details.path}:${event.details.lines}`;
      case 'thread_reopened': return `reopened a conversation on ${event.details.path}:${event.details.lines}`;
    }
  });
</script>

<article class="timeline-event {event.kind}">
  <span class="icon">{#if event.kind === 'locked'}<Lock size={14} />{:else if event.kind === 'unlocked'}<Unlock size={14} />{:else if event.kind.includes('label')}<Tag size={14} />{:else if event.kind.includes('assigned')}<UserRound size={14} />{:else if event.kind === 'title_changed' || event.kind === 'description_changed'}<Pencil size={14} />{:else if event.kind === 'merged'}<GitMerge size={14} />{:else if event.kind === 'closed'}<X size={14} />{:else if event.kind === 'reopened'}<RotateCcw size={14} />{:else}<GitPullRequest size={14} />{/if}</span>
  <p><strong>{event.actor}</strong> {message}<Time value={event.createdAt} /></p>
</article>

<style>
  .timeline-event{display:grid;grid-template-columns:29px minmax(0,1fr);align-items:center;gap:9px;padding:2px 6px}.icon{display:grid;width:27px;height:27px;place-items:center;border-radius:50%;background:var(--surface-muted);color:var(--text-muted)}p{display:flex;align-items:center;gap:3px;margin:0;color:var(--text-muted);font-size:10px;line-height:1.45}strong{color:var(--text-strong)}time{margin-left:auto;color:var(--text-faint);font-size:9px}.closed .icon{background:var(--danger-soft);color:var(--danger)}.merged .icon{background:color-mix(in srgb,#8b5cf6 18%,transparent);color:#a78bfa}.locked .icon{background:var(--warning-soft);color:var(--warning)}
</style>
