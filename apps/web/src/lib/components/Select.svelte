<script lang="ts">
  import { onMount, tick } from 'svelte';
  import Check from 'lucide-svelte/icons/check';
  import ChevronDown from 'lucide-svelte/icons/chevron-down';
  import { dismissable } from '$lib/actions/dismissable';
  import { interfaceScale } from '$lib/ui/floating';

  type Option = { value: string; label: string; description?: string };
  let { value = $bindable(), options, ariaLabel, onchange }: { value: string; options: Option[]; ariaLabel: string; onchange?: (value: string) => void | Promise<void> } = $props();
  const id = $props.id();
  const listboxId = `${id}-listbox`;
  let open = $state(false);
  let activeIndex = $state(0);
  let trigger = $state<HTMLButtonElement>();
  let menu = $state<HTMLDivElement>();
  let menuStyle = $state('');
  const selected = $derived(options.find((option) => option.value === value) ?? options[0]);

  function optionId(index: number) { return `${id}-option-${index}`; }
  function closeMenu(restoreFocus = false) {
    open = false;
    if (restoreFocus) trigger?.focus();
  }
  async function focusActiveOption() {
    await tick();
    menu?.querySelector<HTMLElement>(`#${CSS.escape(optionId(activeIndex))}`)?.focus();
  }
  async function choose(option: Option) {
    const changed = option.value !== value;
    value = option.value;
    closeMenu(true);
    if (changed) await onchange?.(value);
  }
  async function openMenu(direction?: 'first' | 'last') {
    if (!options.length) return;
    open = true;
    activeIndex = Math.max(0, options.findIndex((option) => option.value === value));
    if (direction === 'first') activeIndex = 0;
    if (direction === 'last') activeIndex = options.length - 1;
    await tick();
    positionMenu();
    await focusActiveOption();
  }
  function toggle() {
    if (open) closeMenu(true);
    else void openMenu();
  }
  function positionMenu() {
    if (!open || !trigger) return;
    const scale = interfaceScale();
    const rect = trigger.getBoundingClientRect();
    const height = Math.min(menu?.scrollHeight ?? 280, 280) * scale;
    const gap = 5 * scale;
    const viewportMargin = 8 * scale;
    const below = rect.bottom + gap;
    const top = below + height <= window.innerHeight - viewportMargin ? below : Math.max(viewportMargin, rect.top - height - gap);
    const left = Math.max(viewportMargin, Math.min(rect.left, window.innerWidth - rect.width - viewportMargin));
    menuStyle = `top:${top / scale}px;left:${left / scale}px;width:${rect.width / scale}px`;
  }
  function keydown(event: KeyboardEvent) {
    if (!open && (event.key === 'ArrowDown' || event.key === 'ArrowUp')) {
      event.preventDefault();
      void openMenu(event.key === 'ArrowDown' ? 'first' : 'last');
      return;
    }
    if (!open) return;
    if (event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      closeMenu(true);
      return;
    }
    if (event.key === 'Tab') {
      closeMenu();
      return;
    }
    if (event.key === 'Home') activeIndex = 0;
    else if (event.key === 'End') activeIndex = options.length - 1;
    else if (event.key === 'ArrowDown') activeIndex = (activeIndex + 1) % options.length;
    else if (event.key === 'ArrowUp') activeIndex = (activeIndex - 1 + options.length) % options.length;
    else return;
    event.preventDefault();
    void focusActiveOption();
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

<div class="select" use:dismissable={() => closeMenu()}>
  <button bind:this={trigger} type="button" aria-label={ariaLabel} aria-haspopup="listbox" aria-controls={listboxId} aria-expanded={open} onkeydown={keydown} onclick={toggle}><span><strong>{selected?.label ?? 'Choose…'}</strong>{#if selected?.description}<small>{selected.description}</small>{/if}</span><ChevronDown size={14} /></button>
  {#if open}<div bind:this={menu} id={listboxId} class="options" style={menuStyle} role="listbox" tabindex="-1" aria-label={ariaLabel} onkeydown={keydown}>{#each options as option,index (option.value)}<button id={optionId(index)} type="button" role="option" tabindex={index === activeIndex ? 0 : -1} aria-selected={option.value === value} class:active={index === activeIndex} onmouseenter={() => (activeIndex = index)} onclick={() => choose(option)}><span><strong>{option.label}</strong>{#if option.description}<small>{option.description}</small>{/if}</span>{#if option.value === value}<Check size={14} />{/if}</button>{/each}</div>{/if}
</div>

<style>
  .select{position:relative}.select>button{display:flex;width:100%;height:100%;min-height:38px;align-items:center;justify-content:space-between;gap:10px;padding:6px 9px;border:1px solid var(--border-strong);border-radius:6px;background:var(--surface);color:var(--text);cursor:pointer;text-align:left}.select>button:hover{border-color:var(--text-faint)}.select>button:focus-visible{border-color:var(--brand);outline:0}.select>button span,.options button span{min-width:0}.select strong,.select small{display:block}.select strong{overflow:hidden;color:var(--text-strong);font-size:11px;font-weight:560;text-overflow:ellipsis;white-space:nowrap}.select small{margin-top:2px;color:var(--text-faint);font-size:9px}.options{position:fixed;z-index:200;max-height:280px;overflow:auto;padding:4px;border:1px solid var(--border-strong);border-radius:7px;background:var(--surface-raised);box-shadow:var(--shadow-card)}.options button{display:grid;width:100%;grid-template-columns:minmax(0,1fr) 18px;align-items:center;gap:8px;padding:8px;border:0;border-radius:4px;background:transparent;color:var(--text);cursor:pointer;text-align:left}.options button:hover,.options button.active{background:var(--surface-muted)}.options button>:global(svg){color:var(--brand)}
</style>
