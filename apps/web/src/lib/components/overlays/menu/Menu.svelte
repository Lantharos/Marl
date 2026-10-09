<script lang="ts" module>
  import type { PopoverTrigger } from '../Popover.svelte';

  export type MenuTrigger = PopoverTrigger & { 'aria-haspopup': 'menu' };
</script>

<script lang="ts">
  import type { Snippet } from 'svelte';
  import { createAttachmentKey, type Attachment } from 'svelte/attachments';
  import type { ClassValue } from 'svelte/elements';
  import type { Placement } from '#lib/ui/popover.js';
  import Popover from '../Popover.svelte';

  let {
    open = $bindable(false),
    label,
    placement = 'bottom-end',
    class: className = '',
    trigger: menuTrigger,
    children
  }: {
    open?: boolean;
    label: string;
    placement?: Exclude<Placement, 'top' | 'bottom'>;
    class?: ClassValue;
    trigger: Snippet<[MenuTrigger]>;
    children: Snippet;
  } = $props();

  const keysKey = createAttachmentKey();
  let triggerElement: HTMLElement | undefined;
  let entry: 'first' | 'last' | undefined;
  let typed = '';
  let typedTimer: ReturnType<typeof setTimeout> | undefined;

  const openWithArrows: Attachment<HTMLElement> = (node) => {
    triggerElement = node;
    function keydown(event: KeyboardEvent) {
      if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return;
      event.preventDefault();
      entry = event.key === 'ArrowDown' ? 'first' : 'last';
      open = true;
    }
    node.addEventListener('keydown', keydown);
    return () => node.removeEventListener('keydown', keydown);
  };

  function items(menu: HTMLElement) {
    return [...menu.querySelectorAll<HTMLElement>('[role^="menuitem"]:not(:disabled)')];
  }

  const focusOnOpen: Attachment<HTMLElement> = (menu) => {
    const target = entry ?? (triggerElement?.matches(':focus-visible') ? 'first' : undefined);
    entry = undefined;
    const list = items(menu);
    ((target === 'first' ? list[0] : target === 'last' ? list.at(-1) : undefined) ?? menu).focus();
  };

  function typeahead(key: string, list: HTMLElement[], current: number) {
    clearTimeout(typedTimer);
    typed += key.toLowerCase();
    typedTimer = setTimeout(() => (typed = ''), 500);
    const start = typed.length === 1 ? current + 1 : Math.max(current, 0);
    return [...list.slice(start), ...list.slice(0, start)].find((item) =>
      item.textContent?.trim().toLowerCase().startsWith(typed)
    );
  }

  function keydown(event: KeyboardEvent) {
    const menu = event.currentTarget as HTMLElement;
    const target = event.target as HTMLElement;
    const list = items(menu);
    const current = list.indexOf(target);
    if (current === -1 && target !== menu) return;
    let next: HTMLElement | undefined;
    if (event.key === 'ArrowDown') next = list[(current + 1) % list.length];
    else if (event.key === 'ArrowUp') next = list.at(current <= 0 ? -1 : current - 1);
    else if (event.key === 'Home') next = list[0];
    else if (event.key === 'End') next = list.at(-1);
    else if (event.key === ' ' && target instanceof HTMLAnchorElement) target.click();
    else if (event.key.length === 1 && event.key !== ' ' && !event.ctrlKey && !event.metaKey && !event.altKey)
      next = typeahead(event.key, list, current);
    else return;
    event.preventDefault();
    next?.focus();
  }

  function followPointer(event: PointerEvent) {
    const menu = event.currentTarget as HTMLElement;
    const item = (event.target as Element).closest<HTMLElement>('[role^="menuitem"]:not(:disabled)');
    if (item) item.focus();
    else if (items(menu).includes(document.activeElement as HTMLElement)) menu.focus();
  }
</script>

<Popover
  bind:open
  {placement}
  class={['grid content-start gap-0.5 p-1.5 outline-none', className]}
  role="menu"
  aria-label={label}
  tabindex={-1}
  onkeydown={keydown}
  onpointermove={followPointer}
  onpointerleave={followPointer}
  {@attach focusOnOpen}
>
  {#snippet trigger(popover)}
    {@render menuTrigger({ ...popover, 'aria-haspopup': 'menu', [keysKey]: openWithArrows })}
  {/snippet}
  {@render children()}
</Popover>
