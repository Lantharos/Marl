<script lang="ts">
  import type { Snippet } from 'svelte';
  import type { PullRequestDetail } from '@marl/contracts';
  import Check from '@lucide/svelte/icons/check';
  import CircleAlert from '@lucide/svelte/icons/circle-alert';
  import CircleCheck from '@lucide/svelte/icons/circle-check';
  import CircleDashed from '@lucide/svelte/icons/circle-dashed';
  import GitMerge from '@lucide/svelte/icons/git-merge';
  import GitPullRequestClosed from '@lucide/svelte/icons/git-pull-request-closed';
  import GitPullRequestDraft from '@lucide/svelte/icons/git-pull-request-draft';
  import X from '@lucide/svelte/icons/x';
  import { pullOutcome, pullRequirements, type PullOutcome, type Requirement } from './pull-requirements';

  let {
    pull,
    conflicted,
    checksHref,
    onNextConversation,
    actions
  }: {
    pull: PullRequestDetail;
    conflicted: boolean | null;
    checksHref: string;
    onNextConversation: () => void;
    actions: Snippet;
  } = $props();

  const requirements = $derived(
    pull.state === 'open' || pull.state === 'mergeable' || pull.state === 'blocked'
      ? pullRequirements(pull, conflicted)
      : []
  );
  const outcome = $derived(pullOutcome(pull, requirements));
  const headlines: Record<PullOutcome['tone'], { icon: typeof Check; tone: string }> = {
    merged: { icon: GitMerge, tone: 'text-merged' },
    closed: { icon: GitPullRequestClosed, tone: 'text-ink-muted' },
    draft: { icon: GitPullRequestDraft, tone: 'text-ink-muted' },
    ready: { icon: CircleCheck, tone: 'text-success' },
    blocked: { icon: CircleAlert, tone: 'text-danger' },
    waiting: { icon: CircleDashed, tone: 'text-brand' }
  };
  const headline = $derived(headlines[outcome.tone]);

  const requirementIcons = { met: Check, optional: CircleAlert, waiting: CircleDashed, blocked: X };

  function tone(requirement: Requirement) {
    if (requirement.outcome === 'met') return 'text-success';
    if (requirement.outcome === 'waiting') return 'text-ink-faint';
    if (requirement.outcome === 'optional') return 'text-warning';
    return requirement.key === 'reviews' ? 'text-warning' : 'text-danger';
  }
</script>

{#snippet requirementLabel(requirement: Requirement)}
  {@const Icon = requirementIcons[requirement.outcome]}
  <Icon
    size={15}
    strokeWidth={requirement.outcome === 'met' || requirement.outcome === 'blocked' ? 2.5 : 2}
    class={tone(requirement)}
    aria-hidden="true"
  />
  <span class={requirement.outcome === 'met' ? 'text-ink-muted' : 'text-ink-strong'}>{requirement.label}</span>
{/snippet}

<section class="min-w-0 rounded-xl bg-surface-muted p-1.5" aria-label="Merge status">
  <header class="flex items-start gap-2.5 px-2.5 pt-2 pb-2.5">
    <headline.icon size={18} class={['mt-0.5 shrink-0', headline.tone]} aria-hidden="true" />
    <div class="min-w-0">
      <strong class="block text-md font-semibold text-ink-strong">{outcome.label}</strong>
      {#if outcome.detail}<p class="mt-0.5 text-xs text-ink-muted">{outcome.detail}</p>{/if}
    </div>
  </header>
  {#if requirements.length}
    <ul class="grid gap-px pb-1" aria-label="Merge requirements">
      {#each requirements as requirement (requirement.key)}
        <li>
          {#if requirement.key === 'checks' && pull.checkSummary.total}<a
              href={checksHref}
              class="flex min-h-8 items-center gap-2.5 rounded-lg px-2.5 text-sm transition-colors hover:bg-surface-hover"
              >{@render requirementLabel(requirement)}</a
            >{:else if requirement.key === 'conversations' && pull.mergeRequirements.unresolvedConversations}<button
              type="button"
              class="flex min-h-8 w-full items-center gap-2.5 rounded-lg px-2.5 text-left text-sm transition-colors hover:bg-surface-hover"
              onclick={onNextConversation}>{@render requirementLabel(requirement)}</button
            >{:else}<div class="flex min-h-8 items-center gap-2.5 px-2.5 text-sm">
              {@render requirementLabel(requirement)}
            </div>{/if}
        </li>
      {/each}
    </ul>
  {/if}
  {@render actions()}
</section>
