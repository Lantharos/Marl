<script lang="ts">
  import type { Snippet } from 'svelte';
  import ChevronLeft from '@lucide/svelte/icons/chevron-left';
  import PanelRight from '@lucide/svelte/icons/panel-right';
  import Button from '#lib/components/controls/Button.svelte';
  import WorkItemReference from '#lib/components/discussion/WorkItemReference.svelte';
  import Tooltip from '#lib/components/overlays/Tooltip.svelte';
  import { repositoryHref, type ItemRef } from '../store/refs';
  import { shell } from '../shell/shell-state.svelte';

  let {
    ref,
    element = $bindable(),
    details = true,
    backLabel = 'Back to the list',
    onBack,
    crumbs,
    children
  }: {
    ref?: ItemRef | null;
    element?: HTMLElement;
    details?: boolean;
    backLabel?: string;
    onBack?: () => void;
    crumbs?: Snippet;
    children: Snippet;
  } = $props();
  const repository = $derived(ref && `${ref.owner}/${ref.repo}`);
</script>

<div
  bind:this={element}
  class="h-full [scrollbar-gutter:stable] overflow-y-auto overscroll-contain outline-none"
  tabindex="-1"
  data-canvas
>
  <header class="sticky top-0 z-10 flex h-12 items-center gap-2 bg-canvas/90 px-4 backdrop-blur-md sm:px-6">
    {#if onBack}<Button
        class="-ml-2 md:hidden"
        icon
        size="small"
        variant="ghost"
        aria-label={backLabel}
        onclick={onBack}><ChevronLeft size={18} /></Button
      >{/if}
    {#if crumbs}
      {@render crumbs()}
    {:else if ref && repository}
      <nav class="flex min-w-0 items-center gap-1.5 text-sm text-ink-muted" aria-label="Location">
        <a class="truncate hover:text-ink-strong" href="/next/pulls?repository={encodeURIComponent(repository)}"
          >{ref.owner}</a
        >
        <span class="text-ink-faint" aria-hidden="true">/</span>
        <a class="truncate hover:text-ink-strong" href={repositoryHref(repository)}>{ref.repo}</a>
        <span class="text-ink-faint" aria-hidden="true">/</span>
        <WorkItemReference kind={ref.kind} number={ref.number} class="text-ink-strong" />
      </nav>
    {/if}
    <div class="ml-auto flex items-center gap-1">
      {#if details}<Tooltip text="Details ]" placement="bottom-end" as="label">
          {#snippet children(tooltip)}
            <Button
              {...tooltip}
              icon
              size="small"
              variant="ghost"
              aria-pressed={shell.inspectorOpen}
              onclick={shell.toggleInspector}><PanelRight size={16} /></Button
            >
          {/snippet}
        </Tooltip>{/if}
    </div>
  </header>
  {@render children()}
</div>
