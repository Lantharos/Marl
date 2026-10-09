<script lang="ts">
  import type { RepositoryTag } from '@marl/contracts';
  import Tag from '@lucide/svelte/icons/tag';
  import Popover from '#lib/components/overlays/Popover.svelte';

  let { value = $bindable(''), tags }: { value: string; tags: RepositoryTag[] } = $props();

  let open = $state(false);
  let field = $state<HTMLElement>();
  const filtered = $derived(
    tags.filter((tag) => !value.trim() || tag.name.toLowerCase().includes(value.trim().toLowerCase())).slice(0, 8)
  );

  function choose(tag: RepositoryTag) {
    value = tag.name;
    open = false;
  }
</script>

<div onfocusout={(event) => !event.currentTarget.contains(event.relatedTarget as Node | null) && (open = false)}>
  <label bind:this={field} class="flex h-10 field min-h-0 items-center gap-2 text-ink-faint">
    <Tag size={15} class="shrink-0" />
    <input
      bind:value
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
      onkeydown={(event) => event.key === 'Escape' && (open = false)}
      class="h-full min-w-0 flex-1 bg-transparent font-mono text-sm text-ink-strong outline-none placeholder:text-ink-faint"
    />
  </label>
  <Popover
    open={open && filtered.length > 0}
    anchor={field}
    dismiss="manual"
    placement="bottom-start"
    matchWidth
    id="release-tag-options"
    class="grid gap-0.5 p-1.5"
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
  </Popover>
</div>
