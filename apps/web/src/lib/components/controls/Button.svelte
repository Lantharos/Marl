<script lang="ts">
  import type { Snippet } from 'svelte';
  import type { HTMLButtonAttributes } from 'svelte/elements';

  type Variant = 'primary' | 'secondary' | 'danger' | 'danger-soft' | 'ghost';
  type Size = 'small' | 'medium' | 'large';

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
  } = $props<HTMLButtonAttributes & {
    variant?: Variant;
    size?: Size;
    icon?: boolean;
    block?: boolean;
    loading?: boolean;
    children: Snippet;
  }>();
</script>

<button {...attributes} {type} class="control button {variant} {size} {icon ? 'icon' : ''} {block ? 'block' : ''} {className}" disabled={disabled || loading} aria-busy={loading || undefined}>
  {#if loading}<span class="spinner" aria-hidden="true"></span>{/if}
  {@render children()}
</button>
