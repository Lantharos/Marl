<script lang="ts">
  import Button from '$lib/components/Button.svelte';
  let { value, personal = false, onChange } = $props<{ value: string; personal?: boolean; onChange: (value: string) => void }>();
  const views = $derived(personal ? ['all', 'unanswered', 'following', 'unread'] : ['all', 'unanswered']);
</script>

<nav aria-label="Discussion filters">
  {#each views as view (view)}<Button size="small" variant="ghost" class={`view${value === view ? ' active' : ''}`} aria-pressed={value === view} onclick={() => onChange(view)}>{view === 'all' ? 'All discussions' : view[0].toUpperCase() + view.slice(1)}</Button>{/each}
</nav>

<style>
  nav{display:flex;flex-wrap:wrap;gap:5px;margin:2px 0 12px}
  nav :global(.view.button){height:32px;padding:0 12px;border-radius:99px;font-size:12px;color:var(--text-muted)}
  nav :global(.view.active.button){background:var(--surface-muted);color:var(--text-strong)}
</style>
