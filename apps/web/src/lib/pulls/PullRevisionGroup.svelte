<script lang="ts">
  import type { Snippet } from 'svelte';
  import type { PullRevisionSummary } from '@marl/contracts';
  import ChevronDown from 'lucide-svelte/icons/chevron-down';
  import Time from '$lib/components/Time.svelte';
  import UserProfileLink from '$lib/components/UserProfileLink.svelte';

  let { revision, expanded = false, loading = false, onToggle, children } = $props<{
    revision: PullRevisionSummary;
    expanded?: boolean;
    loading?: boolean;
    onToggle?: () => void;
    children: Snippet;
  }>();

  const reviewLabel = $derived(revision.reviewState === 'changes_requested' ? 'Changes requested' : revision.reviewState === 'approved' ? 'Approved' : revision.reviewState === 'commented' ? 'Reviewed' : 'Not reviewed');
</script>

{#snippet heading()}
  <span class="revision-heading">
    <span class="identity"><strong>Revision {revision.number}</strong>{#if revision.current}<span class="current-label">Current</span>{/if}<code>{revision.commitId.slice(0, 7)}</code></span>
    <span class="title" title={revision.title}>{revision.title}</span>
    <span class="facts">
      {#if revision.current}<UserProfileLink handle={revision.actor} displayName={revision.actorDisplayName || revision.actor} avatar={false} />{:else}<span>{revision.actorDisplayName || revision.actor}</span>{/if}<Time value={revision.createdAt} />
      <span>{revision.commitCount} {revision.commitCount === 1 ? 'commit' : 'commits'}</span>
      {#if revision.forcePushed}<span>Force-pushed</span>{/if}
      {#if !revision.current}<span>{reviewLabel}</span>{#if revision.conversationCount}<span>{revision.conversationCount} {revision.conversationCount === 1 ? 'conversation' : 'conversations'}</span>{/if}{/if}
    </span>
  </span>
{/snippet}

<section class="revision-group" class:current={revision.current} class:expanded>
  {#if revision.current}
    <header>{@render heading()}</header>
  {:else}
    <button type="button" aria-expanded={expanded} onclick={onToggle}>
      {@render heading()}<ChevronDown class="chevron" size={17} />
    </button>
  {/if}
  {#if revision.current || expanded}
    <div class="revision-activity" aria-busy={loading}>
      {#if loading}<div class="loading" role="status">Loading discussion…</div>{:else}{@render children()}{/if}
    </div>
  {/if}
</section>

<style>
  .revision-group{min-width:0;border-radius:15px;background:color-mix(in srgb,var(--surface-muted) 58%,transparent)}
  header,button{padding:15px 16px}
  button{display:flex;width:100%;align-items:center;gap:16px;border:0;border-radius:15px;background:transparent;color:inherit;text-align:left;cursor:pointer;transition:background-color 140ms ease}
  button:hover{background:var(--surface-hover)}
  button:focus-visible{outline:2px solid var(--brand);outline-offset:2px}
  .revision-heading{display:grid;min-width:0;flex:1;gap:6px}
  .identity{display:flex;flex-wrap:wrap;align-items:center;gap:10px}
  .identity strong{color:var(--text-strong);font-size:13px;font-weight:660}
  .identity code{color:var(--text-faint);font-size:11px}
  .current-label{color:var(--text-muted);font-size:11px}
  .title{overflow:hidden;color:var(--text-strong);font-size:13px;text-overflow:ellipsis;white-space:nowrap}
  .facts{display:flex;flex-wrap:wrap;align-items:baseline;gap:4px 12px;color:var(--text-muted);font-size:11px}
  .facts :global(time){font-size:11px}
  button :global(.chevron){flex:none;color:var(--text-faint);transition:transform 160ms ease}
  .expanded button :global(.chevron){transform:rotate(180deg)}
  .revision-activity{display:grid;gap:12px;padding:0 6px 6px}
  .loading{padding:16px 10px;color:var(--text-muted);font-size:12px}
  @media(max-width:600px){header,button{padding:13px}.facts{gap:4px 10px}}
  @media(prefers-reduced-motion:reduce){button,button :global(.chevron){transition:none}}
</style>
