<script lang="ts">
  import type { RepositoryTag } from '@marl/contracts';
  import Tag from '@lucide/svelte/icons/tag';
  import { dismissable } from '$lib/actions/dismissable';
  import { popoverMotion } from '$lib/ui/popover';

  let {
    value = $bindable(''),
    tags,
    disabled = false,
    onchoose
  }: {
    value: string;
    tags: RepositoryTag[];
    disabled?: boolean;
    onchoose?: (tag: RepositoryTag) => void;
  } = $props();

  let open = $state(false);
  const filtered = $derived(
    tags.filter((tag) => !value.trim() || tag.name.toLowerCase().includes(value.trim().toLowerCase())).slice(0, 8)
  );

  function choose(tag: RepositoryTag) {
    value = tag.name;
    open = false;
    onchoose?.(tag);
  }
</script>

<div class="relative" use:dismissable={() => (open = false)}>
  <label class="flex h-10 field min-h-0 items-center gap-2 text-ink-faint">
    <Tag size={15} class="shrink-0" />
    <input
      bind:value
      {disabled}
      maxlength="255"
      autocomplete="off"
      data-1p-ignore
      spellcheck="false"
      placeholder="v1.0.0"
      aria-label="Release tag"
      aria-expanded={open}
      aria-controls="release-tag-options"
      onfocus={() => (open = true)}
      oninput={() => (open = true)}
      class="h-full min-w-0 flex-1 bg-transparent font-mono text-sm text-ink-strong outline-none placeholder:text-ink-faint disabled:cursor-not-allowed"
    />
  </label>
  {#if open && filtered.length}
    <div
      id="release-tag-options"
      class="absolute top-11 left-0 z-40 grid w-full origin-top-left gap-0.5 popover p-1.5"
      transition:popoverMotion
      role="listbox"
      aria-label="Existing tags"
    >
      {#each filtered as tag (tag.name)}
        <button
          type="button"
          role="option"
          aria-selected={tag.name === value}
          onclick={() => choose(tag)}
          class="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-ink-muted transition-colors hover:bg-surface-hover hover:text-ink-strong"
          ><Tag size={14} class="shrink-0" /><span class="min-w-0"
            ><strong class="block truncate font-mono text-sm font-semibold text-ink-strong">{tag.name}</strong><span
              class="block text-xs text-ink-muted"
              >{tag.annotated ? 'Annotated tag' : 'Tag'} · {tag.targetCommitId.slice(0, 8)}</span
            ></span
          ></button
        >
      {/each}
    </div>
  {/if}
</div>
