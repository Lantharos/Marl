<script lang="ts">
  import type { Snippet } from 'svelte';
  import { popoverMotion } from '$lib/ui/popover';

  let {
    open,
    title,
    description,
    size = 'medium',
    children,
    actions,
    onClose
  }: {
    open?: boolean;
    title: string;
    description?: string;
    size?: 'small' | 'medium' | 'large';
    children: Snippet;
    actions?: Snippet;
    onClose: () => void;
  } = $props();
  const id = $props.id();
  const titleId = `${id}-title`;
  const descriptionId = `${id}-description`;
  const widths = { small: 'max-w-110', medium: 'max-w-135', large: 'max-w-180' };

  function showModal(dialog: HTMLDialogElement) {
    const returnFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    dialog.showModal();
    return () => {
      dialog.close();
      if (returnFocus?.isConnected) returnFocus.focus({ preventScroll: true });
    };
  }
</script>

{#if open}
  <dialog
    {@attach showModal}
    class="fixed inset-0 m-0 size-full max-h-none max-w-none items-start justify-center overflow-y-auto overscroll-contain bg-transparent px-3 pt-6 pb-8 text-ink backdrop:bg-black/60 backdrop:backdrop-blur-[3px] open:flex sm:px-5 sm:pt-[10dvh]"
    aria-labelledby={titleId}
    aria-describedby={description ? descriptionId : undefined}
    oncancel={(event) => {
      event.preventDefault();
      onClose();
    }}
    onkeydown={(event) => event.stopPropagation()}
    onclick={(event) => event.target === event.currentTarget && onClose()}
  >
    <div class={['w-full popover rounded-2xl', widths[size]]} transition:popoverMotion={{ duration: 160 }}>
      <header class="px-5 pt-5 pb-4 sm:px-6 sm:pt-6">
        <h2 id={titleId} class="text-xl font-semibold tracking-tight text-ink-strong">{title}</h2>
        {#if description}<p id={descriptionId} class="mt-1.5 text-sm text-pretty text-ink-muted">{description}</p>{/if}
      </header>
      <div class="px-5 pb-5 sm:px-6 sm:pb-6">{@render children()}</div>
      {#if actions}<footer class="flex flex-wrap justify-end gap-2 px-5 pb-5 sm:px-6 sm:pb-6">
          {@render actions()}
        </footer>{/if}
    </div>
  </dialog>
{/if}
