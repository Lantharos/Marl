<script lang="ts" module>
  import type { Attachment } from 'svelte/attachments';

  export type TooltipTrigger = {
    'aria-describedby'?: string;
    'aria-labelledby'?: string;
    [key: symbol]: Attachment<HTMLElement>;
  };

  let warmUntil = 0;
</script>

<script lang="ts">
  import type { Snippet } from 'svelte';
  import { createAttachmentKey } from 'svelte/attachments';
  import type { ClassValue } from 'svelte/elements';
  import { anchorAs, type Placement } from '#lib/ui/popover.js';

  let {
    text,
    placement = 'top',
    as = 'description',
    anchor,
    class: className = '',
    children
  }: {
    text: string;
    placement?: Placement | 'right';
    as?: 'description' | 'label';
    anchor?: HTMLElement | null;
    class?: ClassValue;
    children?: Snippet<[TooltipTrigger]>;
  } = $props();

  const id = $props.id();
  const anchorName = `--tooltip-${id}`;
  const triggerKey = createAttachmentKey();
  let tip = $state<HTMLElement>();
  let timer: ReturnType<typeof setTimeout> | undefined;

  function show() {
    clearTimeout(timer);
    timer = setTimeout(() => tip?.togglePopover(true), performance.now() < warmUntil ? 0 : 350);
  }

  function hide() {
    clearTimeout(timer);
    if (!tip?.matches(':popover-open')) return;
    tip.hidePopover();
    warmUntil = performance.now() + 500;
  }

  function hideSoon() {
    clearTimeout(timer);
    timer = setTimeout(hide, 100);
  }

  const attachTrigger: Attachment<HTMLElement> = (node) => {
    const detach = anchorAs(anchorName)(node);
    const enter = (event: PointerEvent) => event.pointerType !== 'touch' && show();
    const focus = () => node.matches(':focus-visible') && show();
    const escape = (event: KeyboardEvent) => event.key === 'Escape' && hide();
    node.addEventListener('pointerenter', enter);
    node.addEventListener('pointerleave', hideSoon);
    node.addEventListener('pointerdown', hide);
    node.addEventListener('focus', focus);
    node.addEventListener('blur', hide);
    node.addEventListener('keydown', escape);
    return () => {
      detach?.();
      hide();
      node.removeEventListener('pointerenter', enter);
      node.removeEventListener('pointerleave', hideSoon);
      node.removeEventListener('pointerdown', hide);
      node.removeEventListener('focus', focus);
      node.removeEventListener('blur', hide);
      node.removeEventListener('keydown', escape);
    };
  };

  $effect(() => {
    if (!anchor) {
      hide();
      return;
    }
    show();
    return anchorAs(anchorName)(anchor);
  });
</script>

{@render children?.({
  [as === 'label' ? 'aria-labelledby' : 'aria-describedby']: id,
  [triggerKey]: attachTrigger
})}
<span
  bind:this={tip}
  {id}
  role="tooltip"
  popover="manual"
  data-placement={placement}
  class={[
    'floating max-w-64 rounded-md bg-surface-raised px-2 py-1 text-xs text-balance text-ink shadow-popover transition-[opacity,scale,display,overlay] transition-discrete duration-150 not-open:scale-96 not-open:opacity-0 starting:open:scale-96 starting:open:opacity-0',
    className
  ]}
  style:position-anchor={anchorName}
  onpointerenter={() => clearTimeout(timer)}
  onpointerleave={hideSoon}>{text}</span
>
