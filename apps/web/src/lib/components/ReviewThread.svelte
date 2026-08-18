<script lang="ts">
  import type { ReviewThread } from '@marl/contracts';
  import Check from 'lucide-svelte/icons/check';
  import ChevronDown from 'lucide-svelte/icons/chevron-down';
  import ChevronRight from 'lucide-svelte/icons/chevron-right';
  import Pencil from 'lucide-svelte/icons/pencil';
  import Reply from 'lucide-svelte/icons/reply';
  import Trash2 from 'lucide-svelte/icons/trash-2';
  import MarkdownBody from './MarkdownBody.svelte';
  import MarkdownComposer from './MarkdownComposer.svelte';
  import Time from './Time.svelte';
  import UserAvatar from './UserAvatar.svelte';

  let { thread, busy, inline = false, onReply, onResolve, onEdit, onDelete } = $props<{
    thread: ReviewThread;
    busy: boolean;
    inline?: boolean;
    onReply: (threadId: string, body: string) => Promise<void>;
    onResolve: (threadId: string, resolved: boolean) => Promise<void>;
    onEdit: (commentId: string, body: string) => Promise<void>;
    onDelete: (commentId: string) => Promise<void>;
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
    {#if thread.resolved}<button class="collapse" aria-label={expanded ? 'Collapse resolved conversation' : 'Expand resolved conversation'} onclick={() => (expanded = !expanded)}>{#if expanded}<ChevronDown size={14} />{:else}<ChevronRight size={14} />{/if}</button>{/if}
    <span class="path">{thread.path}:{thread.startLine === thread.line ? thread.line : `${thread.startLine}–${thread.line}`}</span>
    <div>{#if thread.outdated}<span>Outdated</span>{:else if thread.resolved}<span class="resolved"><Check size={11} />Resolved</span><button disabled={busy} onclick={() => onResolve(thread.id, false)}>Reopen</button>{:else}<button disabled={busy} onclick={() => onResolve(thread.id, true)}>Resolve conversation</button>{/if}</div>
  </header>
  {#if !thread.resolved || expanded}
    {#each thread.comments as comment}
      <section class="entry"><div class="meta"><UserAvatar name={comment.author} src={comment.authorAvatarUrl} size={23} /><strong>{comment.author}</strong><Time value={comment.createdAt} />{#if comment.canEdit && !comment.deleted}<div class="actions"><button aria-label="Edit comment" onclick={() => { editing = comment.id; editBody = comment.body; }}><Pencil size={12} /></button>{#if confirmingDelete === comment.id}<button class="confirm" onclick={async () => { await onDelete(comment.id); confirmingDelete = null; }}>Delete</button><button onclick={() => (confirmingDelete = null)}>Cancel</button>{:else}<button aria-label="Delete comment" onclick={() => (confirmingDelete = comment.id)}><Trash2 size={12} /></button>{/if}</div>{/if}</div>
        {#if comment.deleted}<p class="deleted">Comment deleted</p>{:else if editing === comment.id}<MarkdownComposer bind:value={editBody} minHeight={70} /><footer><button onclick={() => (editing = null)}>Cancel</button><button class="primary" disabled={busy || !editBody.trim()} onclick={() => submitEdit(comment.id)}>Save</button></footer>{:else}<MarkdownBody source={comment.body} />{/if}
      </section>
    {/each}
    {#if !thread.outdated && !thread.resolved}
      {#if replying}<div class="reply-composer"><MarkdownComposer bind:value={replyBody} placeholder="Reply to this conversation" minHeight={70} /><footer><button onclick={() => (replying = false)}>Cancel</button><button class="primary" disabled={busy || !replyBody.trim()} onclick={submitReply}>Reply</button></footer></div>{:else}<button class="reply" onclick={() => (replying = true)}><Reply size={13} />Reply</button>{/if}
    {/if}
  {/if}
</article>

<style>
  .thread{content-visibility:auto;contain-intrinsic-size:auto 150px}
  .thread{overflow:hidden;border:1px solid var(--border);border-radius:8px;background:var(--surface)}.thread.inline{margin:10px}.thread.outdated{opacity:.65}.thread>header{display:flex;min-height:39px;align-items:center;padding:0 11px;border-bottom:1px solid var(--border-subtle);background:var(--surface-muted)}.thread.collapsed>header{border-bottom:0}header>div{display:flex;align-items:center;gap:7px;margin-left:auto}header span{color:var(--warning);font-size:9px}header .resolved{display:flex;align-items:center;gap:4px;color:var(--success)}button{border:0;background:transparent;color:var(--text-muted);cursor:pointer;font-size:9px}header button{height:25px;padding:0 8px;border:1px solid var(--border);border-radius:5px;background:var(--surface)}header .collapse{display:grid;width:25px;margin-right:5px;padding:0;place-items:center;border:0;background:transparent}header button:hover{border-color:var(--border-strong);color:var(--text-strong)}.entry{padding:11px 13px}.entry+.entry{border-top:1px solid var(--border-subtle)}.meta{display:flex;align-items:center;gap:7px;margin-bottom:9px}.meta strong{color:var(--text-strong);font-size:10px}.actions{display:flex;align-items:center;gap:2px;margin-left:auto}.actions button{display:grid;min-width:25px;height:25px;padding:0 6px;place-items:center;border-radius:5px}.actions button:hover{background:var(--surface-hover);color:var(--text)}.actions .confirm{background:var(--danger-soft);color:var(--danger)}.deleted{margin:0;color:var(--text-faint);font-size:10px;font-style:italic}.entry footer,.reply-composer footer{display:flex;justify-content:flex-end;gap:6px;margin-top:7px}.entry footer button,.reply-composer footer button{height:29px;padding:0 9px;border:1px solid var(--border);border-radius:5px;background:var(--surface)}button.primary{border-color:var(--brand)!important;background:var(--brand)!important;color:white!important}.reply{display:flex;align-items:center;gap:5px;margin:0 11px 10px;padding:6px 8px;border-radius:5px}.reply:hover{background:var(--surface-hover);color:var(--text-strong)}.reply-composer{padding:11px;border-top:1px solid var(--border-subtle)}
</style>
