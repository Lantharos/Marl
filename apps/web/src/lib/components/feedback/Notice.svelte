<script lang="ts">
  import type { Snippet } from 'svelte';
  import CircleAlert from '@lucide/svelte/icons/circle-alert';
  import CircleCheck from '@lucide/svelte/icons/circle-check';
  import X from '@lucide/svelte/icons/x';
  import type { LucideIcon } from '@lucide/svelte';
  import Button from '../controls/Button.svelte';

  type Tone = 'danger' | 'success' | 'warning' | 'brand';
  let {
    tone = 'danger',
    icon,
    class: className = '',
    action,
    dismissLabel = 'Dismiss',
    ondismiss,
    children
  }: {
    tone?: Tone;
    icon?: LucideIcon;
    class?: string;
    action?: Snippet;
    dismissLabel?: string;
    ondismiss?: () => void;
    children: Snippet;
  } = $props();
  const tones: Record<Tone, string> = {
    danger: 'bg-danger-soft text-danger',
    success: 'bg-success-soft text-success',
    warning: 'bg-warning-soft text-warning',
    brand: 'bg-brand-soft text-brand'
  };
  const Icon = $derived(icon ?? (tone === 'success' ? CircleCheck : CircleAlert));
  const compact = $derived(Boolean(action || ondismiss));
</script>

<div
  role={tone === 'danger' ? 'alert' : 'status'}
  class={[
    'flex gap-2 rounded-md text-sm leading-snug',
    compact ? 'items-center py-1.5 pr-1.5 pl-3' : 'items-start px-3 py-2.5',
    tones[tone],
    className
  ]}
>
  <Icon size={15} class={['shrink-0', !compact && 'mt-px']} />
  <span class="min-w-0 flex-1">{@render children()}</span>
  {@render action?.()}
  {#if ondismiss}<Button icon size="small" variant="ghost" aria-label={dismissLabel} onclick={ondismiss}
      ><X size={14} /></Button
    >{/if}
</div>
