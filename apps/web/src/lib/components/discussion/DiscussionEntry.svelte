<script lang="ts">
  import type { Snippet } from 'svelte';
  import Time from '../page/Time.svelte';
  import UserProfileLink from '../identity/UserProfileLink.svelte';

  let {
    author,
    displayName,
    avatarUrl,
    createdAt,
    outcome,
    tone,
    contained = true,
    actions,
    children
  }: {
    author: string;
    displayName: string;
    avatarUrl?: string | null;
    createdAt: string;
    outcome?: string;
    tone?: 'approved' | 'changes_requested' | 'commented';
    contained?: boolean;
    actions?: Snippet;
    children?: Snippet;
  } = $props();
</script>

<article
  class={[
    'min-w-0',
    contained &&
      'rounded-xl bg-surface p-3 shadow-surface [contain-intrinsic-size:auto_120px] [content-visibility:auto] sm:px-4 sm:pt-3.5 sm:pb-4'
  ]}
>
  <header class="flex min-h-7 flex-wrap items-center gap-x-3 gap-y-1.5">
    <div class="flex min-w-0 flex-1 flex-wrap items-center gap-x-2 gap-y-1 text-sm text-ink-muted">
      <UserProfileLink handle={author} {displayName} {avatarUrl} size={28} />
      {#if outcome}<span
          class={[
            'text-xs',
            tone === 'approved' && 'font-medium text-success',
            tone === 'changes_requested' && 'font-medium text-warning'
          ]}>{outcome}</span
        >{/if}
    </div>
    <Time value={createdAt} class="shrink-0 text-xs text-ink-muted" />
    {#if actions}<div class="flex flex-wrap gap-1 empty:hidden">{@render actions()}</div>{/if}
  </header>
  {#if children}<div class="pt-2.5 empty:hidden sm:pl-9">{@render children()}</div>{/if}
</article>
