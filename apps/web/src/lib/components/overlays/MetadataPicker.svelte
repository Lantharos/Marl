<script lang="ts" module>
  export type PickerOption = {
    id: string;
    title: string;
    detail?: string;
    color?: string;
    avatar?: { name: string; src?: string | null };
    selected: boolean;
  };
</script>

<script lang="ts">
  import Check from '@lucide/svelte/icons/check';
  import Plus from '@lucide/svelte/icons/plus';
  import { anchoredPopover, popoverMotion } from '$lib/ui/popover';
  import SearchField from '../controls/SearchField.svelte';
  import Spinner from '../feedback/Spinner.svelte';
  import UserAvatar from '../identity/UserAvatar.svelte';

  let {
    anchor,
    query = $bindable(''),
    placeholder,
    options,
    busy = false,
    empty,
    create,
    onToggle
  }: {
    anchor?: HTMLElement;
    query?: string;
    placeholder: string;
    options: PickerOption[];
    busy?: boolean;
    empty: string;
    create?: { label: string; busy: boolean; onCreate: () => void };
    onToggle: (id: string) => void;
  } = $props();
  let input = $state<HTMLInputElement>();

  $effect(() => {
    input?.focus();
  });
</script>

<div
  class="fixed z-90 flex flex-col overflow-hidden popover p-1.5"
  {@attach anchoredPopover(anchor, { width: 290 })}
  transition:popoverMotion
>
  <SearchField
    bind:value={query}
    bind:input
    label={placeholder}
    class="shrink-0 border-transparent bg-surface"
    onkeydown={(event) => event.key === 'Enter' && create && !create.busy && create.onCreate()}
  />
  <div class="mt-1.5 grid min-h-0 gap-0.5 overflow-y-auto">
    {#each options as option (option.id)}
      <button
        type="button"
        class="flex min-h-11 w-full items-center justify-between gap-3 rounded-lg p-2 text-left transition-colors hover:not-disabled:bg-surface-hover disabled:opacity-50 aria-pressed:bg-surface-muted"
        disabled={busy}
        aria-pressed={option.selected}
        onclick={() => onToggle(option.id)}
      >
        <span class="flex min-w-0 items-center gap-2.5">
          {#if option.avatar}<UserAvatar
              name={option.avatar.name}
              src={option.avatar.src}
              size={26}
            />{:else if option.color}<span class="size-2.5 shrink-0 rounded-full" style:background={option.color}
            ></span>{/if}
          <span class="min-w-0">
            <span class="block truncate text-sm font-semibold text-ink-strong">{option.title}</span>
            {#if option.detail}<span class="mt-0.5 block truncate text-xs text-ink-muted">{option.detail}</span>{/if}
          </span>
        </span>
        {#if option.selected}<Check size={15} class="shrink-0 text-brand" />{/if}
      </button>
    {/each}
    {#if create}
      <button
        type="button"
        class="flex min-h-10 w-full items-center gap-2 rounded-lg p-2 text-left text-sm text-ink transition-colors hover:not-disabled:bg-surface-hover"
        disabled={create.busy}
        onclick={create.onCreate}
      >
        {#if create.busy}<Spinner />{:else}<Plus size={15} />{/if}
        <span class="min-w-0 truncate">Create <strong class="text-ink-strong">“{create.label}”</strong></span>
      </button>
    {:else if !options.length}
      <p class="px-2 py-5 text-center text-sm text-ink-muted">{empty}</p>
    {/if}
  </div>
</div>
