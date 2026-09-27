<script lang="ts">
  import FolderGit2 from '@lucide/svelte/icons/folder-git-2';

  let {
    name,
    src = null,
    size = 32,
    label = ''
  }: { name: string; src?: string | null; size?: number; label?: string } = $props();
</script>

<span
  class="inline-grid shrink-0 place-items-center overflow-hidden rounded-[22%] bg-surface-muted leading-none text-ink-muted"
  style:width={`${size}px`}
  style:height={`${size}px`}
  role="img"
  aria-label={label || `${name} repository`}
>
  {#if src}<img {src} alt="" class="size-full object-cover" />{:else}<FolderGit2
      size={Math.max(13, Math.round(size * 0.48))}
      strokeWidth={1.8}
    />{/if}
</span>
