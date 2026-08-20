<script lang="ts">
  import Check from 'lucide-svelte/icons/check';
  import Button from '../Button.svelte';

  let { state = 'idle', label = 'Save changes', savingLabel = 'Saving', savedLabel = 'Saved!', disabled = false, onclick } = $props<{
    state?: 'idle' | 'saving' | 'saved';
    label?: string;
    savingLabel?: string;
    savedLabel?: string;
    disabled?: boolean;
    onclick: () => void | Promise<void>;
  }>();
</script>

<Button variant="primary" loading={state === 'saving'} disabled={disabled || state !== 'idle'} {onclick}>
  {#if state === 'saved'}<Check size={14} />{savedLabel}{:else if state === 'saving'}{savingLabel}{:else}{label}{/if}
</Button>
