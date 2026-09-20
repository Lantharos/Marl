<script lang="ts">
  import { untrack } from 'svelte';
  import type { SigningMode } from '@marl/contracts';
  import { api, MarlApiError } from '$lib/api';
  import Button from '$lib/components/Button.svelte';
  import Modal from '$lib/components/Modal.svelte';
  import SettingRow from './SettingRow.svelte';
  import SettingsChoices from './SettingsChoices.svelte';

  let { endpoint, initialMode, personal = false } = $props<{ endpoint: string; initialMode: SigningMode; personal?: boolean }>();
  const modes: Array<{ value: SigningMode; label: string; description: string }> = [
    { value: 'optional', label: 'Optional', description: 'Show verified signatures. Accept unsigned commits without a warning.' },
    { value: 'vigilant', label: 'Vigilant', description: 'Accept unsigned commits, but mark them Unverified.' },
    { value: 'firewall', label: 'Firewall', description: 'Only accept commits signed with the author’s registered SSH key.' }
  ];
  let mode = $state(untrack(() => initialMode));
  let savedMode = $state(untrack(() => initialMode));
  let saving = $state(false);
  let open = $state(false);
  let error = $state('');
  const current = $derived(modes.find(option => option.value === savedMode)!);

  async function save() {
    if (saving || mode === savedMode) return;
    const submitted = mode;
    saving = true;
    error = '';
    try {
      await api(endpoint, { method: 'PATCH', body: JSON.stringify({ signingMode: submitted }) });
      savedMode = submitted;
      open = false;
    } catch (cause) {
      error = cause instanceof MarlApiError ? cause.message : 'Commit signing could not be updated.';
    } finally { saving = false; }
  }
</script>

<SettingRow title="Commit signing" value={current.label} onclick={() => { mode = savedMode; error = ''; open = true; }} />

<Modal {open} title="Commit signing" onClose={() => { if (!saving) open = false; }} --modal-width="540px">
  <SettingsChoices bind:value={mode} options={modes} label="Signing policy" disabled={saving} />
  {#if mode === 'firewall'}<p class="policy-note">Existing history stays intact. Merge, squash, and rebase commits must be signed locally before pushing.</p>{/if}
  <p class="policy-note">{personal ? 'Protects your verified author email addresses.' : 'Applies to every contributor.'} The stricter account or repository policy applies.</p>
  {#if error}<p class="error" role="alert">{error}</p>{/if}
  {#snippet actions()}<Button size="small" disabled={saving} onclick={() => (open = false)}>Cancel</Button><Button size="small" variant="primary" loading={saving} disabled={mode === savedMode} onclick={save}>Save</Button>{/snippet}
</Modal>

<style>
  .policy-note{margin:16px 0 0;color:var(--text-muted);font-size:12px;line-height:1.6}.error{color:var(--danger);font-size:13px}
</style>
