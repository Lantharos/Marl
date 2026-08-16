<script lang="ts">
  let { open, title, description, children, actions, onClose } = $props<{
    open?: boolean;
    title: string;
    description?: string;
    children: import('svelte').Snippet;
    actions: import('svelte').Snippet;
    onClose: () => void;
  }>();

  function keydown(event: KeyboardEvent) {
    if (open && event.key === 'Escape') onClose();
  }
</script>

<svelte:window onkeydown={keydown} />
{#if open}
  <div class="modal-layer" role="presentation" onclick={(event) => event.target === event.currentTarget && onClose()}>
    <div class="modal" role="dialog" aria-modal="true" aria-labelledby="modal-title" tabindex="-1">
      <header><h2 id="modal-title">{title}</h2>{#if description}<p>{description}</p>{/if}</header>
      <div class="content">{@render children()}</div>
      <footer>{@render actions()}</footer>
    </div>
  </div>
{/if}

<style>
  .modal-layer{position:fixed;z-index:120;inset:0;display:flex;align-items:flex-start;justify-content:center;padding:12vh 20px 30px;background:rgb(0 0 0/.62);backdrop-filter:blur(3px)}.modal{width:min(480px,100%);overflow:hidden;border:1px solid var(--border-strong);border-radius:10px;background:var(--surface-raised);box-shadow:0 28px 90px rgb(0 0 0/.55)}header{padding:18px 19px 14px}h2{margin:0;color:var(--text-strong);font-size:16px;letter-spacing:-.015em}p{margin:6px 0 0;color:var(--text-muted);font-size:11px;line-height:1.5}.content{padding:2px 19px 19px}.modal>footer{display:flex;justify-content:flex-end;gap:7px;padding:12px 19px;border-top:1px solid var(--border-subtle);background:var(--surface-muted)}
</style>
