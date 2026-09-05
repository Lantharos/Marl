<script lang="ts">
  import type { Snippet } from 'svelte';
  import Time from './Time.svelte';
  import UserProfileLink from './UserProfileLink.svelte';

  let { author, displayName, avatarUrl, createdAt, outcome, tone, contained = true, actions, children } = $props<{
    author: string;
    displayName: string;
    avatarUrl?: string | null;
    createdAt: string;
    outcome?: string;
    tone?: 'approved' | 'changes_requested' | 'commented';
    contained?: boolean;
    actions?: Snippet;
    children?: Snippet;
  }>();
</script>

<article class="discussion-entry" class:contained>
  <header>
    <div class="identity">
      <UserProfileLink handle={author} {displayName} {avatarUrl} size={28} />
      {#if outcome}<span class:approved={tone === 'approved'} class:requested={tone === 'changes_requested'}>{outcome}</span>{/if}
    </div>
    <Time value={createdAt} />
    {#if actions}<div class="actions">{@render actions()}</div>{/if}
  </header>
  {#if children}<div class="body">{@render children()}</div>{/if}
</article>

<style>
  .discussion-entry{min-width:0;--markdown-font-size:13px}
  .contained{padding:14px 16px 16px;border-radius:9px;background:var(--surface);box-shadow:var(--shadow-surface);content-visibility:auto;contain-intrinsic-size:auto 120px}
  header{display:flex;flex-wrap:wrap;align-items:center;gap:6px 12px;min-height:28px}
  .identity{display:flex;flex:1;flex-wrap:wrap;align-items:center;gap:6px 9px;min-width:0;color:var(--text-muted);font-size:12px}
  .identity :global(.user-profile-link){font-size:12px}
  .identity>span{font-size:11px}
  .identity .approved{color:var(--success)}
  .identity .requested{color:var(--danger)}
  header :global(time){flex:none;font-size:11px}
  .actions{display:flex;flex-wrap:wrap;gap:4px}
  .body{padding:10px 0 0 35px}
  .body:empty,.actions:empty{display:none}
  @media(max-width:600px){
    .contained{padding:12px}
    .identity{flex-basis:60%}
    .body{padding-left:0}
  }
</style>
