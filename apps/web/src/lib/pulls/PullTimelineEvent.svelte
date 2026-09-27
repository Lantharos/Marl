<script lang="ts">
  import type { PullRequestEvent } from '@marl/contracts';
  import Time from '../components/page/Time.svelte';
  import UserProfileLink from '../components/identity/UserProfileLink.svelte';

  let { event, repository }: { event: PullRequestEvent; repository: { owner: string; name: string } } = $props();
  const commits = $derived.by(() => {
    if (event.kind !== 'head_updated') return [];
    try {
      const parsed: unknown = JSON.parse(event.details.commits ?? '[]');
      return Array.isArray(parsed)
        ? parsed.filter((commit): commit is { id: string; title: string } =>
            Boolean(
              commit && typeof commit === 'object' && typeof commit.id === 'string' && typeof commit.title === 'string'
            )
          )
        : [];
    } catch {
      return [];
    }
  });
  const message = $derived.by(() => {
    switch (event.kind) {
      case 'title_changed':
        return `changed the title from “${event.details.from}” to “${event.details.to}”`;
      case 'description_changed':
        return 'updated the description';
      case 'locked':
        return 'locked this conversation';
      case 'unlocked':
        return 'unlocked this conversation';
      case 'assigned':
        return `assigned ${event.details.handle}`;
      case 'unassigned':
        return `unassigned ${event.details.handle}`;
      case 'label_added':
        return `added the ${event.details.label} label`;
      case 'label_removed':
        return `removed the ${event.details.label} label`;
      case 'ready':
        return 'marked this pull ready for review';
      case 'closed':
        return 'closed this pull';
      case 'reopened':
        return 'reopened this pull';
      case 'merged':
        return `merged this pull with ${event.details.method}`;
      case 'commits_added':
        return 'uploaded a revision';
      case 'head_updated':
        return 'updated this revision';
      case 'force_pushed':
        return `force-pushed ${event.details.branch} from ${event.details.from} to ${event.details.to}`;
    }
  });
</script>

<article class="grid grid-cols-[10px_minmax(0,1fr)] items-start gap-2.5 px-3 py-1.5">
  <span
    class={[
      'mt-2.25 size-1.5 rounded-full',
      event.kind === 'closed' || event.kind === 'force_pushed'
        ? 'bg-danger'
        : event.kind === 'merged'
          ? 'bg-merged'
          : event.kind === 'commits_added'
            ? 'bg-success'
            : event.kind === 'locked'
              ? 'bg-warning'
              : 'bg-ink-faint'
    ]}
    aria-hidden="true"
  ></span>
  <div class="min-w-0">
    <p class="flex min-h-6 flex-wrap items-center gap-x-1 text-sm leading-snug text-ink-muted">
      <UserProfileLink handle={event.actor} displayName={event.actorDisplayName} avatar={false} class="text-sm" />
      {message}<Time value={event.createdAt} class="ml-1 text-xs text-ink-faint" />
    </p>
    {#if commits.length}
      <div class="mt-1 flex flex-wrap items-center gap-2 text-xs">
        {#each commits.slice(0, 3) as commit (commit.id)}<a
            class="font-mono text-ink-muted hover:text-brand"
            href="/{repository.owner}/{repository.name}/commit/{encodeURIComponent(commit.id)}"
            title={commit.title}>{commit.id.slice(0, 7)}</a
          >{/each}{#if commits.length > 3}<span class="text-ink-faint">+{commits.length - 3} more</span>{/if}
      </div>
    {/if}
  </div>
</article>
