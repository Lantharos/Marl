<script lang="ts">
  import BadgeCheck from '@lucide/svelte/icons/badge-check';
  import ShieldAlert from '@lucide/svelte/icons/shield-alert';
  import ShieldQuestion from '@lucide/svelte/icons/shield-question-mark';
  import Tooltip from '#lib/components/overlays/Tooltip.svelte';

  let { status }: { status?: string | null } = $props();
  const signatures = {
    verified: {
      label: 'Verified',
      description: 'SSH signature verified against the author’s registered key',
      icon: BadgeCheck,
      tone: 'text-success'
    },
    invalid: {
      label: 'Unverified',
      description: 'This signature could not be validated against the author’s registered keys',
      icon: ShieldAlert,
      tone: 'text-danger'
    },
    unverified: {
      label: 'Unverified',
      description: 'No verified SSH signature for this author',
      icon: ShieldQuestion,
      tone: 'text-ink-muted'
    }
  };
  const signature = $derived(status && status in signatures ? signatures[status as keyof typeof signatures] : null);
</script>

{#if signature}
  <Tooltip text={signature.description}>
    {#snippet children(tooltip)}
      <span
        {...tooltip}
        class={['inline-flex shrink-0 items-center gap-1 text-xs font-semibold whitespace-nowrap', signature.tone]}
        ><signature.icon size={14} />{signature.label}</span
      >
    {/snippet}
  </Tooltip>
{/if}
