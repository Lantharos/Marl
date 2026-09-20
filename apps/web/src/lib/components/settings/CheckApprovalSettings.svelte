<script lang="ts">
  import { untrack } from 'svelte';
  import { api, MarlApiError } from '$lib/api';
  import Button from '$lib/components/Button.svelte';
  import Modal from '$lib/components/Modal.svelte';
  import SettingRow from './SettingRow.svelte';
  import SettingsChoices from './SettingsChoices.svelte';

  let { endpoint, initialValue } = $props<{ endpoint: string; initialValue: boolean }>();
  let required = $state(untrack(() => initialValue));
  let choice = $state('automatic');
  let open = $state(false);
  let saving = $state(false);
  let error = $state('');
  const options = [
    { value: 'automatic', label: 'Run automatically', description: 'Run checks for outside contributors’ pulls on this repository’s runners.' },
    { value: 'approval', label: 'Wait for approval', description: 'A maintainer approves outside contributors’ pull checks before they use this repository’s runners.' }
  ];
  async function save() {
    if (saving) return;
    saving = true; error = '';
    const submitted = choice === 'approval';
    try {
      await api(endpoint, { method: 'PATCH', body: JSON.stringify({ requireCheckApproval: submitted }) });
      required = submitted; open = false;
    } catch (cause) { error = cause instanceof MarlApiError ? cause.message : 'Check approval could not be updated.'; }
    finally { saving = false; }
  }
</script>

<SettingRow title="Outside contributors’ checks" value={required ? 'Wait for maintainer approval' : 'Run automatically'} onclick={() => { choice = required ? 'approval' : 'automatic'; error = ''; open = true; }} />
<Modal {open} title="Outside contributors’ checks" onClose={() => { if (!saving) open = false; }} --modal-width="540px">
  <SettingsChoices bind:value={choice} {options} label="When checks run" disabled={saving} />
  <p class="note">Maintainer pulls and direct pushes run normally. Pushes to a fork use the fork’s own runners.</p>
  {#if error}<p class="error" role="alert">{error}</p>{/if}
  {#snippet actions()}<Button size="small" disabled={saving} onclick={() => (open = false)}>Cancel</Button><Button size="small" variant="primary" loading={saving} disabled={(choice === 'approval') === required} onclick={save}>Save</Button>{/snippet}
</Modal>

<style>.note{margin:16px 0 0;color:var(--text-muted);font-size:12px;line-height:1.6}.error{margin:14px 0 0;color:var(--danger);font-size:13px}</style>
