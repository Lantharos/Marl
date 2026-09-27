<script lang="ts">
  import Chip from '$lib/components/controls/Chip.svelte';

  let {
    value,
    personal = false,
    onChange
  }: { value: string; personal?: boolean; onChange: (value: string) => void } = $props();
  const views = $derived(personal ? ['all', 'unanswered', 'following', 'unread'] : ['all', 'unanswered']);
</script>

<nav aria-label="Discussion filters" class="-mt-2 mb-3 flex flex-wrap gap-1">
  {#each views as view (view)}<Chip active={value === view} onclick={() => onChange(view)}
      >{view === 'all' ? 'All discussions' : view[0].toUpperCase() + view.slice(1)}</Chip
    >{/each}
</nav>
