<script lang="ts">
  import type { ReviewThread } from '@marl/contracts';
  import Check from 'lucide-svelte/icons/check';
  import ChevronDown from 'lucide-svelte/icons/chevron-down';
  import ChevronRight from 'lucide-svelte/icons/chevron-right';
  import Pencil from 'lucide-svelte/icons/pencil';
  import Reply from 'lucide-svelte/icons/reply';
  import Trash2 from 'lucide-svelte/icons/trash-2';
  import Button from './Button.svelte';
  import MarkdownBody from './MarkdownBody.svelte';
  import MarkdownComposer from './MarkdownComposer.svelte';
  import Time from './Time.svelte';
  import UserProfileLink from './UserProfileLink.svelte';
  import type { MarkdownContext } from '$lib/markdown';

  let { thread, busy, inline = false, interactive = true, onReply, onResolve, onEdit, onDelete, context } = $props<{
    thread: ReviewThread;
    busy: boolean;
    inline?: boolean;
    interactive?: boolean;
    onReply: (threadId: string, body: string) => Promise<void>;
    onResolve: (threadId: string, resolved: boolean) => Promise<void>;
    onEdit: (commentId: string, body: string) => Promise<void>;
    onDelete: (commentId: string) => Promise<void>;
    context?: MarkdownContext;
  }>();
  let replyBody = $state('');
  let replying = $state(false);
  let editing = $state<string | null>(null);
  let editBody = $state('');
  let confirmingDelete = $state<string | null>(null);
  let expanded = $state(true);

  $effect(() => { if (thread.resolved) expanded = false; });

  async function submitReply() { if (!replyBody.trim()) return; await onReply(thread.id, replyBody); replyBody = ''; replying = false; }
  async function submitEdit(id: string) { if (!editBody.trim()) return; await onEdit(id, editBody); editing = null; editBody = ''; }
</script>

<article class="thread" class:inline class:outdated={thread.outdated} class:collapsed={thread.resolved && !expanded}>
  <header>
    {#if thread.resolved}<Button class="collapse" icon size="small" variant="ghost" aria-label={expanded ? 'Collapse resolved conversation' : 'Expand resolved conversation'} onclick={() => (expanded = !expanded)}>{#if expanded}<ChevronDown size={14} />{:else}<ChevronRight size={14} />{/if}</Button>{/if}
    <span class="path">{thread.path}:{thread.startLine === thread.line ? thread.line : `${thread.startLine}–${thread.line}`}</span>
    <div>{#if thread.outdated}<span>Outdated</span>{:else if thread.resolved}<span class="resolved"><Check size={11} />Resolved</span>{#if interactive}<Button size="small" disabled={busy} onclick={() => onResolve(thread.id, false)}>Reopen</Button>{/if}{:else if interactive}<Button size="small" disabled={busy} onclick={() => onResolve(thread.id, true)}>Resolve conversation</Button>{/if}</div>
  </header>
  {#if !thread.resolved || expanded}
    {#each thread.comments as comment (comment.id)}
      <section class="entry"><div class="meta"><UserProfileLink handle={comment.author} displayName={comment.authorDisplayName} avatarUrl={comment.authorAvatarUrl} size={23} /><Time value={comment.createdAt} />{#if interactive && comment.canEdit && !comment.deleted}<div class="actions"><Button variant="ghost" size="small" icon aria-label="Edit comment" onclick={() => { editing = comment.id; editBody = comment.body; }}><Pencil size={12} /></Button>{#if confirmingDelete === comment.id}<Button variant="danger-soft" size="small" onclick={async () => { await onDelete(comment.id); confirmingDelete = null; }}>Delete</Button><Button variant="ghost" size="small" onclick={() => (confirmingDelete = null)}>Cancel</Button>{:else}<Button variant="ghost" size="small" icon aria-label="Delete comment" onclick={() => (confirmingDelete = comment.id)}><Trash2 size={12} /></Button>{/if}</div>{/if}</div>
        {#if comment.deleted}<p class="deleted">Comment deleted</p>{:else if editing === comment.id}<MarkdownComposer bind:value={editBody} {context} minHeight={70} /><footer><Button size="small" onclick={() => (editing = null)}>Cancel</Button><Button size="small" variant="primary" disabled={busy || !editBody.trim()} onclick={() => submitEdit(comment.id)}>Save</Button></footer>{:else}<MarkdownBody source={comment.body} {context} />{/if}
      </section>
    {/each}
    {#if interactive && !thread.outdated && !thread.resolved}
      {#if replying}<div class="reply-composer"><MarkdownComposer bind:value={replyBody} {context} placeholder="Reply to this conversation" minHeight={70} /><footer><Button size="small" onclick={() => (replying = false)}>Cancel</Button><Button size="small" variant="primary" disabled={busy || !replyBody.trim()} onclick={submitReply}>Reply</Button></footer></div>{:else}<Button class="reply" variant="ghost" size="small" onclick={() => (replying = true)}><Reply size={13} />Reply</Button>{/if}
    {/if}
  {/if}
</article>

<style>
  .thread{content-visibility:auto;contain-intrinsic-size:auto 150px}
  .thread{overflow:hidden;border:1px solid var(--border);border-radius:8px;background:var(--surface)}.thread.inline{margin:10px}.thread.outdated{opacity:.65}.thread>header{display:flex;min-height:39px;align-items:center;padding:0 11px;border-bottom:1px solid var(--border-subtle);background:var(--surface-muted)}.thread.collapsed>header{border-bottom:0}header>div{display:flex;align-items:center;gap:7px;margin-left:auto}header span{color:var(--warning);font-size:9px}header .resolved{display:flex;align-items:center;gap:4px;color:var(--success)}header :global(.collapse.button){width:25px;height:25px;margin-right:5px}.entry{padding:11px 13px}.entry+.entry{border-top:1px solid var(--border-subtle)}.meta{display:flex;align-items:center;gap:7px;margin-bottom:9px}.meta :global(.user-profile-link){font-size:10px}.actions{display:flex;align-items:center;gap:2px;margin-left:auto}.deleted{margin:0;color:var(--text-faint);font-size:10px;font-style:italic}.entry footer,.reply-composer footer{display:flex;justify-content:flex-end;gap:6px;margin-top:7px}:global(.reply){margin:0 11px 10px}.reply-composer{padding:11px;border-top:1px solid var(--border-subtle)}
</style>
