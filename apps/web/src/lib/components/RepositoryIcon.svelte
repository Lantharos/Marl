<script lang="ts">
  import FolderGit2 from 'lucide-svelte/icons/folder-git-2';
  let { name, src = null, size = 32, label = '' } = $props<{ name: string; src?: string | null; size?: number; label?: string }>();
</script>

<span class="repository-icon" style:width={`${size}px`} style:height={`${size}px`} aria-label={label || `${name} repository`}>
  {#if src}<img {src} alt="" />{:else}<FolderGit2 size={Math.max(13, Math.round(size * .48))} strokeWidth={1.8} />{/if}
</span>

<style>
  .repository-icon{display:inline-grid;flex:0 0 auto;overflow:hidden;place-items:center;border-radius:7px;background:var(--surface-muted);color:var(--text-muted);line-height:1}.repository-icon img{width:100%;height:100%;object-fit:cover}
</style>
