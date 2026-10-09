<script lang="ts">
  import type { CursorList } from '#lib/ui/cursor-list.svelte.js';
  import Button from '../controls/Button.svelte';
  import Spinner from './Spinner.svelte';

  let { list }: { list: CursorList<{ id: string }> } = $props();

  function observe(node: HTMLElement) {
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting) && !list.loading && !list.error) void list.loadMore();
      },
      { rootMargin: '320px' }
    );
    observer.observe(node);
    return () => observer.disconnect();
  }
</script>

{#if list.nextCursor}
  {#key list.nextCursor}<div
      class="grid min-h-12 justify-items-center gap-2.5 p-5 text-sm text-ink-muted"
      {@attach observe}
      aria-live="polite"
    >
      {#if list.error}<p role="alert" class="text-danger">{list.error}</p>
        <Button size="small" onclick={list.loadMore}>Try again</Button>{:else if list.loading}<span
          class="flex items-center gap-2"><Spinner />Loading more</span
        >{/if}
    </div>{/key}
{/if}
