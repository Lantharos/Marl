<script lang="ts">
  import type { Snippet } from 'svelte';
  import type { HTMLAnchorAttributes } from 'svelte/elements';
  import { chipClass } from './Chip.svelte';

  let {
    active = false,
    children,
    class: className = '',
    ...attributes
  }: HTMLAnchorAttributes & { active?: boolean; children: Snippet } = $props();
</script>

<a {...attributes} class={[chipClass(active), className]} aria-current={active ? 'page' : undefined}
  >{@render children()}</a
>
