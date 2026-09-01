<script lang="ts">
  import type { RepositoryTag } from '@marl/contracts';
  import Tag from 'lucide-svelte/icons/tag';
  import { dismissable } from '$lib/actions/dismissable';

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
  const filtered = $derived(tags.filter((tag) => !value.trim() || tag.name.toLowerCase().includes(value.trim().toLowerCase())).slice(0, 8));

  function choose(tag: RepositoryTag) {
    value = tag.name;
    open = false;
    onchoose?.(tag);
  }
</script>

<div class="picker" use:dismissable={() => (open = false)}>
  <div class="input"><Tag size={14} /><input bind:value {disabled} maxlength="255" autocomplete="off" data-1p-ignore spellcheck="false" placeholder="v1.0.0" aria-label="Release tag" aria-expanded={open} aria-controls="release-tag-options" onfocus={() => (open = true)} oninput={() => (open = true)} /></div>
  {#if open && filtered.length}<div id="release-tag-options" class="options" role="listbox" aria-label="Existing tags">{#each filtered as tag (tag.name)}<button type="button" role="option" aria-selected={tag.name === value} onclick={() => choose(tag)}><Tag size={13} /><span><strong>{tag.name}</strong><small>{tag.annotated ? 'Annotated tag' : 'Tag'} · {tag.targetCommitId.slice(0, 8)}</small></span></button>{/each}</div>{/if}
</div>

<style>
  .picker{position:relative}.input{display:flex;height:38px;align-items:center;gap:8px;padding:0 10px;border:1px solid var(--border-strong);border-radius:6px;background:var(--surface);color:var(--text-faint)}.input:focus-within{border-color:var(--brand)}input{min-width:0;flex:1;border:0;outline:0;background:transparent;color:var(--text-strong);font:inherit;font-size:13px}input:disabled{cursor:not-allowed}.options{position:absolute;z-index:40;top:43px;left:0;width:100%;padding:4px;border:1px solid var(--border-strong);border-radius:7px;background:var(--surface-raised);box-shadow:var(--shadow-card)}.options button{display:flex;width:100%;align-items:center;gap:8px;padding:8px;border:0;border-radius:4px;background:transparent;color:var(--text-muted);cursor:pointer;text-align:left}.options button:hover{background:var(--surface-hover);color:var(--text-strong)}.options span{min-width:0}.options strong,.options small{display:block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.options strong{font-size:11px}.options small{margin-top:2px;color:var(--text-faint);font-size:9px}
</style>
