<script lang="ts">
  import type { Snippet } from 'svelte';
  import type { PullRequestDetail } from '@marl/contracts';
  import ChevronDown from 'lucide-svelte/icons/chevron-down';
  import ArrowRight from 'lucide-svelte/icons/arrow-right';
  import Pencil from 'lucide-svelte/icons/pencil';
  import Button from '$lib/components/Button.svelte';
  import PullBrief from './PullBrief.svelte';
  import PullMetadata from '$lib/components/PullMetadata.svelte';
  import UserProfileLink from '$lib/components/UserProfileLink.svelte';
  import WorkItemLinks from '$lib/components/WorkItemLinks.svelte';
  import type { MarkdownContext } from '$lib/markdown';
  import { pullDetailSignal } from './pull-signal';

  let { pull, conflicted = false, busy, context, onEdit, onUpdate, onCreateLabel, actions } = $props<{
    pull: PullRequestDetail;
    conflicted?: boolean;
    busy: boolean;
    context: MarkdownContext;
    onEdit: () => void;
    onUpdate: (body: { assigneeIds?: string[]; labelIds?: string[]; locked?: boolean }) => Promise<void>;
    onCreateLabel: (name: string) => Promise<void>;
    actions: Snippet;
  }>();
  let metadataOpen = $state(false);
  const signal = $derived(pullDetailSignal(pull, conflicted));
</script>

<aside class="summary" aria-label="Pull summary">
  <section class="details">
    <header><span class="number">!{pull.number}</span>{#if pull.canManage}<Button icon size="small" variant="ghost" aria-label="Edit pull" disabled={busy} onclick={onEdit}><Pencil size={14} /></Button>{/if}</header>
    <h1>{pull.title}</h1>
    <div class="status {signal.tone}"><i></i>{signal.label}</div>
    <div class="author"><UserProfileLink handle={pull.author} displayName={pull.authorDisplayName} avatarUrl={pull.authorAvatarUrl} size={22} /></div>
    <div class="branches"><code title={pull.sourceBranch}>{pull.sourceBranch}</code><ArrowRight size={13} /><code title={pull.targetBranch}>{pull.targetBranch}</code></div>
    {#if pull.body}<div class="brief"><PullBrief body={pull.body} title={pull.title} {context} /></div>{/if}
    {@render actions()}
  </section>
  <div class="metadata-toggle"><Button variant="ghost" size="small" aria-expanded={metadataOpen} onclick={() => (metadataOpen = !metadataOpen)}>Assignees and labels<ChevronDown size={14} /></Button></div>
  <div class="metadata" class:expanded={metadataOpen}><WorkItemLinks items={pull.linkedItems} {context} /><PullMetadata {pull} {busy} {onUpdate} {onCreateLabel} /></div>
</aside>

<style>
  .metadata-toggle{display:none}
  .metadata{display:grid;gap:24px}
  .summary{min-width:0;display:grid;gap:20px;align-content:start}.details{min-width:0;padding:20px;border-radius:16px;background:var(--surface);box-shadow:var(--shadow-surface)}header{display:flex;min-height:28px;align-items:center;justify-content:space-between;margin-bottom:8px}.number{color:var(--text-muted);font-size:13px;font-variant-numeric:tabular-nums}h1{margin:0;color:var(--text-strong);font-size:clamp(23px,2vw,29px);font-weight:680;line-height:1.18;letter-spacing:-.035em;overflow-wrap:anywhere;text-wrap:pretty}.status{display:flex;align-items:center;gap:8px;margin:18px 0 22px;color:var(--text-strong);font-size:13px;font-weight:650}.status i{width:7px;height:7px;border-radius:50%;background:var(--brand)}.status.attention i{background:var(--danger)}.status.ready i,.status.complete i{background:var(--success)}.status.quiet i{background:var(--text-muted)}.author{margin-bottom:10px;font-size:12px}.branches{display:flex;flex-wrap:wrap;align-items:center;gap:6px;color:var(--text-muted)}.branches code{max-width:100%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;padding:4px 7px;border-radius:6px;background:var(--surface-muted);font-size:11px}.brief{margin:24px 0;--markdown-font-size:13px;overflow-wrap:anywhere}.branches+.brief{margin-top:22px}.branches:has(+ :global(.actions)){margin-bottom:22px}.metadata{padding:0 14px}.metadata :global(.metadata){margin-top:0}@media(max-width:1000px){.summary{gap:12px}.metadata-toggle{display:block}.metadata:not(.expanded){display:none}}@media(max-width:600px){.details{padding:16px}.metadata{padding:0 8px}}
</style>
