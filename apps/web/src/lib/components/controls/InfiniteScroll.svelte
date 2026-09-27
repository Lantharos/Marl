<script lang="ts">
  import Button from './Button.svelte';
  let { cursor, loading, error = '', onload } = $props<{ cursor: string | null; loading: boolean; error?: string; onload: () => void }>();
  function observe(node: HTMLElement) {
    const observer = new IntersectionObserver(entries => {
      if (entries.some(entry => entry.isIntersecting) && !loading && !error) onload();
    }, { rootMargin: '320px' });
    observer.observe(node);
    return () => observer.disconnect();
  }
</script>

{#if cursor}
  {#key cursor}<div class="sentinel" {@attach observe} aria-live="polite">
    {#if error}<p role="alert">{error}</p><Button size="small" onclick={onload}>Try again</Button>{:else if loading}<span>Loading…</span>{/if}
  </div>{/key}
{/if}

<style>.sentinel{display:grid;justify-items:center;gap:10px;min-height:48px;padding:18px;color:var(--text-muted);font-size:13px}.sentinel p{margin:0;color:var(--danger)}</style>
