<script lang="ts">
  import type { Snippet } from 'svelte';
  import type { ClassValue } from 'svelte/elements';
  import Check from '@lucide/svelte/icons/check';
  import type { IconComponent } from '#lib/ui/icon.js';

  let {
    href,
    icon: Icon,
    iconClass = 'text-ink-muted',
    tone = 'default',
    checked,
    description,
    disabled = false,
    onselect,
    children
  }: {
    href?: string;
    icon?: IconComponent;
    iconClass?: ClassValue;
    tone?: 'default' | 'danger';
    checked?: boolean;
    description?: string;
    disabled?: boolean;
    onselect?: () => void;
    children: Snippet;
  } = $props();

  const classes = $derived([
    'flex min-h-9.5 w-full items-center gap-3 rounded-lg px-2.5 py-1.5 text-left text-sm outline-none transition-colors disabled:cursor-not-allowed disabled:opacity-50',
    tone === 'danger' ? 'text-danger focus:bg-danger-soft' : 'text-ink focus:bg-surface-muted focus:text-ink-strong'
  ]);

  function select(event: MouseEvent & { currentTarget: HTMLElement }) {
    event.currentTarget.closest<HTMLElement>('[popover]')?.hidePopover();
    onselect?.();
  }
</script>

{#snippet content()}
  {#if Icon}<Icon size={16} class={['shrink-0', tone === 'default' && iconClass]} />{/if}
  {#if description}
    <span class="min-w-0 flex-1">
      <strong class="block font-semibold text-ink-strong">{@render children()}</strong>
      <span class="mt-0.5 block text-xs text-ink-muted">{description}</span>
    </span>
  {:else}
    <span class="min-w-0 flex-1 truncate">{@render children()}</span>
  {/if}
  {#if checked}<Check size={15} class="shrink-0 text-brand" />{/if}
{/snippet}

{#if href}
  <a {href} role="menuitem" tabindex="-1" class={classes} onclick={select}>{@render content()}</a>
{:else}
  <button
    type="button"
    role={checked === undefined ? 'menuitem' : 'menuitemradio'}
    aria-checked={checked}
    tabindex="-1"
    {disabled}
    class={classes}
    onclick={select}>{@render content()}</button
  >
{/if}
