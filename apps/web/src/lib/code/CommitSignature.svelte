<script lang="ts">
  import BadgeCheck from '@lucide/svelte/icons/badge-check';
  import ShieldAlert from '@lucide/svelte/icons/shield-alert';
  import ShieldQuestion from '@lucide/svelte/icons/shield-question-mark';

  let { status }: { status?: string | null } = $props();
  const base = 'inline-flex shrink-0 items-center gap-1 text-xs font-semibold whitespace-nowrap';
</script>

{#if status === 'verified'}
  <span class="{base} text-success" title="SSH signature verified against the author’s registered key"
    ><BadgeCheck size={14} />Verified</span
  >
{:else if status === 'invalid'}
  <span class="{base} text-danger" title="This signature could not be validated against the author’s registered keys"
    ><ShieldAlert size={14} />Unverified</span
  >
{:else if status === 'unverified'}
  <span class="{base} text-ink-muted" title="No verified SSH signature for this author"
    ><ShieldQuestion size={14} />Unverified</span
  >
{/if}
