<script lang="ts">
  let { name, src = null, size = 28, label = '' } = $props<{ name: string; src?: string | null; size?: number; label?: string }>();
  const initials = $derived(name.trim().split(/\s+/).map((part: string) => part[0]).join('').slice(0, 2).toUpperCase() || '?');
</script>

<span class="user-avatar" style:width={`${size}px`} style:height={`${size}px`} style:font-size={`${Math.max(7, Math.round(size * .31))}px`} aria-label={label || undefined}>
  {#if src}<img {src} alt="" />{:else}{initials}{/if}
</span>

<style>
  .user-avatar{display:inline-grid;flex:0 0 auto;overflow:hidden;place-items:center;border-radius:50%;background:#d5b496;color:#3d2518;font-weight:750;line-height:1}.user-avatar img{width:100%;height:100%;object-fit:cover}
</style>
