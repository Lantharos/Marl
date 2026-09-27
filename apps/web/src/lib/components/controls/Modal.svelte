<script lang="ts">
  import type { Snippet } from 'svelte';
  import { popoverMotion } from '$lib/ui/popover';

  let { open, title, description, children, actions, onClose } = $props<{
    open?: boolean;
    title: string;
    description?: string;
    children: Snippet;
    actions: Snippet;
    onClose: () => void;
  }>();
  const id = $props.id();
  const titleId = `${id}-title`;
  const descriptionId = `${id}-description`;

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
  <dialog {@attach showModal} class="modal-layer" aria-labelledby={titleId} aria-describedby={description ? descriptionId : undefined} oncancel={(event) => { event.preventDefault(); onClose(); }} onkeydown={(event) => event.stopPropagation()} onclick={(event) => event.target === event.currentTarget && onClose()}>
    <div class="modal" transition:popoverMotion={{ duration: 160 }}>
      <header><h2 id={titleId}>{title}</h2>{#if description}<p id={descriptionId}>{description}</p>{/if}</header>
      <div class="content">{@render children()}</div>
      <footer>{@render actions()}</footer>
    </div>
  </dialog>
{/if}

<style>
  .modal-layer{position:fixed;inset:0;width:100%;height:100%;max-width:none;max-height:none;margin:0;overflow-y:auto;overscroll-behavior:contain;padding:calc(10dvh / var(--interface-scale)) 20px 30px;border:0;background:transparent;color:var(--text)}
  .modal-layer[open]{display:flex;align-items:flex-start;justify-content:center}
  .modal-layer::backdrop{background:rgb(0 0 0/.62);backdrop-filter:blur(3px)}
  .modal{width:min(var(--modal-width,480px),100%);overflow:visible;border:0;border-radius:18px;background:var(--surface-raised);box-shadow:var(--shadow-popover)}
  header{padding:24px 24px 20px}h2{margin:0;color:var(--text-strong);font-size:20px;letter-spacing:-.015em}p{margin:6px 0 0;color:var(--text-muted);font-size:13px;line-height:1.5}.content{padding:0 24px 24px}.modal>footer{display:flex;justify-content:flex-end;gap:7px;flex-wrap:wrap;padding:0 24px 24px}
  @media(max-width:600px){.modal-layer{padding:24px 12px}.modal{border-radius:16px}header{padding:20px 20px 18px}.content{padding:0 20px 20px}.modal>footer{padding:0 20px 20px}}
</style>
