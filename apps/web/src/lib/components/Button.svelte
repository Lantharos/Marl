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

<button {...attributes} {type} class="button {variant} {size} {icon ? 'icon' : ''} {block ? 'block' : ''} {className}" disabled={disabled || loading} aria-busy={loading || undefined}>
  {@render children()}
</button>

<style>
  .button{display:inline-flex;flex:0 0 auto;align-items:center;justify-content:center;gap:7px;border:1px solid transparent;border-radius:6px;outline:0;cursor:pointer;font-weight:630;line-height:1;white-space:nowrap;transition:background-color 120ms ease,border-color 120ms ease,color 120ms ease,box-shadow 120ms ease,transform 80ms ease}.block{width:100%}.small{height:30px;padding:0 9px;font-size:10px}.medium{height:36px;padding:0 12px;font-size:12px}.large{height:38px;padding:0 13px;font-size:12px}.secondary{border-color:var(--border);background:var(--surface);color:var(--text)}.secondary:hover:not(:disabled){border-color:var(--border-strong);background:var(--surface-muted);color:var(--text-strong)}.primary{border-color:var(--brand);background:var(--brand);color:white}.primary:hover:not(:disabled){border-color:var(--brand-hover);background:var(--brand-hover)}.danger{border-color:var(--danger);background:var(--danger);color:white}.danger:hover:not(:disabled){background:color-mix(in srgb,var(--danger) 86%,white);border-color:color-mix(in srgb,var(--danger) 86%,white)}.danger-soft{border-color:color-mix(in srgb,var(--danger) 60%,var(--border));background:var(--danger-soft);color:var(--danger)}.danger-soft:hover:not(:disabled){border-color:var(--danger);background:color-mix(in srgb,var(--danger-soft) 82%,var(--danger))}.ghost{border-color:transparent;background:transparent;color:var(--text-muted)}.ghost:hover:not(:disabled){background:var(--surface-hover);color:var(--text-strong)}.button:active:not(:disabled){transform:translateY(1px);filter:saturate(.92)}.button:focus-visible{outline:2px solid var(--brand);outline-offset:2px}.button:disabled{cursor:not-allowed;opacity:.46}.button[aria-busy=true]{cursor:wait}.icon{width:var(--button-size);padding:0}.small.icon{--button-size:30px}.medium.icon{--button-size:36px}.large.icon{--button-size:38px}
</style>
