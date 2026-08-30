<script lang="ts">
  import type { MergeMethod, PullRequestState } from '@marl/contracts';
  import BadgeCheck from 'lucide-svelte/icons/badge-check';
  import Check from 'lucide-svelte/icons/check';
  import ChevronDown from 'lucide-svelte/icons/chevron-down';
  import GitMerge from 'lucide-svelte/icons/git-merge';
  import GitPullRequest from 'lucide-svelte/icons/git-pull-request';
  import MessageSquare from 'lucide-svelte/icons/message-square';
  import RotateCcw from 'lucide-svelte/icons/rotate-ccw';
  import ShieldAlert from 'lucide-svelte/icons/shield-alert';
  import X from 'lucide-svelte/icons/x';
  import { dismissable } from '$lib/actions/dismissable';
  import Button from './Button.svelte';
  import MarkdownComposer from './MarkdownComposer.svelte';
  import UserAvatar from './UserAvatar.svelte';
  import type { MarkdownContext } from '$lib/markdown';

  export type PullComposerAction = 'approve' | 'request_changes' | 'close' | 'reopen' | 'ready' | 'merge';
  type Selection = {
    key: string;
    action: 'comment' | PullComposerAction;
    label: string;
    description: string;
    tone: 'brand' | 'success' | 'danger';
    mergeMethod?: MergeMethod;
  };

  let {
    value = $bindable(''), pullState, ready, locked, busy, allowedMergeMethods, avatarName, avatarUrl,
    mergeMethod = $bindable<MergeMethod>('merge'), onComment, onAction, context
  } = $props<{
    value?: string;
    pullState: PullRequestState;
    ready: boolean;
    locked: boolean;
    busy: boolean;
    allowedMergeMethods: MergeMethod[];
    avatarName: string;
    avatarUrl?: string | null;
    mergeMethod?: MergeMethod;
    onComment: () => Promise<void>;
    onAction: (action: PullComposerAction) => Promise<void>;
    context?: MarkdownContext;
  }>();

  let open = $state(false);
  let selectedKey = $state('comment');
  const active = $derived(['open', 'mergeable', 'blocked'].includes(pullState));
  const selections = $derived.by<Selection[]>(() => {
    const items: Selection[] = [{ key: 'comment', action: 'comment', label: 'Comment', description: 'Add to the conversation without changing its state.', tone: 'brand' }];
    if (active) {
      items.push(
        { key: 'approve', action: 'approve', label: 'Approve changes', description: 'Approve the current head revision.', tone: 'success' },
        { key: 'request_changes', action: 'request_changes', label: 'Request changes', description: 'Block merging until concerns are addressed.', tone: 'danger' }
      );
      if (ready) {
        for (const method of allowedMergeMethods) {
          const label = method === 'merge' ? 'Merge pull request' : method === 'squash' ? 'Squash and merge' : 'Rebase and merge';
          const description = method === 'merge' ? 'Create a merge commit on the target branch.' : method === 'squash' ? 'Combine the pull request into one commit.' : 'Replay these commits on the target branch.';
          items.push({ key: `merge:${method}`, action: 'merge', mergeMethod: method, label, description, tone: 'success' });
        }
      }
      items.push({ key: 'close', action: 'close', label: 'Close pull request', description: 'Keep its commits and conversation.', tone: 'danger' });
    } else if (pullState === 'draft') {
      items.push(
        { key: 'ready', action: 'ready', label: 'Mark ready for review', description: 'Move this pull request into review.', tone: 'brand' },
        { key: 'close', action: 'close', label: 'Close pull request', description: 'Keep its commits and conversation.', tone: 'danger' }
      );
    } else if (pullState === 'closed') {
      items.push({ key: 'reopen', action: 'reopen', label: 'Reopen pull request', description: 'Return it to active review.', tone: 'brand' });
    }
    return items;
  });
  const selected = $derived(selections.find((item) => item.key === selectedKey) ?? selections[0]);
  const includesComment = $derived(Boolean(value.trim()) && !locked);
  const primaryLabel = $derived.by(() => {
    if (!selected || selected.action === 'comment') return 'Comment';
    if (!includesComment) return selected.action === 'approve' ? 'Approve' : selected.label;
    if (selected.action === 'approve') return 'Comment and approve';
    if (selected.action === 'request_changes') return 'Comment and request changes';
    if (selected.action === 'merge') return selected.mergeMethod === 'squash' ? 'Comment and squash' : selected.mergeMethod === 'rebase' ? 'Comment and rebase' : 'Comment and merge';
    if (selected.action === 'close') return 'Comment and close';
    if (selected.action === 'reopen') return 'Comment and reopen';
    return 'Comment and mark ready';
  });
  const submitDisabled = $derived(busy || !selected || (selected.action === 'comment' && (locked || !value.trim())));

  $effect(() => {
    if (!selections.some((item) => item.key === selectedKey)) selectedKey = 'comment';
  });

  function choose(selection: Selection) {
    selectedKey = selection.key;
    if (selection.mergeMethod) mergeMethod = selection.mergeMethod;
    open = false;
  }

  async function submit() {
    if (!selected || submitDisabled) return;
    if (selected.action === 'comment') await onComment();
    else await onAction(selected.action);
  }
</script>

<div class="composer-shell">
  <UserAvatar name={avatarName} src={avatarUrl} size={30} />
  <div class="composer">
    <MarkdownComposer bind:value {context} placeholder={locked ? 'This conversation is locked' : 'Leave a comment'} minHeight={108} />
    <footer>
      {#if locked}<span>Unlock the conversation to comment.</span>{/if}
      <div class="actions" use:dismissable={() => (open = false)}>
        <Button class={`primary-action ${selected?.tone ?? 'brand'}`} size="small" variant={selected?.tone === 'danger' ? 'danger' : 'primary'} loading={busy} disabled={submitDisabled} onclick={submit}>
          {#if selected?.action === 'approve'}<BadgeCheck size={13} />{:else if selected?.action === 'request_changes'}<ShieldAlert size={13} />{:else if selected?.action === 'merge'}<GitMerge size={13} />{:else if selected?.action === 'close'}<X size={13} />{:else if selected?.action === 'reopen'}<RotateCcw size={13} />{:else if selected?.action === 'ready'}<GitPullRequest size={13} />{:else}<MessageSquare size={13} />{/if}
          {primaryLabel}
        </Button>
        <Button class={`more-action ${selected?.tone ?? 'brand'}`} icon size="small" variant={selected?.tone === 'danger' ? 'danger' : 'primary'} aria-label="Choose pull request action" aria-haspopup="menu" aria-expanded={open} disabled={busy} onclick={() => (open = !open)}><ChevronDown size={14} /></Button>
        {#if open}<div class="menu" role="menu">
          {#each selections as selection (selection.key)}
            <Button class={`menu-option${selection.tone === 'danger' ? ' danger' : ''}`} variant="ghost" block role="menuitemradio" aria-checked={selection.key === selected?.key} onclick={() => choose(selection)}>
              <span class="option-icon">{#if selection.action === 'approve'}<BadgeCheck size={14} />{:else if selection.action === 'request_changes'}<ShieldAlert size={14} />{:else if selection.action === 'merge'}<GitMerge size={14} />{:else if selection.action === 'close'}<X size={14} />{:else if selection.action === 'reopen'}<RotateCcw size={14} />{:else if selection.action === 'ready'}<GitPullRequest size={14} />{:else}<MessageSquare size={14} />{/if}</span>
              <span><strong>{selection.label}</strong><small>{selection.description}</small></span>
              <span class="selected">{#if selection.key === selected?.key}<Check size={14} />{/if}</span>
            </Button>
          {/each}
        </div>{/if}
      </div>
    </footer>
  </div>
</div>

<style>
  .composer-shell{display:grid;grid-template-columns:32px minmax(0,1fr);align-items:start;gap:10px}.composer{min-width:0}.composer>footer{display:flex;align-items:center;gap:12px;margin-top:8px}.composer>footer>span{color:var(--text-faint);font-size:9px}.actions{position:relative;display:flex;margin-left:auto}.actions :global(.primary-action.button){border-radius:6px 0 0 6px}.actions :global(.more-action.button){border-left-color:rgb(255 255 255/.22);border-radius:0 6px 6px 0}.actions :global(.button.success){border-color:var(--success);background:var(--success);color:#0d1812}.actions :global(.button.success:hover:not(:disabled)){border-color:color-mix(in srgb,var(--success) 84%,white);background:color-mix(in srgb,var(--success) 84%,white)}.menu{position:absolute;right:0;bottom:38px;z-index:45;width:310px;padding:5px;border:1px solid var(--border-strong);border-radius:8px;background:var(--surface-raised);box-shadow:var(--shadow-card)}.menu :global(.menu-option.button){height:auto;min-height:48px;display:grid;grid-template-columns:22px minmax(0,1fr) 18px;gap:6px;padding:8px;text-align:left;white-space:normal}.menu :global(.menu-option.button.danger){color:var(--danger)}.menu strong,.menu small{display:block}.menu strong{color:inherit;font-size:10px}.menu small{margin-top:2px;color:var(--text-faint);font-size:8px;line-height:1.35}.option-icon,.selected{display:grid;place-items:center}.selected{color:var(--brand)}
</style>
