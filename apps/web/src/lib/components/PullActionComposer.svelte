<script lang="ts">
  import type { PullRequestState } from '@sty/contracts';
  import BadgeCheck from 'lucide-svelte/icons/badge-check';
  import ChevronDown from 'lucide-svelte/icons/chevron-down';
  import GitMerge from 'lucide-svelte/icons/git-merge';
  import GitPullRequest from 'lucide-svelte/icons/git-pull-request';
  import MessageSquare from 'lucide-svelte/icons/message-square';
  import RotateCcw from 'lucide-svelte/icons/rotate-ccw';
  import ShieldAlert from 'lucide-svelte/icons/shield-alert';
  import X from 'lucide-svelte/icons/x';
  import { dismissable } from '$lib/actions/dismissable';
  import MarkdownComposer from './MarkdownComposer.svelte';

  export type PullComposerAction = 'approve' | 'request_changes' | 'close' | 'reopen' | 'ready' | 'merge';
  let { value = $bindable(''), pullState, ready, locked, busy, onComment, onAction } = $props<{
    value?: string;
    pullState: PullRequestState;
    ready: boolean;
    locked: boolean;
    busy: boolean;
    onComment: () => Promise<void>;
    onAction: (action: PullComposerAction) => Promise<void>;
  }>();
  let open = $state(false);
  const active = $derived(['open', 'mergeable', 'blocked'].includes(pullState));

  async function choose(action: PullComposerAction) { open = false; await onAction(action); }
</script>

<div class="composer-shell">
  <span class="avatar">K</span>
  <div class="composer">
    <MarkdownComposer bind:value placeholder={locked ? 'This conversation is locked' : 'Leave a comment'} minHeight={108} />
    <footer>
      <span>{locked ? 'Unlock the conversation to comment.' : 'Markdown supported'}</span>
      <div class="actions" use:dismissable={() => (open = false)}>
        <button class="comment" disabled={busy || locked || !value.trim()} onclick={onComment}><MessageSquare size={13} />Comment</button>
        <button class="more" aria-label="More pull request actions" aria-haspopup="menu" aria-expanded={open} disabled={busy} onclick={() => (open = !open)}><ChevronDown size={14} /></button>
        {#if open}<div class="menu" role="menu">
          {#if active}<button role="menuitem" onclick={() => choose('approve')}><BadgeCheck size={14} /><span><strong>Approve changes</strong><small>Submit the text above as a review.</small></span></button><button role="menuitem" onclick={() => choose('request_changes')}><ShieldAlert size={14} /><span><strong>Request changes</strong><small>Block merging until the concerns are addressed.</small></span></button>{/if}
          {#if active && ready}<button role="menuitem" onclick={() => choose('merge')}><GitMerge size={14} /><span><strong>Merge pull request</strong><small>Use the selected merge method.</small></span></button>{/if}
          {#if pullState === 'draft'}<button role="menuitem" onclick={() => choose('ready')}><GitPullRequest size={14} /><span><strong>Mark ready</strong><small>Move this pull request into review.</small></span></button>{/if}
          {#if active || pullState === 'draft'}<button class="danger" role="menuitem" onclick={() => choose('close')}><X size={14} /><span><strong>Close pull request</strong><small>Keep its commits and discussion.</small></span></button>{:else if pullState === 'closed'}<button role="menuitem" onclick={() => choose('reopen')}><RotateCcw size={14} /><span><strong>Reopen pull request</strong><small>Return it to active review.</small></span></button>{/if}
        </div>{/if}
      </div>
    </footer>
  </div>
</div>

<style>
  .composer-shell{display:grid;grid-template-columns:32px minmax(0,1fr);align-items:start;gap:10px}.avatar{display:grid;width:30px;height:30px;place-items:center;border-radius:50%;background:#d5b496;color:#3d2518;font-size:9px;font-weight:740}.composer{min-width:0}.composer>footer{display:flex;align-items:center;justify-content:space-between;gap:12px;margin-top:8px}.composer>footer>span{color:var(--text-faint);font-size:9px}.actions{position:relative;display:flex}.actions>button{display:flex;height:31px;align-items:center;justify-content:center;border:1px solid var(--brand);background:var(--brand);color:white;cursor:pointer;font-size:9px;font-weight:650}.actions>button:disabled{cursor:not-allowed;opacity:.45}.comment{gap:5px;padding:0 10px;border-radius:6px 0 0 6px}.more{width:31px;padding:0;border-left-color:rgb(255 255 255/.22)!important;border-radius:0 6px 6px 0}.menu{position:absolute;right:0;bottom:38px;z-index:45;width:286px;padding:5px;border:1px solid var(--border-strong);border-radius:8px;background:var(--surface-raised);box-shadow:var(--shadow-card)}.menu button{display:grid;width:100%;grid-template-columns:22px minmax(0,1fr);align-items:center;gap:6px;padding:8px;border:0;border-radius:5px;background:transparent;color:var(--text-muted);cursor:pointer;text-align:left}.menu button:hover{background:var(--surface-hover);color:var(--text-strong)}.menu button.danger{color:var(--danger)}.menu strong,.menu small{display:block}.menu strong{color:inherit;font-size:10px}.menu small{margin-top:2px;color:var(--text-faint);font-size:8px;line-height:1.35}
</style>
