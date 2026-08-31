<script lang="ts">
  import { tick } from 'svelte';

  let { open, title, description, children, actions, onClose } = $props<{
    open?: boolean;
    title: string;
    description?: string;
    children: import('svelte').Snippet;
    actions: import('svelte').Snippet;
    onClose: () => void;
  }>();
  const id = $props.id();
  const titleId = `${id}-title`;
  const descriptionId = `${id}-description`;
  let modal = $state<HTMLDivElement>();

  function focusableElements() {
    if (!modal) return [];
    return [...modal.querySelectorAll<HTMLElement>('a[href], button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex]:not([tabindex="-1"])')]
      .filter((element) => element.getClientRects().length > 0 && element.getAttribute('aria-hidden') !== 'true');
  }

  function keydown(event: KeyboardEvent) {
    if (event.key === 'Escape') {
      event.preventDefault();
      onClose();
      return;
    }
    if (event.key !== 'Tab') return;
    const focusable = focusableElements();
    if (!focusable.length) {
      event.preventDefault();
      modal?.focus();
      return;
    }
    const first = focusable[0];
    const last = focusable.at(-1)!;
    if (event.shiftKey && (document.activeElement === first || !modal?.contains(document.activeElement))) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  }

  $effect(() => {
    if (!open) return;
    const returnFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    let cancelled = false;
    void tick().then(() => {
      if (cancelled) return;
      (focusableElements()[0] ?? modal)?.focus();
    });
    return () => {
      cancelled = true;
      if (returnFocus?.isConnected) returnFocus.focus();
    };
  });
</script>

{#if open}
  <div class="modal-layer" role="presentation" onclick={(event) => event.target === event.currentTarget && onClose()}>
    <div bind:this={modal} class="modal" role="dialog" aria-modal="true" aria-labelledby={titleId} aria-describedby={description ? descriptionId : undefined} tabindex="-1" onkeydown={keydown}>
      <header><h2 id={titleId}>{title}</h2>{#if description}<p id={descriptionId}>{description}</p>{/if}</header>
      <div class="content">{@render children()}</div>
      <footer>{@render actions()}</footer>
    </div>
  </div>
{/if}

<style>
  .modal-layer{position:fixed;z-index:120;inset:0;display:flex;align-items:flex-start;justify-content:center;overflow-y:auto;padding:12vh 20px 30px;background:rgb(0 0 0/.62);backdrop-filter:blur(3px)}.modal{width:min(480px,100%);overflow:visible;border:1px solid var(--border-strong);border-radius:10px;background:var(--surface-raised);box-shadow:0 28px 90px rgb(0 0 0/.55)}header{padding:18px 19px 14px}h2{margin:0;color:var(--text-strong);font-size:16px;letter-spacing:-.015em}p{margin:6px 0 0;color:var(--text-muted);font-size:11px;line-height:1.5}.content{padding:2px 19px 19px}.modal>footer{display:flex;justify-content:flex-end;gap:7px;padding:12px 19px;border-radius:0 0 9px 9px;border-top:1px solid var(--border-subtle);background:var(--surface-muted)}
</style>
