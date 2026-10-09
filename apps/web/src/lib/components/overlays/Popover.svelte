<script lang="ts" module>
  import type { Attachment } from 'svelte/attachments';

  export type PopoverTrigger = {
    popovertarget: string;
    'aria-controls': string;
    'aria-expanded': boolean;
    [key: symbol]: Attachment<HTMLElement>;
  };
</script>

<script lang="ts">
  import type { Snippet } from 'svelte';
  import { createAttachmentKey } from 'svelte/attachments';
  import type { HTMLAttributes } from 'svelte/elements';
  import { anchorAs, popoverMotion, type Placement } from '#lib/ui/popover.js';

  type AnchoredPlacement = Exclude<Placement, 'top' | 'bottom'>;

  let {
    open = $bindable(false),
    placement = 'bottom-end',
    matchWidth = false,
    dismiss = 'auto',
    anchor,
    trigger,
    children,
    class: className = '',
    ...attributes
  }: HTMLAttributes<HTMLDivElement> & {
    open?: boolean;
    placement?: AnchoredPlacement;
    matchWidth?: boolean;
    dismiss?: 'auto' | 'manual';
    anchor?: HTMLElement;
    trigger?: Snippet<[PopoverTrigger]>;
    children: Snippet;
  } = $props();

  const id = $props.id();
  const anchorName = `--popover-${id}`;
  const origins: Record<AnchoredPlacement, string> = {
    'bottom-start': 'origin-top-left',
    'bottom-end': 'origin-top-right',
    'top-start': 'origin-bottom-left',
    'top-end': 'origin-bottom-right'
  };
  const triggerKey = createAttachmentKey();
  let element = $state<HTMLDivElement>();
  let source = $state<HTMLElement>();
  let shown = $state(false);
  const triggerProps = $derived({
    popovertarget: id,
    'aria-controls': id,
    'aria-expanded': open,
    [triggerKey]: attachTrigger
  });

  function attachTrigger(node: HTMLElement) {
    source = node;
    const detach = anchorAs(anchorName)(node);
    return () => {
      detach?.();
      source = undefined;
    };
  }

  $effect(() => {
    if (anchor) return anchorAs(anchorName)(anchor);
  });

  $effect(() => {
    if (!element || open === element.matches(':popover-open')) return;
    if (open) element.showPopover({ source: source ?? anchor });
    else element.hidePopover();
  });

  function leave(event: FocusEvent) {
    const next = event.relatedTarget;
    if (dismiss === 'auto' && next instanceof Node && !element?.contains(next) && !source?.contains(next)) open = false;
  }
</script>

{@render trigger?.(triggerProps)}
<div
  bind:this={element}
  {id}
  popover={dismiss}
  data-placement={placement}
  class="floating overflow-visible bg-transparent text-inherit transition-[display,overlay] transition-discrete duration-150 open:flex open:flex-col"
  style:position-anchor={anchorName}
  style:width={matchWidth ? 'anchor-size(width)' : undefined}
  onbeforetoggle={(event) => event.newState === 'closed' && (open = shown = false)}
  ontoggle={(event) => event.newState === 'open' && (open = shown = true)}
  onfocusout={leave}
>
  {#if shown}
    <div
      {...attributes}
      class={['min-h-0 overflow-y-auto popover', origins[placement], className]}
      transition:popoverMotion={{ upward: placement.startsWith('top') }}
    >
      {@render children()}
    </div>
  {/if}
</div>
