<script lang="ts">
  import type { HTMLInputAttributes } from 'svelte/elements';
  import Search from '@lucide/svelte/icons/search';

  let {
    value = $bindable(''),
    label,
    class: className = '',
    input = $bindable(),
    ...attributes
  }: HTMLInputAttributes & { value?: string; label: string; input?: HTMLInputElement } = $props();
</script>

<label class={['flex h-9 field min-h-0 items-center gap-2 px-3 text-ink-faint', className]}>
  <Search size={14} class="shrink-0" />
  <input
    bind:this={input}
    bind:value
    aria-label={label}
    placeholder={label}
    class="h-full w-full min-w-0 bg-transparent text-sm text-ink-strong outline-none placeholder:text-ink-faint"
    {...attributes}
  />
</label>
