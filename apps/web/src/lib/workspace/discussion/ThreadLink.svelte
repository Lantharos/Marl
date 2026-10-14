<script lang="ts">
  import type { ReviewThread } from '@marl/contracts';
  import CircleCheck from '@lucide/svelte/icons/circle-check';
  import MessageSquare from '@lucide/svelte/icons/message-square';

  let { thread, onShow }: { thread: ReviewThread; onShow: (thread: ReviewThread) => void } = $props();
  const first = $derived(thread.comments.find((comment) => !comment.deleted));
  const excerpt = $derived(
    first?.body
      .replace(/[`*_~#>[\]]|\(https?:[^)]*\)/g, '')
      .replace(/\s+/g, ' ')
      .trim()
  );
  const replies = $derived(thread.comments.length - 1);
</script>

<button
  type="button"
  class="grid w-full grid-cols-[16px_minmax(0,1fr)] gap-x-2.5 rounded-xl bg-surface px-3 py-2.5 text-left transition-colors hover:bg-surface-hover"
  onclick={() => onShow(thread)}
>
  {#if thread.resolved}<CircleCheck size={15} class="mt-0.5 text-success" />{:else}<MessageSquare
      size={15}
      class="mt-0.5 text-ink-muted"
    />{/if}
  <span class="min-w-0">
    <span class="flex min-w-0 items-baseline gap-1.5 text-xs text-ink-muted"
      ><span class="flex min-w-0 font-mono"
        ><span class="truncate text-ink">{thread.path}</span><span class="shrink-0">:{thread.line}</span></span
      >{#if replies > 0}<span class="ml-auto shrink-0">{replies} {replies === 1 ? 'reply' : 'replies'}</span>{/if}</span
    >
    {#if first}<span class="mt-1 line-clamp-2 text-sm text-ink"
        ><span class="font-semibold text-ink-strong">{first.authorDisplayName || first.author}</span>
        {excerpt}</span
      >{/if}
  </span>
</button>
