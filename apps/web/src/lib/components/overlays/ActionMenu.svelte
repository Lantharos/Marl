<script lang="ts">
  import Ellipsis from '@lucide/svelte/icons/ellipsis';
  import Button from '../controls/Button.svelte';
  import Menu from './menu/Menu.svelte';
  import MenuItem from './menu/MenuItem.svelte';

  type Action = { label: string; onSelect: () => void; danger?: boolean };
  let { label, actions }: { label: string; actions: Action[] } = $props();
</script>

{#if actions.length}
  <Menu {label} class="w-48">
    {#snippet trigger(menu)}
      <Button icon size="small" variant="ghost" aria-label={label} {...menu}><Ellipsis size={16} /></Button>
    {/snippet}
    {#each actions as action (action.label)}
      <MenuItem tone={action.danger ? 'danger' : 'default'} onselect={action.onSelect}>{action.label}</MenuItem>
    {/each}
  </Menu>
{/if}
