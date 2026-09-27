<script lang="ts">
  import type { Snippet } from 'svelte';
  import type { HTMLButtonAttributes } from 'svelte/elements';
  import { buttonClass, type ButtonSize, type ButtonVariant } from './button-styles';
  import Spinner from '../feedback/Spinner.svelte';

  let {
    variant = 'secondary',
    size = 'medium',
    icon = false,
    block = false,
    loading = false,
    disabled = false,
    class: className = '',
    children,
    type = 'button',
    ...attributes
  }: HTMLButtonAttributes & {
    variant?: ButtonVariant;
    size?: ButtonSize;
    icon?: boolean;
    block?: boolean;
    loading?: boolean;
    children: Snippet;
  } = $props();
</script>

<button
  {...attributes}
  {type}
  class={[buttonClass(variant, size, icon, block), className]}
  disabled={disabled || loading}
  aria-busy={loading || undefined}
>
  {#if loading}<Spinner />{/if}
  {@render children()}
</button>
