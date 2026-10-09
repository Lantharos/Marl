<script lang="ts">
  import type { RepositoryNotificationLevel } from '@marl/contracts';
  import Bell from '@lucide/svelte/icons/bell';
  import BellOff from '@lucide/svelte/icons/bell-off';
  import { api } from '#lib/api.js';
  import Button from '#lib/components/controls/Button.svelte';
  import Menu from '#lib/components/overlays/menu/Menu.svelte';
  import MenuItem from '#lib/components/overlays/menu/MenuItem.svelte';

  let { owner, repository }: { owner: string; repository: string } = $props();
  let open = $state(false);
  let level = $state<RepositoryNotificationLevel | null>(null);
  const endpoint = $derived(`/repositories/${owner}/${repository}/notifications`);
  const choices: Array<{ value: RepositoryNotificationLevel; label: string; description: string }> = [
    {
      value: 'all',
      label: 'Activity involving you',
      description: 'Mentions, assignments, and conversations you joined.'
    },
    { value: 'mentions', label: 'Mentions only', description: 'Only when someone mentions you.' },
    { value: 'ignore', label: 'Ignore', description: 'Nothing from this repository.' }
  ];

  $effect(() => {
    if (open && level === null)
      void api<{ level: RepositoryNotificationLevel }>(endpoint).then((result) => (level = result.level));
  });

  async function choose(next: RepositoryNotificationLevel) {
    const previous = level;
    level = next;
    await api(endpoint, { method: 'PUT', body: JSON.stringify({ level: next }) }).catch(() => (level = previous));
  }
</script>

<Menu label="Repository notifications" bind:open class="w-[min(300px,calc(100vw-32px))]">
  {#snippet trigger(menu)}
    <Button icon size="small" aria-label="Repository notifications" {...menu}
      >{#if level === 'ignore'}<BellOff size={15} />{:else}<Bell size={15} />{/if}</Button
    >
  {/snippet}
  {#each choices as choice (choice.value)}
    <MenuItem
      checked={level === choice.value}
      description={choice.description}
      disabled={level === null}
      onselect={() => choose(choice.value)}>{choice.label}</MenuItem
    >
  {/each}
</Menu>
