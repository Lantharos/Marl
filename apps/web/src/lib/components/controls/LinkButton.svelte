<script lang="ts">
  import type { Snippet } from 'svelte';
  import type { HTMLAnchorAttributes } from 'svelte/elements';
  import { buttonClass, type ButtonSize, type ButtonVariant } from './button-styles';

  let {
    variant = 'secondary',
    size = 'medium',
    icon = false,
    block = false,
    class: className = '',
    children,
    ...attributes
  }: HTMLAnchorAttributes & {
    variant?: ButtonVariant;
    size?: ButtonSize;
    icon?: boolean;
    block?: boolean;
    children: Snippet;
  } = $props();
</script>

<a {...attributes} class={[buttonClass(variant, size, icon, block), className]}>{@render children()}</a>
