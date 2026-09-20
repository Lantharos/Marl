<script lang="ts">
  import X from 'lucide-svelte/icons/x';
  import ExternalLink from 'lucide-svelte/icons/external-link';
  import Button from '$lib/components/Button.svelte';

  let { src, alt, onClose } = $props<{ src: string; alt: string; onClose: () => void }>();
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

<dialog {@attach open} aria-labelledby={titleId} oncancel={(event) => { event.preventDefault(); onClose(); }} onclick={(event) => { if (event.target === event.currentTarget) onClose(); }} onkeydown={(event) => event.stopPropagation()}>
  <div class="image-viewer">
    <header><h2 id={titleId}>{alt || 'Image'}</h2><a href={src} target="_blank" rel="noopener noreferrer" aria-label="Open original image"><ExternalLink size={18} /></a><Button icon variant="ghost" aria-label="Close image" onclick={onClose}><X size={20} /></Button></header>
    <div class="image-stage"><img {src} alt={alt || 'Attached image'} /></div>
  </div>
</dialog>

<style>
  dialog{position:fixed;max-width:none;max-height:none;width:100%;height:100%;margin:0;padding:4vh 24px;border:0;outline:0;background:transparent;color:var(--text);overscroll-behavior:contain}
  dialog[open]{display:grid;place-items:center}
  dialog::backdrop{background:rgb(0 0 0/.78);backdrop-filter:blur(3px)}
  .image-viewer{display:flex;width:fit-content;min-width:min(400px,100%);max-width:min(1280px,100%);max-height:92dvh;flex-direction:column;overflow:hidden;border-radius:12px;background:var(--surface-raised);box-shadow:0 24px 80px rgb(0 0 0/.35)}
  header{display:flex;flex-shrink:0;align-items:center;gap:12px;padding:10px 12px 10px 20px}
  h2{min-width:0;flex:1;overflow:hidden;margin:0;color:var(--text-strong);font-size:13px;font-weight:600;text-overflow:ellipsis;white-space:nowrap}
  header a{display:grid;width:34px;height:34px;place-items:center;border-radius:7px;color:var(--text-muted)}
  header a:hover{background:var(--surface-muted);color:var(--text-strong)}
  .image-stage{min-height:0;overflow:auto}
  img{display:block;max-width:100%;max-height:calc(92dvh - 60px);margin:auto;object-fit:contain}
  @media(max-width:640px){dialog{padding:12px}.image-viewer{max-height:calc(100dvh - 24px)}img{max-height:calc(100dvh - 84px)}}
</style>
