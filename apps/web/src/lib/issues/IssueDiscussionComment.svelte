<script lang="ts">
  import { tick } from 'svelte';
  import type { IssueComment } from '@marl/contracts';
  import Ellipsis from 'lucide-svelte/icons/ellipsis';
  import Reply from 'lucide-svelte/icons/reply';
  import { dismissable } from '$lib/actions/dismissable';
  import { popoverMotion } from '$lib/ui/popover';
  import Button from '$lib/components/Button.svelte';
  import MarkdownBody from '$lib/components/MarkdownBody.svelte';
  import MarkdownComposer from '$lib/components/MarkdownComposer.svelte';
  import Time from '$lib/components/Time.svelte';
  import UserProfileLink from '$lib/components/UserProfileLink.svelte';
  import type { MarkdownContext } from '$lib/markdown';

  let { comment, sequence, context, canReply, canConclude, busy, replyTarget, draftKey, onReply, onSave, onDelete, onConclude, onSource } = $props<{
    comment: IssueComment;
    sequence?: number;
    context: MarkdownContext;
    canReply: boolean;
    canConclude: boolean;
    busy: boolean;
    replyTarget?: IssueComment;
    draftKey?: string;
    onReply: (comment: IssueComment, quote: string) => void;
    onSave: (id: string, body: string) => Promise<boolean>;
    onDelete: (id: string) => Promise<boolean>;
    onConclude: (comment: IssueComment) => void;
    onSource: (commentId: string) => Promise<void>;
  }>();
  let menuOpen = $state(false);
  let editing = $state(false);
  let deleting = $state(false);
  let editedBody = $state('');
  let uploading = $state(false);
  let bodyElement = $state<HTMLDivElement>();

  function reply() {
    const selection = window.getSelection();
    const selected = selection?.rangeCount && bodyElement?.contains(selection.getRangeAt(0).commonAncestorContainer)
      ? selection.toString().trim().slice(0, 4000)
      : '';
    onReply(comment, selected ? `${selected.split('\n').map((line) => `> ${line}`).join('\n')}\n\n` : '');
  }
  async function save() {
    if (await onSave(comment.id, editedBody)) {
      editedBody = '';
      await tick();
      editing = false;
    }
  }
  function watchMenu(node: HTMLElement) {
    if (!menuOpen) return;
    const dismiss = dismissable(node, () => (menuOpen = false));
    const keydown = (event: KeyboardEvent) => { if (event.key === 'Escape') menuOpen = false; };
    node.addEventListener('keydown', keydown);
    return () => { dismiss.destroy(); node.removeEventListener('keydown', keydown); };
  }
</script>

<article id={`comment-${comment.id}`} class="comment" tabindex="-1">
  <header>
    <UserProfileLink handle={comment.author} displayName={comment.authorDisplayName} avatarUrl={comment.authorAvatarUrl} size={28} />
    <a class="time-link" href={`#comment-${comment.id}`}><Time value={comment.createdAt} /></a>
    {#if comment.updatedAt !== comment.createdAt && !comment.deleted}<span class="edited">edited</span>{/if}
    {#if !comment.deleted && (comment.canEdit || canConclude)}
      <div class="options" {@attach watchMenu}>
        <Button icon size="small" variant="ghost" aria-label={`Options for ${comment.authorDisplayName}’s comment`} aria-expanded={menuOpen} onkeydown={(event) => event.key === 'Escape' && (menuOpen = false)} onclick={() => (menuOpen = !menuOpen)}><Ellipsis size={16} /></Button>
        {#if menuOpen}<div class="menu" transition:popoverMotion>
          {#if canConclude}<Button block size="small" variant="ghost" onclick={() => { menuOpen = false; onConclude(comment); }}>Use as conclusion</Button>{/if}
          {#if comment.canEdit}
            <Button block size="small" variant="ghost" onclick={() => { editedBody = comment.body; editing = true; menuOpen = false; }}>Edit</Button>
            <Button block size="small" variant="ghost" onclick={() => { deleting = true; menuOpen = false; }}>Delete</Button>
          {/if}
        </div>{/if}
      </div>
    {/if}
  </header>
  {#if replyTarget && replyTarget.id !== comment.parentId}<a class="reply-target" href={`#comment-${replyTarget.id}`} onclick={(event) => { event.preventDefault(); void onSource(replyTarget!.id); }}><Reply size={12} />{replyTarget.authorDisplayName}</a>{/if}
  <div class="body" bind:this={bodyElement}>
    {#if comment.deleted}<p class="deleted">Comment deleted.</p>
    {:else if editing}
      <MarkdownComposer bind:value={editedBody} bind:uploading {context} disabled={busy} compact minHeight={110} draftKey={draftKey ? `${draftKey}:edit:${comment.id}` : undefined} />
      <footer><Button size="small" variant="ghost" disabled={uploading} onclick={() => (editing = false)}>Cancel</Button><Button size="small" variant="primary" disabled={busy || uploading || !editedBody.trim()} onclick={save}>Save</Button></footer>
    {:else}<MarkdownBody source={comment.body} {context} --markdown-font-size="14px" />{/if}
  </div>
  {#if deleting}<div class="delete-confirmation"><span>Delete this comment?</span><Button size="small" variant="ghost" disabled={busy} onclick={() => (deleting = false)}>Cancel</Button><Button size="small" variant="danger-soft" disabled={busy} onclick={async () => { if (await onDelete(comment.id)) deleting = false; }}>Delete</Button></div>
  {:else if !comment.deleted && !editing && canReply}<Button class="reply-button" size="small" variant="ghost" onclick={reply}><Reply size={14} />Reply</Button>{/if}
  {#if sequence !== undefined}<span class="read-marker" data-read-sequence={sequence} aria-hidden="true"></span>{/if}
</article>

<style>
  .comment{position:relative;min-width:0;scroll-margin-block:100px;outline:none}
  .comment:target,.comment:focus-visible{outline:1px solid var(--brand);outline-offset:8px;border-radius:5px}
  header{display:flex;flex-wrap:wrap;align-items:center;gap:6px 10px;min-height:28px;color:var(--text-muted);font-size:12px}
  header :global(.user-profile-link){margin-right:auto;font-size:12px}
  .time-link{color:var(--text-muted);text-decoration:none;font-size:11px}
  .time-link:hover{color:var(--text-strong)}
  .edited{font-size:11px;color:var(--text-faint)}
  .options{position:relative;margin-right:-6px}
  .menu{position:absolute;right:0;top:34px;z-index:25;width:180px;padding:7px;border-radius:14px;background:var(--surface-raised);box-shadow:var(--shadow-popover);transform-origin:top right}
  .menu :global(.button){justify-content:flex-start}
  .body{padding-top:12px}
  .body footer,.delete-confirmation{display:flex;align-items:center;justify-content:flex-end;flex-wrap:wrap;gap:7px;margin-top:12px}
  .delete-confirmation span{margin-right:auto;color:var(--text-muted);font-size:12px}
  .deleted{margin:0;color:var(--text-faint);font-size:13px}
  .reply-target{display:flex;align-items:center;gap:5px;width:fit-content;margin-top:10px;color:var(--text-muted);font-size:11px;text-decoration:none}
  .reply-target:hover{color:var(--brand)}
  :global(.reply-button.button){height:29px;margin:9px 0 -4px -7px;color:var(--text-muted);font-size:11px}
  .read-marker{display:block;height:1px;pointer-events:none}
  @media(max-width:500px){header :global(.user-profile-link){max-width:calc(100% - 35px)}.time-link{margin-left:35px}.options{margin-left:auto}}
</style>
