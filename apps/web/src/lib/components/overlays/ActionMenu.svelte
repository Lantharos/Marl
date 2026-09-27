<script lang="ts">
  import Ellipsis from '@lucide/svelte/icons/ellipsis';
  import { dismissable } from '$lib/actions/dismissable';
  import { popoverMotion } from '$lib/ui/popover';
  import Button from '../controls/Button.svelte';

  type Action = { label: string; onSelect: () => void; danger?: boolean };
  let { label, actions }: { label: string; actions: Action[] } = $props();
  let open = $state(false);
</script>

{#if actions.length}
  <div class="relative" use:dismissable={() => (open = false)}>
    <Button
      icon
      size="small"
      variant="ghost"
      aria-label={label}
      aria-haspopup="menu"
      aria-expanded={open}
      onkeydown={(event) => event.key === 'Escape' && (open = false)}
      onclick={() => (open = !open)}><Ellipsis size={16} /></Button
    >
    {#if open}
      <div
        class="absolute top-9 right-0 z-25 grid w-48 origin-top-right gap-0.5 popover p-1.5"
        role="menu"
        tabindex="-1"
        onkeydown={(event) => event.key === 'Escape' && (open = false)}
        transition:popoverMotion
      >
        {#each actions as action (action.label)}
          <button
            type="button"
            role="menuitem"
            class={[
              'flex h-9 w-full items-center rounded-lg px-2.5 text-left text-sm transition-colors',
              action.danger
                ? 'text-danger hover:bg-danger-soft'
                : 'text-ink hover:bg-surface-hover hover:text-ink-strong'
            ]}
            onclick={() => {
              open = false;
              action.onSelect();
            }}>{action.label}</button
          >
        {/each}
      </div>
    {/if}
  </div>
{/if}
