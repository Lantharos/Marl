<script lang="ts">
  import { paneWidth, type PaneLayout } from './pane-layout.svelte';

  let { layout }: { layout: PaneLayout } = $props();
  let dragging = $state(false);
  let origin = 0;
  let initial = 0;

  function begin(event: PointerEvent) {
    if (event.button !== 0) return;
    event.preventDefault();
    (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
    dragging = true;
    origin = event.clientX;
    initial = layout.width;
  }

  function move(event: PointerEvent) {
    if (dragging) layout.resize(initial + event.clientX - origin);
  }

  function end() {
    if (!dragging) return;
    dragging = false;
    layout.save();
  }

  function keydown(event: KeyboardEvent) {
    const step = event.shiftKey ? 64 : 16;
    if (event.key === 'ArrowLeft') layout.resize(layout.width - step);
    else if (event.key === 'ArrowRight') layout.resize(layout.width + step);
    else if (event.key === 'Home') layout.resize(paneWidth.min);
    else if (event.key === 'End') layout.resize(paneWidth.max);
    else return;
    event.preventDefault();
    layout.save();
  }

  function reset() {
    layout.resize(paneWidth.initial);
    layout.save();
  }
</script>

<!-- svelte-ignore a11y_no_noninteractive_tabindex, a11y_no_noninteractive_element_interactions -->
<div
  role="separator"
  aria-orientation="vertical"
  aria-label="Resize file tree"
  aria-valuenow={layout.width}
  aria-valuemin={paneWidth.min}
  aria-valuemax={paneWidth.max}
  tabindex="0"
  class="group sticky top-17 flex h-[calc(100dvh-5.25rem)] w-4 shrink-0 cursor-col-resize touch-none justify-center outline-none max-lg:hidden"
  onpointerdown={begin}
  onpointermove={move}
  onpointerup={end}
  onpointercancel={end}
  ondblclick={reset}
  onkeydown={keydown}
>
  <span
    class={[
      'my-2 w-0.5 rounded-full transition-colors group-hover:bg-line-strong group-focus-visible:bg-brand',
      dragging ? 'bg-brand' : 'bg-transparent'
    ]}
  ></span>
</div>
