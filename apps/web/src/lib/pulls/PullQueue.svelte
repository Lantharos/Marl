<script lang="ts">
  import type { PullRequestSummary } from '@marl/contracts';
  import ArrowRight from '@lucide/svelte/icons/arrow-right';
  import CircleAlert from '@lucide/svelte/icons/circle-alert';
  import CircleCheck from '@lucide/svelte/icons/circle-check';
  import CircleDot from '@lucide/svelte/icons/circle-dot';
  import GitMerge from '@lucide/svelte/icons/git-merge';
  import GitPullRequest from '@lucide/svelte/icons/git-pull-request';
  import GitPullRequestClosed from '@lucide/svelte/icons/git-pull-request-closed';
  import LinkButton from '$lib/components/controls/LinkButton.svelte';
  import LabelPill from '$lib/components/discussion/LabelPill.svelte';
  import EmptyState from '$lib/components/feedback/EmptyState.svelte';
  import Time from '$lib/components/page/Time.svelte';
  import { pullSignal, type PullQueueGroup } from './pull-signal';

  let {
    pulls,
    showRepository = false,
    grouped = false,
    emptyTitle,
    emptyDescription,
    createHref
  }: {
    pulls: PullRequestSummary[];
    showRepository?: boolean;
    grouped?: boolean;
    emptyTitle: string;
    emptyDescription: string;
    createHref?: string;
  } = $props();

  const sections = $derived.by(() => {
    if (!grouped) return [{ key: 'complete' as PullQueueGroup, title: '', pulls }];
    const definitions: Array<{ key: PullQueueGroup; title: string }> = [
      { key: 'ready', title: 'Ready to land' },
      { key: 'attention', title: 'Needs attention' },
      { key: 'review', title: 'In review' },
      { key: 'draft', title: 'Still taking shape' }
    ];
    return definitions
      .map((section) => ({
        ...section,
        pulls: pulls.filter((pull) => pullSignal(pull).group === section.key)
      }))
      .filter((section) => section.pulls.length > 0);
  });

  function href(pull: PullRequestSummary) {
    return `/${pull.repository.owner}/${pull.repository.name}/pulls/${pull.number}`;
  }
  const tones = {
    working: 'bg-brand-soft text-brand',
    attention: 'bg-danger-soft text-danger',
    ready: 'bg-success-soft text-success',
    complete: 'bg-merged-soft text-merged',
    quiet: 'bg-surface-muted text-ink-faint'
  };
</script>

{#if pulls.length}
  <div class="grid gap-7">
    {#each sections as section (section.key)}
      <section>
        {#if section.title}
          <header class="mb-2.5 flex items-center gap-2 px-1">
            <h2 class="text-sm font-semibold text-ink-strong">{section.title}</h2>
            <span class="text-xs text-ink-muted tabular-nums">{section.pulls.length}</span>
          </header>
        {/if}
        <div class="surface p-1.5">
          {#each section.pulls as pull (pull.id)}
            {@const signal = pullSignal(pull)}
            <article
              class="relative grid grid-cols-[32px_minmax(0,1fr)] gap-3 rounded-lg px-3 py-3.5 transition-colors hover:bg-surface-hover"
            >
              <span class={['grid size-8 place-items-center rounded-lg', tones[signal.tone]]} title={signal.label}>
                {#if pull.state === 'merged'}<GitMerge size={17} />
                {:else if pull.state === 'closed'}<GitPullRequestClosed size={17} />
                {:else}<GitPullRequest size={17} />{/if}
              </span>
              <div class="min-w-0">
                <div class="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
                  <a
                    class="line-clamp-2 min-w-0 text-base leading-snug font-semibold text-pretty text-ink-strong after:absolute after:inset-0"
                    href={href(pull)}
                    title={pull.title}>{pull.title}</a
                  >
                  {#each pull.labels.slice(0, 3) as label (label.id)}<LabelPill
                      name={label.name}
                      color={label.color}
                      size="small"
                    />{/each}
                </div>
                <p class="mt-1 flex flex-wrap items-center gap-x-1.5 text-xs text-ink-muted">
                  {#if showRepository}<a
                      class="relative z-1 font-medium text-ink hover:text-brand"
                      href="/{pull.repository.owner}/{pull.repository.name}"
                      >{pull.repository.owner}/{pull.repository.name}</a
                    ><span aria-hidden="true">·</span>{/if}
                  <span>!{pull.number}</span><span>by</span><a
                    class="relative z-1 hover:text-brand"
                    href="/{pull.author}">{pull.authorDisplayName}</a
                  ><span aria-hidden="true">·</span><Time value={pull.updatedAt} class="text-ink-muted" />
                </p>
                <div class="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-ink-muted">
                  <code class="max-w-full truncate rounded bg-surface-muted px-1.5 py-0.5 font-mono"
                    >{pull.sourceRepository &&
                    `${pull.sourceRepository.owner}/${pull.sourceRepository.name}` !==
                      `${pull.repository.owner}/${pull.repository.name}`
                      ? `${pull.sourceRepository.owner}:`
                      : ''}{pull.sourceBranch}</code
                  >
                  <ArrowRight size={12} class="text-ink-faint" />
                  <code class="rounded bg-surface-muted px-1.5 py-0.5 font-mono">{pull.targetBranch}</code>
                  {#if pull.checkSummary.total}<span
                      class={[
                        'ml-1 inline-flex items-center gap-1',
                        pull.checkSummary.failed
                          ? 'text-danger'
                          : pull.checkSummary.running
                            ? 'text-brand'
                            : 'text-success'
                      ]}
                    >
                      {#if pull.checkSummary.failed}<CircleAlert size={13} />{pull.checkSummary.failed} failed
                      {:else if pull.checkSummary.running}<CircleDot size={13} />{pull.checkSummary.running} running
                      {:else}<CircleCheck size={13} />{pull.checkSummary.passed}/{pull.checkSummary.total} passed{/if}
                    </span>{/if}
                </div>
              </div>
            </article>
          {/each}
        </div>
      </section>
    {/each}
  </div>
{:else}
  <div class="surface">
    <EmptyState icon={GitPullRequest} title={emptyTitle} description={emptyDescription}>
      {#if createHref}<LinkButton size="small" variant="primary" href={createHref}>Open a pull</LinkButton>{/if}
    </EmptyState>
  </div>
{/if}
