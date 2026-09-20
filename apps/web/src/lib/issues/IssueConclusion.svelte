<script lang="ts">
  import { tick } from 'svelte';
  import type { IssueComment, IssueConclusion } from '@marl/contracts';
  import Pencil from 'lucide-svelte/icons/pencil';
  import Plus from 'lucide-svelte/icons/plus';
  import Button from '$lib/components/Button.svelte';
  import MarkdownBody from '$lib/components/MarkdownBody.svelte';
  import MarkdownComposer from '$lib/components/MarkdownComposer.svelte';
  import Modal from '$lib/components/Modal.svelte';
  import Time from '$lib/components/Time.svelte';
  import type { MarkdownContext } from '$lib/markdown';

  let { conclusion, canEdit, busy, context, draftKey, onSave, onSource } = $props<{
    conclusion: IssueConclusion | null;
    canEdit: boolean;
    busy: boolean;
    context: MarkdownContext;
    draftKey?: string;
    onSave: (body: string, commentId: string | null) => Promise<boolean>;
    onSource: (commentId: string) => Promise<void>;
  }>();
  let editing = $state(false);
  let body = $state('');
  let commentId = $state<string | null>(null);
  let uploading = $state(false);
  let expanded = $state(false);
  let overflow = $state(false);

  export function promote(comment: IssueComment) {
    body = comment.body;
    commentId = comment.id;
    editing = true;
  }
  function edit() {
    body = conclusion?.body ?? '';
    commentId = conclusion?.commentId ?? null;
    editing = true;
  }
  async function save() {
    if (await onSave(body, commentId)) await closeSaved();
  }
  async function closeSaved() {
    body = '';
    await tick();
    editing = false;
  }
  function measureBody(node: HTMLElement) {
    const measure = () => { if (!expanded) overflow = node.scrollHeight > node.clientHeight + 1; };
    const observer = new ResizeObserver(measure);
    observer.observe(node);
    const markdown = node.querySelector('.markdown');
    if (markdown) observer.observe(markdown);
    return () => observer.disconnect();
  }
</script>

{#if conclusion}
  <section class="conclusion">
    <header><h2>Conclusion</h2>{#if canEdit}<Button size="small" icon variant="ghost" aria-label="Edit conclusion" onclick={edit}><Pencil size={13} /></Button>{/if}</header>
    <div class="conclusion-body" class:expanded {@attach measureBody}><MarkdownBody source={conclusion.body} {context} --markdown-font-size="13px" /></div>
    {#if overflow}<Button class="expand" size="small" variant="ghost" aria-expanded={expanded} onclick={() => (expanded = !expanded)}>{expanded ? 'Show less' : 'Read conclusion'}</Button>{/if}
    <footer>{#if conclusion.commentId}<Button class="source" size="small" variant="ghost" onclick={() => onSource(conclusion.commentId!)}>From the discussion</Button>{/if}<span>{conclusion.authorDisplayName} · <Time value={conclusion.updatedAt} /></span></footer>
  </section>
{:else if canEdit}
  <Button class="add-conclusion" variant="ghost" size="small" onclick={edit}><Plus size={14} />Add a conclusion</Button>
{/if}

<Modal open={editing} title={conclusion ? 'Edit conclusion' : 'Add a conclusion'} --modal-width="720px" onClose={() => { if (!uploading) editing = false; }}>
  {#snippet children()}<MarkdownComposer bind:value={body} bind:uploading {context} disabled={busy} draftKey={draftKey ? `${draftKey}:conclusion:${commentId ?? 'written'}` : undefined} placeholder="What did we agree on?" minHeight={160} />{/snippet}
  {#snippet actions()}
    {#if conclusion}<Button size="small" variant="ghost" disabled={busy || uploading} onclick={async () => { if (await onSave('', null)) await closeSaved(); }}>Remove</Button>{/if}
    <Button size="small" disabled={uploading} onclick={() => (editing = false)}>Cancel</Button>
    <Button size="small" variant="primary" disabled={busy || uploading || !body.trim()} onclick={save}>Save conclusion</Button>
  {/snippet}
</Modal>

<style>
  .conclusion{padding:16px;border-radius:11px;background:var(--surface);box-shadow:var(--shadow-surface)}
  header{display:flex;align-items:center;justify-content:space-between;gap:8px;min-height:26px;margin-bottom:12px}
  h2{margin:0;color:var(--text-strong);font-size:13px;font-weight:650}
  .conclusion-body{display:-webkit-box;-webkit-box-orient:vertical;-webkit-line-clamp:9;line-clamp:9;overflow:hidden}
  .conclusion-body.expanded{display:block;overflow:visible}
  footer{display:grid;gap:7px;margin-top:13px}
  footer>span{color:var(--text-faint);font-size:11px;line-height:1.5}
  :global(.source.button),:global(.expand.button){justify-self:start;height:auto;min-height:26px;padding:0;color:var(--brand);font-size:11px}
  :global(.expand.button){margin-top:6px}
  :global(.add-conclusion.button){justify-content:flex-start;margin-left:-8px;color:var(--text-muted)}
</style>
