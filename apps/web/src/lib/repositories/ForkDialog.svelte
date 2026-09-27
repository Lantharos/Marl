<script lang="ts">
  import { goto } from '$app/navigation';
  import { api, MarlApiError } from '$lib/api';
  import Button from '$lib/components/controls/Button.svelte';
  import Field from '$lib/components/controls/Field.svelte';
  import Select from '$lib/components/controls/Select.svelte';
  import Notice from '$lib/components/feedback/Notice.svelte';
  import Modal from '$lib/components/overlays/Modal.svelte';
  import { completeRepositoryName, repositoryName, validRepositoryName } from './repository-name';

  let {
    open = $bindable(false),
    owner,
    repository,
    options
  }: {
    open?: boolean;
    owner: string;
    repository: string;
    options: Array<{ value: string; label: string; description: string }>;
  } = $props();
  let forkOwner = $state('');
  let name = $state('');
  let busy = $state(false);
  let error = $state('');
  const submittedName = $derived(completeRepositoryName(name));
  const valid = $derived(validRepositoryName(submittedName));

  $effect(() => {
    if (!open) return;
    forkOwner = options[0]?.value ?? '';
    name = repositoryName(repository);
    error = '';
  });

  async function create() {
    if (busy || !forkOwner || !valid) return;
    busy = true;
    error = '';
    try {
      const result = await api<{ repository: { owner: string; name: string } }>(
        `/repositories/${owner}/${repository}/forks`,
        {
          method: 'POST',
          body: JSON.stringify({ owner: forkOwner, name: submittedName })
        }
      );
      await goto(`/${result.repository.owner}/${result.repository.name}`);
    } catch (cause) {
      error = cause instanceof MarlApiError ? cause.message : 'Repository could not be forked.';
      busy = false;
    }
  }
</script>

<Modal
  {open}
  title="Fork repository"
  description="Create an independent working copy connected to this repository’s fork network."
  onClose={() => !busy && (open = false)}
>
  <div class="grid gap-5">
    <Field label="Owner"><Select bind:value={forkOwner} {options} ariaLabel="Fork owner" /></Field>
    <Field label="Repository name">
      <input
        class="field"
        bind:value={name}
        oninput={() => (name = repositoryName(name))}
        onblur={() => (name = submittedName)}
        maxlength="100"
      />
    </Field>
    {#if error}<Notice>{error}</Notice>{/if}
  </div>
  {#snippet actions()}
    <Button size="small" onclick={() => (open = false)}>Cancel</Button>
    <Button size="small" variant="primary" loading={busy} disabled={!forkOwner || !valid} onclick={create}
      >Create fork</Button
    >
  {/snippet}
</Modal>
