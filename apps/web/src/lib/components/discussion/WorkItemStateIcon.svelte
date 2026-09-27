<script lang="ts">
  import CircleCheck from '@lucide/svelte/icons/circle-check';
  import CircleDot from '@lucide/svelte/icons/circle-dot';
  import GitMerge from '@lucide/svelte/icons/git-merge';
  import GitPullRequest from '@lucide/svelte/icons/git-pull-request';
  import GitPullRequestClosed from '@lucide/svelte/icons/git-pull-request-closed';
  import GitPullRequestDraft from '@lucide/svelte/icons/git-pull-request-draft';

  let { kind, state, size = 16 }: { kind: 'issue' | 'pull'; state: string; size?: number } = $props();
  const label = $derived(`${kind === 'issue' ? 'Issue' : 'Pull'} ${state}`);
</script>

<span
  class={[
    'inline-grid shrink-0 place-items-center',
    state === 'merged' && 'text-merged',
    (state === 'closed' || state === 'draft') && 'text-ink-faint',
    state !== 'merged' && state !== 'closed' && state !== 'draft' && 'text-success'
  ]}
  role="img"
  aria-label={label}
>
  {#if kind === 'issue'}{#if state === 'closed'}<CircleCheck {size} />{:else}<CircleDot {size} />{/if}
  {:else if state === 'merged'}<GitMerge {size} />
  {:else if state === 'closed'}<GitPullRequestClosed {size} />
  {:else if state === 'draft'}<GitPullRequestDraft {size} />
  {:else}<GitPullRequest {size} />{/if}
</span>
