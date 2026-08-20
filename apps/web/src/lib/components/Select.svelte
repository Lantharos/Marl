<script lang="ts">
  import { onMount, tick } from 'svelte';
  import Check from 'lucide-svelte/icons/check';
  import ChevronDown from 'lucide-svelte/icons/chevron-down';
  import { dismissable } from '$lib/actions/dismissable';

  type Option = { value: string; label: string; description?: string };
  let { value = $bindable(), options, ariaLabel, onchange }: { value: string; options: Option[]; ariaLabel: string; onchange?: (value: string) => void | Promise<void> } = $props();
  let open = $state(false);
  let activeIndex = $state(0);
  let trigger = $state<HTMLButtonElement>();
  let menu = $state<HTMLDivElement>();
  let menuStyle = $state('');
  const selected = $derived(options.find((option) => option.value === value) ?? options[0]);

  async function choose(option: Option) { value = option.value; open = false; await tick(); await onchange?.(value); }
  async function toggle() {
    open = !open;
    activeIndex = Math.max(0, options.findIndex((option) => option.value === value));
    if (open) { await tick(); positionMenu(); }
  }
  function positionMenu() {
    if (!open || !trigger) return;
    const rect = trigger.getBoundingClientRect();
    const height = Math.min(menu?.scrollHeight ?? 280, 280);
    const below = rect.bottom + 5;
    const top = below + height <= window.innerHeight - 8 ? below : Math.max(8, rect.top - height - 5);
    const left = Math.max(8, Math.min(rect.left, window.innerWidth - rect.width - 8));
    menuStyle = `top:${top}px;left:${left}px;width:${rect.width}px`;
  }
  function keydown(event: KeyboardEvent) {
    if (!open && ['ArrowDown', 'ArrowUp', 'Enter', ' '].includes(event.key)) { event.preventDefault(); void toggle(); return; }
    if (!open) return;
    if (event.key === 'Escape' || event.key === 'Tab') { open = false; if (event.key === 'Escape') event.preventDefault(); }
    if (event.key === 'Home') { event.preventDefault(); activeIndex = 0; }
    if (event.key === 'End') { event.preventDefault(); activeIndex = options.length - 1; }
    if (event.key === 'ArrowDown') { event.preventDefault(); activeIndex = (activeIndex + 1) % options.length; }
    if (event.key === 'ArrowUp') { event.preventDefault(); activeIndex = (activeIndex - 1 + options.length) % options.length; }
    if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); if (options[activeIndex]) void choose(options[activeIndex]); }
  }

  onMount(() => {
    const reposition = () => positionMenu();
    window.addEventListener('resize', reposition);
    document.addEventListener('scroll', reposition, true);
    return () => {
      window.removeEventListener('resize', reposition);
      document.removeEventListener('scroll', reposition, true);
    };
  });
</script>

<div class="select" use:dismissable={() => (open = false)}>
  <button bind:this={trigger} type="button" aria-label={ariaLabel} aria-haspopup="listbox" aria-expanded={open} onkeydown={keydown} onclick={toggle}><span><strong>{selected?.label ?? 'Choose…'}</strong>{#if selected?.description}<small>{selected.description}</small>{/if}</span><ChevronDown size={14} /></button>
  {#if open}<div bind:this={menu} class="options" style={menuStyle} role="listbox" aria-label={ariaLabel}>{#each options as option,index}<button type="button" role="option" aria-selected={option.value === value} class:active={index === activeIndex} onmouseenter={() => (activeIndex = index)} onclick={() => choose(option)}><span><strong>{option.label}</strong>{#if option.description}<small>{option.description}</small>{/if}</span>{#if option.value === value}<Check size={14} />{/if}</button>{/each}</div>{/if}
</div>

<style>
  .select{position:relative;height:100%}.select>button{display:flex;width:100%;height:100%;min-height:36px;align-items:center;justify-content:space-between;gap:10px;padding:6px 9px;border:1px solid var(--border-strong);border-radius:6px;background:var(--surface);color:var(--text);cursor:pointer;text-align:left}.select>button:hover{border-color:var(--text-faint)}.select>button span,.options button span{min-width:0}.select strong,.select small{display:block}.select strong{overflow:hidden;color:var(--text-strong);font-size:11px;font-weight:560;text-overflow:ellipsis;white-space:nowrap}.select small{margin-top:2px;color:var(--text-faint);font-size:9px}.options{position:fixed;z-index:200;max-height:280px;overflow:auto;padding:4px;border:1px solid var(--border-strong);border-radius:7px;background:var(--surface-raised);box-shadow:var(--shadow-card)}.options button{display:grid;width:100%;grid-template-columns:minmax(0,1fr) 18px;align-items:center;gap:8px;padding:8px;border:0;border-radius:4px;background:transparent;color:var(--text);cursor:pointer;text-align:left}.options button:hover,.options button.active{background:var(--surface-muted)}.options button>:global(svg){color:var(--brand)}
</style>
