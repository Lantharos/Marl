<script lang="ts">
  import X from '@lucide/svelte/icons/x';
  import ExternalLink from '@lucide/svelte/icons/external-link';
  import Button from '$lib/components/controls/Button.svelte';
  import LinkButton from '$lib/components/controls/LinkButton.svelte';

  let { src, alt, onClose }: { src: string; alt: string; onClose: () => void } = $props();
  const titleId = $props.id();

  function open(dialog: HTMLDialogElement) {
    const previousFocus = document.activeElement;
    dialog.showModal();
    return () => {
      dialog.close();
      if (previousFocus instanceof HTMLElement && previousFocus.isConnected) previousFocus.focus();
    };
  }
</script>

<dialog
  {@attach open}
  aria-labelledby={titleId}
  class="fixed inset-0 m-0 size-full max-h-none max-w-none place-items-center overscroll-contain bg-transparent p-3 text-ink outline-none backdrop:bg-black/80 backdrop:backdrop-blur-[3px] open:grid sm:px-6 sm:py-[4vh]"
  oncancel={(event) => {
    event.preventDefault();
    onClose();
  }}
  onclick={(event) => {
    if (event.target === event.currentTarget) onClose();
  }}
  onkeydown={(event) => event.stopPropagation()}
>
  <div
    class="flex max-h-[calc(100dvh-24px)] w-fit max-w-[min(1280px,100%)] min-w-[min(400px,100%)] flex-col overflow-hidden rounded-xl bg-surface-raised shadow-card sm:max-h-[92dvh]"
  >
    <header class="flex shrink-0 items-center gap-2 py-2 pr-2 pl-5">
      <h2 id={titleId} class="min-w-0 flex-1 truncate text-sm font-semibold text-ink-strong">{alt || 'Image'}</h2>
      <LinkButton
        icon
        variant="ghost"
        href={src}
        target="_blank"
        rel="noopener noreferrer"
        aria-label="Open original image"><ExternalLink size={18} /></LinkButton
      >
      <Button icon variant="ghost" aria-label="Close image" onclick={onClose}><X size={20} /></Button>
    </header>
    <div class="min-h-0 overflow-auto">
      <img
        {src}
        alt={alt || 'Attached image'}
        class="mx-auto block max-h-[calc(100dvh-84px)] max-w-full object-contain sm:max-h-[calc(92dvh-60px)]"
      />
    </div>
  </div>
</dialog>
