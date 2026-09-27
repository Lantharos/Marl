<script lang="ts">
  import { tick } from 'svelte';
  import type { IssueComment, IssueConclusion } from '@marl/contracts';
  import Pencil from '@lucide/svelte/icons/pencil';
  import Plus from '@lucide/svelte/icons/plus';
  import Button from '$lib/components/controls/Button.svelte';
  import MarkdownBody from '$lib/components/markdown/MarkdownBody.svelte';
  import MarkdownComposer from '$lib/components/markdown/MarkdownComposer.svelte';
  import Modal from '$lib/components/overlays/Modal.svelte';
  import Time from '$lib/components/page/Time.svelte';
  import type { MarkdownContext } from '$lib/markdown/context';

  let {
    conclusion,
    canEdit,
    busy,
    context,
    draftKey,
    onSave,
    onSource
  }: {
    conclusion: IssueConclusion | null;
    canEdit: boolean;
    busy: boolean;
    context: MarkdownContext;
    draftKey?: string;
    onSave: (body: string, commentId: string | null) => Promise<boolean>;
    onSource: (commentId: string) => Promise<void>;
  } = $props();
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
    const measure = () => {
      if (!expanded) overflow = node.scrollHeight > node.clientHeight + 1;
    };
    const observer = new ResizeObserver(measure);
    observer.observe(node);
    const markdown = node.querySelector('.markdown');
    if (markdown) observer.observe(markdown);
    return () => observer.disconnect();
  }
</script>

{#if conclusion}
  <section class="surface p-4">
    <header class="mb-2.5 flex min-h-7 items-center justify-between gap-2">
      <h3 class="text-sm font-semibold text-ink-strong">Conclusion</h3>
      {#if canEdit}<Button size="small" icon variant="ghost" aria-label="Edit conclusion" onclick={edit}
          ><Pencil size={14} /></Button
        >{/if}
    </header>
    <div class={expanded ? 'block' : 'line-clamp-9 overflow-hidden'} {@attach measureBody}>
      <MarkdownBody html={conclusion.bodyHtml} />
    </div>
    {#if overflow}<button
        type="button"
        class="mt-1.5 text-xs font-semibold text-brand hover:underline"
        aria-expanded={expanded}
        onclick={() => (expanded = !expanded)}>{expanded ? 'Show less' : 'Read conclusion'}</button
      >{/if}
    <footer class="mt-3 grid gap-1.5 text-xs text-ink-muted">
      {#if conclusion.commentId}<button
          type="button"
          class="justify-self-start font-semibold text-brand hover:underline"
          onclick={() => onSource(conclusion.commentId!)}>From the discussion</button
        >{/if}
      <span>{conclusion.authorDisplayName} · <Time value={conclusion.updatedAt} class="text-ink-muted" /></span>
    </footer>
  </section>
{:else if canEdit}
  <Button class="-ml-2 justify-start" variant="ghost" size="small" onclick={edit}
    ><Plus size={15} />Add a conclusion</Button
  >
{/if}

<Modal
  open={editing}
  title={conclusion ? 'Edit conclusion' : 'Add a conclusion'}
  description="Summarize what was decided. The original report stays as written."
  size="large"
  onClose={() => {
    if (!uploading) editing = false;
  }}
>
  <MarkdownComposer
    bind:value={body}
    bind:uploading
    {context}
    disabled={busy}
    draftKey={draftKey ? `${draftKey}:conclusion:${commentId ?? 'written'}` : undefined}
    placeholder="What did we agree on?"
    minHeight={160}
    onsubmit={save}
  />
  {#snippet actions()}
    {#if conclusion}<Button
        size="small"
        variant="ghost"
        class="mr-auto"
        disabled={busy || uploading}
        onclick={async () => {
          if (await onSave('', null)) await closeSaved();
        }}>Remove</Button
      >{/if}
    <Button size="small" disabled={uploading} onclick={() => (editing = false)}>Cancel</Button>
    <Button size="small" variant="primary" loading={busy} disabled={uploading || !body.trim()} onclick={save}
      >Save conclusion</Button
    >
  {/snippet}
</Modal>
