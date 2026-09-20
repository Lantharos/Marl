<script lang="ts">
  import type { PullRequestState } from '@marl/contracts';
  import BadgeCheck from 'lucide-svelte/icons/badge-check';
  import Check from 'lucide-svelte/icons/check';
  import ChevronDown from 'lucide-svelte/icons/chevron-down';
  import MessageSquare from 'lucide-svelte/icons/message-square';
  import ShieldAlert from 'lucide-svelte/icons/shield-alert';
  import { dismissable } from '$lib/actions/dismissable';
  import { popoverMotion } from '$lib/ui/popover';
  import Button from './Button.svelte';
  import MarkdownComposer from './MarkdownComposer.svelte';
  import type { MarkdownContext } from '$lib/markdown';
  import '$lib/styles/review-actions.css';

  export type PullComposerAction = 'approve' | 'request_changes';
  type Selection = {
    key: string;
    action: 'comment' | PullComposerAction;
    label: string;
    tone: 'commented' | 'approved' | 'changes_requested';
  };

  let {
    value = $bindable(''), pullState, locked, busy, canManage, onComment, onAction, context
  } = $props<{
    value?: string;
    pullState: PullRequestState;
    locked: boolean;
    busy: boolean;
    canManage: boolean;
    onComment: () => Promise<void>;
    onAction: (action: PullComposerAction) => Promise<void>;
    context?: MarkdownContext;
  }>();

  let open = $state(false);
  let uploading = $state(false);
  let selectedKey = $state('comment');
  const active = $derived(['open', 'mergeable', 'blocked'].includes(pullState));
  const selections = $derived.by<Selection[]>(() => {
    const items: Selection[] = [{ key: 'comment', action: 'comment', label: 'Comment', tone: 'commented' }];
    if (active) {
      if (canManage && !locked) {
        items.push(
          { key: 'approve', action: 'approve', label: 'Approve', tone: 'approved' },
          { key: 'request_changes', action: 'request_changes', label: 'Request changes', tone: 'changes_requested' }
        );
      }
    }
    return items;
  });
  const selected = $derived(selections.find((item) => item.key === selectedKey) ?? selections[0]);
  const submitDisabled = $derived(busy || uploading || locked || !selected || (selected.action === 'comment' && !value.trim()));

  function choose(selection: Selection) {
    selectedKey = selection.key;
    open = false;
  }

  async function submit() {
    if (!selected || submitDisabled) return;
    if (selected.action === 'comment') await onComment();
    else await onAction(selected.action);
    selectedKey = 'comment';
    open = false;
  }
</script>

  <div class="composer">
    <MarkdownComposer bind:value bind:uploading {context} disabled={locked || busy} compact placeholder={locked ? 'This conversation is locked' : 'Leave a comment'} minHeight={84} />
    <footer>
      {#if locked}<span>Unlock the conversation to comment.</span>{/if}
      <div class="actions" use:dismissable={() => (open = false)}>
        <Button class={`review-submit primary-action ${selected?.tone ?? 'commented'}${selections.length === 1 ? ' solo' : ''}`} variant="primary" loading={busy} disabled={submitDisabled} onclick={submit}>
          {#if selected?.action === 'approve'}<BadgeCheck size={15} />{:else if selected?.action === 'request_changes'}<ShieldAlert size={15} />{:else}<MessageSquare size={15} />{/if}
          {selected?.label ?? 'Comment'}
        </Button>
        {#if selections.length > 1}<Button class={`review-submit more-action ${selected?.tone ?? 'commented'}`} icon variant="primary" aria-label="Choose pull action" aria-haspopup="menu" aria-expanded={open} disabled={busy} onclick={() => (open = !open)}><ChevronDown size={15} /></Button>{/if}
        {#if open && selections.length > 1}<div class="menu" role="menu" transition:popoverMotion={{ upward: true }}>
          {#each selections as selection (selection.key)}
            <Button class="menu-option" variant="ghost" block role="menuitemradio" aria-checked={selection.key === selected?.key} onclick={() => choose(selection)}>
              <span class="option-icon {selection.tone}">{#if selection.action === 'approve'}<BadgeCheck size={16} />{:else if selection.action === 'request_changes'}<ShieldAlert size={16} />{:else}<MessageSquare size={16} />{/if}</span>
              <span>{selection.label}</span>
              <span class="selected">{#if selection.key === selected?.key}<Check size={14} />{/if}</span>
            </Button>
          {/each}
        </div>{/if}
      </div>
    </footer>
  </div>

<style>
  .composer{min-width:0;padding-bottom:4px}
  .composer>footer{display:flex;align-items:center;gap:12px;margin-top:10px}
  .composer>footer>span{color:var(--text-faint);font-size:12px}
  .actions{position:relative;display:flex;margin-left:auto;border-radius:9px;background:var(--brand)}
  .actions:has(:global(.approved.primary-action)){background:var(--success-soft)}
  .actions:has(:global(.changes_requested.primary-action)){background:var(--warning-soft)}
  .actions :global(.primary-action.button){border-radius:9px 0 0 9px;padding-inline:14px}
  .actions :global(.primary-action.solo.button){border-radius:9px}
  .actions :global(.more-action.button){border-radius:0 9px 9px 0;border-left-color:color-mix(in srgb,currentColor 18%,transparent)}
  .menu{position:absolute;right:0;bottom:calc(100% + 8px);z-index:45;width:min(230px,calc(100vw - 60px));padding:7px;border-radius:15px;background:var(--surface-raised);box-shadow:var(--shadow-popover);transform-origin:bottom right}
  .menu :global(.menu-option.button){min-height:38px;display:grid;grid-template-columns:20px minmax(0,1fr) 16px;gap:10px;padding:8px 10px;border-radius:9px;text-align:left;font-size:12px;color:var(--text-strong)}
  .option-icon,.selected{display:grid;place-items:center;color:var(--text-muted)}
  .option-icon.approved{color:var(--success)}.option-icon.changes_requested{color:var(--warning)}
</style>
