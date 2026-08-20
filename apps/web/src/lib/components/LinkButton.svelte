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

<a {...attributes} class="link-button {variant} {size} {block ? 'block' : ''} {className}">{@render children()}</a>

<style>
  .link-button{display:inline-flex;flex:0 0 auto;align-items:center;justify-content:center;gap:7px;border:1px solid transparent;border-radius:6px;font-weight:630;line-height:1;text-decoration:none;white-space:nowrap;transition:background-color 120ms ease,border-color 120ms ease,color 120ms ease,box-shadow 120ms ease}.block{width:100%}.small{height:30px;padding:0 9px;font-size:10px}.medium{height:36px;padding:0 12px;font-size:12px}.large{height:38px;padding:0 13px;font-size:12px}.secondary{border-color:var(--border);background:var(--surface);color:var(--text)}.secondary:hover{border-color:var(--border-strong);background:var(--surface-muted);color:var(--text-strong)}.primary{border-color:var(--brand);background:var(--brand);color:white}.primary:hover{border-color:var(--brand-hover);background:var(--brand-hover)}.danger-soft{border-color:color-mix(in srgb,var(--danger) 60%,var(--border));background:var(--danger-soft);color:var(--danger)}.danger-soft:hover{border-color:var(--danger);background:color-mix(in srgb,var(--danger-soft) 82%,var(--danger))}.ghost{border-color:transparent;background:transparent;color:var(--text-muted)}.ghost:hover{background:var(--surface-hover);color:var(--text-strong)}.link-button:active{filter:brightness(.94)}.link-button:focus-visible{outline:2px solid var(--brand);outline-offset:2px}
</style>
