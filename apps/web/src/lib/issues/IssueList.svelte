<script lang="ts">
  import type { IssueSummary } from '@marl/contracts';
  import CircleDot from '@lucide/svelte/icons/circle-dot';
  import MessageCircle from '@lucide/svelte/icons/message-circle';
  import LabelPill from '$lib/components/discussion/LabelPill.svelte';
  import WorkItemStateIcon from '$lib/components/discussion/WorkItemStateIcon.svelte';
  import EmptyState from '$lib/components/feedback/EmptyState.svelte';
  import Time from '$lib/components/page/Time.svelte';

  let {
    issues,
    showRepository = false,
    emptyTitle,
    emptyDescription
  }: {
    issues: IssueSummary[];
    showRepository?: boolean;
    emptyTitle: string;
    emptyDescription: string;
  } = $props();
</script>

<div class="surface p-1.5">
  {#each issues as issue (issue.id)}
    <article
      class="relative grid min-h-18 grid-cols-[20px_minmax(0,1fr)_auto] items-start gap-3 rounded-lg px-3 py-3.5 transition-colors hover:bg-surface-hover"
    >
      <span class="mt-0.5"><WorkItemStateIcon kind="issue" state={issue.state} size={18} /></span>
      <div class="min-w-0">
        <div class="flex min-w-0 items-center gap-2">
          <a
            class={[
              'truncate text-base font-semibold after:absolute after:inset-0',
              issue.state === 'closed' ? 'text-ink-muted' : 'text-ink-strong'
            ]}
            href="/{issue.repository.owner}/{issue.repository.name}/issues/{issue.number}">{issue.title}</a
          >
          {#if issue.unread}<span class="size-1.5 shrink-0 rounded-full bg-brand" role="img" aria-label="Unread replies"
            ></span>{/if}
        </div>
        <div class="mt-1 flex flex-wrap items-center gap-x-1.5 gap-y-1 text-xs text-ink-muted">
          {#if showRepository}<a
              class="relative z-1 font-medium text-ink hover:text-brand"
              href="/{issue.repository.owner}/{issue.repository.name}"
              >{issue.repository.owner}/{issue.repository.name}</a
            >{/if}
          <span>#{issue.number}</span><span aria-hidden="true">·</span><a
            class="relative z-1 hover:text-brand"
            href="/{issue.author}">{issue.authorDisplayName}</a
          ><span aria-hidden="true">·</span><Time value={issue.updatedAt} class="text-ink-muted" />
          {#each issue.labels.slice(0, 2) as label (label.id)}<LabelPill
              name={label.name}
              color={label.color}
              size="small"
            />{/each}
        </div>
      </div>
      {#if issue.commentCount}<span
          class="mt-0.5 flex items-center gap-1 text-xs text-ink-muted tabular-nums"
          aria-label={`${issue.commentCount} replies`}><MessageCircle size={15} />{issue.commentCount}</span
        >{/if}
    </article>
  {:else}
    <EmptyState icon={CircleDot} title={emptyTitle} description={emptyDescription} />
  {/each}
</div>
