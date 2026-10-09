<script lang="ts">
  import Check from '@lucide/svelte/icons/check';
  import Copy from '@lucide/svelte/icons/copy';
  import Tooltip from '#lib/components/overlays/Tooltip.svelte';

  let { value }: { value: string } = $props();
  let copied = $state(false);
  const algorithm = $derived(value.length === 128 ? 'SHA-512' : 'SHA-256');

  async function copy() {
    await navigator.clipboard.writeText(value);
    copied = true;
    setTimeout(() => (copied = false), 1400);
  }
</script>

<div class="relative z-1 mt-1.5 ml-6.5 flex items-center gap-1.5 text-2xs text-ink-faint">
  <span class="shrink-0 font-semibold">{algorithm}</span>
  <code class="min-w-0 truncate font-mono text-ink-muted">{value}</code>
  <Tooltip text={copied ? 'Copied' : `Copy ${algorithm}`} as="label">
    {#snippet children(tooltip)}
      <button
        {...tooltip}
        type="button"
        class="grid size-6 shrink-0 place-items-center rounded-sm transition-colors hover:bg-surface-muted hover:text-ink-strong"
        onclick={copy}
        >{#if copied}<Check size={13} class="text-success" />{:else}<Copy size={13} />{/if}</button
      >
    {/snippet}
  </Tooltip>
</div>
