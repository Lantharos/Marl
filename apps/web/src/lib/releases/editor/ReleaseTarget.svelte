<script lang="ts">
  import type { ReleaseDetail, RepositoryTag } from '@marl/contracts';
  import GitBranch from '@lucide/svelte/icons/git-branch';
  import GitCommitHorizontal from '@lucide/svelte/icons/git-commit-horizontal';
  import Tag from '@lucide/svelte/icons/tag';
  import Field from '#lib/components/controls/Field.svelte';
  import Select from '#lib/components/controls/Select.svelte';
  import TagPicker from './TagPicker.svelte';

  type Branch = { name: string; commitId: string };
  let {
    tagName = $bindable(),
    target = $bindable(),
    branches,
    tags,
    existingTag,
    release
  }: {
    tagName: string;
    target: string;
    branches: Branch[];
    tags: RepositoryTag[];
    existingTag?: RepositoryTag;
    release?: ReleaseDetail;
  } = $props();
  const published = $derived(Boolean(release && !release.draft));
  const targetOptions = $derived.by(() => {
    const options = branches.map((branch) => ({
      value: branch.name,
      label: branch.name,
      description: branch.commitId.slice(0, 8)
    }));
    if (target && !options.some((option) => option.value === target))
      options.unshift({ value: target, label: `Commit ${target.slice(0, 8)}`, description: 'Current target' });
    return options;
  });
  const tagHint = $derived(
    published
      ? 'Published tags never move.'
      : existingTag
        ? `Uses the existing tag at ${existingTag.targetCommitId.slice(0, 7)}.`
        : tagName.trim()
          ? 'A new tag is created from the target when you publish.'
          : 'Pick an existing tag or type a new one.'
  );
</script>

{#snippet fixed(Icon: typeof Tag, text: string)}
  <div class="flex h-10 items-center gap-2 rounded-md bg-surface-muted px-3 font-mono text-sm text-ink">
    <Icon size={14} class="shrink-0 text-ink-muted" /><span class="truncate">{text}</span>
  </div>
{/snippet}

<Field label="Tag" hint={tagHint}>
  {#if published}{@render fixed(Tag, tagName)}{:else}<TagPicker bind:value={tagName} {tags} />{/if}
</Field>
<Field label="Target">
  {#if published && release}{@render fixed(
      release.targetBranch ? GitBranch : GitCommitHorizontal,
      release.targetBranch ?? release.targetCommitId.slice(0, 12)
    )}
  {:else if existingTag}{@render fixed(GitCommitHorizontal, existingTag.targetCommitId.slice(0, 12))}
  {:else}<Select bind:value={target} options={targetOptions} ariaLabel="Release target" />{/if}
</Field>
