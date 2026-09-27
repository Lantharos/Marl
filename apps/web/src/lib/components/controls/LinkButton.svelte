<script lang="ts">
  import type { Snippet } from 'svelte';
  import type { HTMLAnchorAttributes } from 'svelte/elements';

  type Variant = 'primary' | 'secondary' | 'danger-soft' | 'ghost';
  type Size = 'small' | 'medium' | 'large';

  let { variant = 'secondary', size = 'medium', block = false, class: className = '', children, ...attributes } = $props<HTMLAnchorAttributes & {
    variant?: Variant;
    size?: Size;
    block?: boolean;
    children: Snippet;
  }>();
</script>

<a {...attributes} class="control link-button {variant} {size} {block ? 'block' : ''} {className}">{@render children()}</a>
