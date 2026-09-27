<script lang="ts">
  import Button from '../controls/Button.svelte';
  import SettingItem from './SettingItem.svelte';

  let {
    title,
    value,
    action = 'Change',
    disabled = false,
    onclick
  }: {
    title: string;
    value: string;
    action?: string;
    disabled?: boolean;
    onclick: () => void;
  } = $props();
</script>

<SettingItem {title} description={value}>
  <Button
    size="small"
    class="min-w-19"
    {disabled}
    aria-label={`${action} ${title.toLowerCase()}`}
    aria-haspopup="dialog"
    {onclick}>{action}</Button
  >
</SettingItem>
