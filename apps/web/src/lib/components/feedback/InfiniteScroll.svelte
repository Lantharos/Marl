<script lang="ts">
  import Button from '../controls/Button.svelte';
  import Spinner from './Spinner.svelte';

  let {
    cursor,
    loading,
    error = '',
    onload
  }: { cursor: string | null; loading: boolean; error?: string; onload: () => void } = $props();

  function observe(node: HTMLElement) {
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting) && !loading && !error) onload();
      },
      { rootMargin: '320px' }
    );
    observer.observe(node);
    return () => observer.disconnect();
  }
</script>

{#if cursor}
  {#key cursor}<div
      class="grid min-h-12 justify-items-center gap-2.5 p-5 text-sm text-ink-muted"
      {@attach observe}
      aria-live="polite"
    >
      {#if error}<p role="alert" class="text-danger">{error}</p>
        <Button size="small" onclick={onload}>Try again</Button>{:else if loading}<span class="flex items-center gap-2"
          ><Spinner />Loading more</span
        >{/if}
    </div>{/key}
{/if}
