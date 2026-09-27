<script lang="ts">
  import CircleAlert from '@lucide/svelte/icons/circle-alert';
  import Terminal from '@lucide/svelte/icons/terminal';
  import { formatBytes } from '$lib/bytes';

  let { text, bytes, unavailable, waiting }: { text: string; bytes: number; unavailable: boolean; waiting: boolean } =
    $props();
  let viewport = $state<HTMLPreElement>();
  let following = true;

  function trackFollow() {
    if (!viewport) return;
    following = viewport.scrollHeight - viewport.scrollTop - viewport.clientHeight < 32;
  }

  $effect(() => {
    void text;
    if (following && viewport) viewport.scrollTop = viewport.scrollHeight;
  });
</script>

<section class="overflow-hidden surface">
  <header
    class="flex h-10 items-center gap-2 border-b border-line-subtle bg-surface-muted/60 px-4 text-xs text-ink-muted"
  >
    <Terminal size={14} /><span class="font-semibold text-ink-strong">Log</span><span class="ml-auto tabular-nums"
      >{formatBytes(bytes)}</span
    >
  </header>
  {#if unavailable}
    <p class="flex items-center gap-2 px-4 py-5 text-sm text-danger">
      <CircleAlert size={15} />Stored log output is unavailable. Run metadata and artifacts are unaffected.
    </p>
  {:else}
    <pre
      bind:this={viewport}
      onscroll={trackFollow}
      class="m-0 max-h-[min(70vh,720px)] min-h-60 overflow-auto px-4 py-3.5 font-mono text-xs leading-5 wrap-anywhere whitespace-pre-wrap text-ink">{text ||
        (waiting ? 'Waiting for a matching runner…' : 'No log output.')}</pre>
  {/if}
</section>
