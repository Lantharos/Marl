<script lang="ts">
  import type { Snippet } from 'svelte';
  import X from '@lucide/svelte/icons/x';
  import Button from '#lib/components/controls/Button.svelte';
  import { shell } from './shell-state.svelte';

  let {
    list,
    canvas,
    inspector,
    mobileView = 'canvas'
  }: { list?: Snippet; canvas: Snippet; inspector?: Snippet; mobileView?: 'list' | 'canvas' } = $props();

  function showSheet(dialog: HTMLDialogElement) {
    dialog.showModal();
    const wide = matchMedia('(width >= 64rem)');
    const close = () => wide.matches && (shell.detailsSheetOpen = false);
    wide.addEventListener('change', close);
    return () => {
      wide.removeEventListener('change', close);
      dialog.close();
    };
  }
</script>

<div
  class={[
    'grid h-full min-h-0',
    list ? 'md:grid-cols-[300px_minmax(0,1fr)] xl:grid-cols-[360px_minmax(0,1fr)]' : 'grid-cols-1'
  ]}
>
  {#if list}
    <section
      class={['min-h-0 border-line-subtle md:border-r', mobileView === 'canvas' && 'max-md:hidden']}
      aria-label="Queue"
    >
      {@render list()}
    </section>
  {/if}
  <div class={['flex min-h-0 min-w-0', mobileView === 'list' && 'max-md:hidden']}>
    <div class="min-h-0 min-w-0 flex-1">{@render canvas()}</div>
    {#if inspector}
      <aside
        class="min-h-0 shrink-0 overflow-hidden border-line-subtle transition-[width] duration-200 ease-(--ease-standard) max-lg:hidden"
        class:border-l={shell.inspectorOpen}
        style:width={shell.inspectorOpen ? '300px' : '0px'}
        aria-label="Details"
        inert={!shell.inspectorOpen}
      >
        <div class="h-full w-[300px] overflow-y-auto">{@render inspector()}</div>
      </aside>
    {/if}
  </div>
</div>

{#if inspector && shell.detailsSheetOpen}
  <dialog
    {@attach showSheet}
    class="fixed inset-0 m-0 size-full max-h-none max-w-none bg-transparent backdrop:bg-black/45 open:flex open:items-end"
    aria-label="Details"
    oncancel={(event) => {
      event.preventDefault();
      shell.detailsSheetOpen = false;
    }}
    onclick={(event) => event.target === event.currentTarget && (shell.detailsSheetOpen = false)}
  >
    <div
      class="sheet max-h-[82dvh] w-full overflow-y-auto rounded-t-2xl bg-surface-raised pb-[env(safe-area-inset-bottom)] shadow-card"
    >
      <div class="sticky top-0 flex justify-end bg-surface-raised p-2">
        <Button
          icon
          size="small"
          variant="ghost"
          aria-label="Close details"
          onclick={() => (shell.detailsSheetOpen = false)}><X size={16} /></Button
        >
      </div>
      {@render inspector()}
    </div>
  </dialog>
{/if}

<style>
  .sheet {
    animation: rise 220ms var(--ease-standard);
  }

  @keyframes rise {
    from {
      transform: translateY(24px);
      opacity: 0;
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .sheet {
      animation: none;
    }
  }
</style>
