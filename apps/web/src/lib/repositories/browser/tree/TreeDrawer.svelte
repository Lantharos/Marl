<script lang="ts">
  import type { Snippet } from 'svelte';
  import { cubicOut } from 'svelte/easing';
  import type { TransitionConfig } from 'svelte/transition';

  let { open = $bindable(false), children }: { open?: boolean; children: Snippet } = $props();

  function present(dialog: HTMLDialogElement) {
    const returnFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    dialog.showModal();
    dialog.querySelector<HTMLElement>('[role="tree"]')?.focus({ preventScroll: true });
    return () => {
      dialog.close();
      if (returnFocus?.isConnected) returnFocus.focus({ preventScroll: true });
    };
  }

  function slide(_node: Element): TransitionConfig {
    const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
    return {
      duration: reduced ? 0 : 200,
      easing: cubicOut,
      css: (visible, hidden) => `opacity:${0.4 + visible * 0.6};transform:translateX(${hidden * -24}px)`
    };
  }
</script>

{#if open}<dialog
    {@attach present}
    class="fixed inset-0 m-0 size-full max-h-none max-w-none bg-transparent p-2 text-ink backdrop:bg-black/55 backdrop:backdrop-blur-[3px] open:flex"
    aria-label="Repository files"
    oncancel={(event) => {
      event.preventDefault();
      open = false;
    }}
    onclick={(event) => event.target === event.currentTarget && (open = false)}
  >
    <div class="flex h-full w-[min(360px,100%_-_48px)] flex-col popover" transition:slide>
      {@render children()}
    </div>
  </dialog>{/if}
