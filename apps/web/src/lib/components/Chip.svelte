<script lang="ts">
  import type { Snippet } from 'svelte';
  import type { HTMLButtonAttributes } from 'svelte/elements';
  import X from 'lucide-svelte/icons/x';

  let {
    active = false,
    removable = false,
    color,
    children,
    class: className = '',
    ...attributes
  } = $props<HTMLButtonAttributes & {
    active?: boolean;
    removable?: boolean;
    color?: string;
    children: Snippet;
  }>();
</script>

<button {...attributes} type="button" class="chip {active ? 'active' : ''} {removable ? 'removable' : ''} {className}" style:--chip-color={color} aria-pressed={active || undefined}>
  {#if color}<span class="dot" aria-hidden="true"></span>{/if}
  {@render children()}
  {#if removable}<X size={11} aria-hidden="true" />{/if}
</button>

<style>
  .chip{display:inline-flex;height:30px;align-items:center;justify-content:center;gap:6px;padding:0 10px;border:1px solid transparent;border-radius:999px;outline:0;background:transparent;color:var(--text-muted);cursor:pointer;font-size:10px;font-weight:620;line-height:1;white-space:nowrap;transition:background-color 120ms ease,border-color 120ms ease,color 120ms ease}.chip:hover{background:var(--surface-hover);color:var(--text-strong)}.chip.active{border-color:var(--border);background:var(--surface-muted);color:var(--text-strong)}.chip.removable{border-color:color-mix(in srgb,var(--chip-color) 35%,var(--border));background:color-mix(in srgb,var(--chip-color) 12%,transparent);color:var(--text-strong)}.chip:active{filter:brightness(.94)}.chip:focus-visible{outline:2px solid var(--brand);outline-offset:2px}.dot{width:7px;height:7px;flex:0 0 auto;border-radius:50%;background:var(--chip-color)}
</style>
