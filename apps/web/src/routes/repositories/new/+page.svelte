<script lang="ts">
  import { goto } from '$app/navigation';
  import { untrack } from 'svelte';
  import Button from '$lib/components/controls/Button.svelte';
  import FormShell from '$lib/components/page/FormShell.svelte';
  import LinkButton from '$lib/components/controls/LinkButton.svelte';
  import Field from '$lib/components/controls/Field.svelte';
  import Select from '$lib/components/controls/Select.svelte';
  import Notice from '$lib/components/feedback/Notice.svelte';
  import SettingsChoices from '$lib/components/settings/SettingsChoices.svelte';
  import { api, MarlApiError } from '$lib/api';
  import { ownerOptions } from '$lib/repositories/owner-options';
  import { completeRepositoryName, repositoryName, validRepositoryName } from '$lib/repositories/repository-name';
  import type { PageData } from './$types';
  let { data }: { data: PageData } = $props();
  const options = $derived(ownerOptions(data.organizations, data.shellUser?.displayName));
  let owner = $state(
    untrack(() => data.organizations.find((organization) => organization.kind === 'personal')?.slug ?? '')
  );
  let name = $state('');
  let visibility = $state<'private' | 'public'>('private');
  let description = $state('');
  let submitting = $state(false);
  let error = $state('');
  const submittedName = $derived(completeRepositoryName(name));
  const nameValid = $derived(validRepositoryName(submittedName));
  async function createRepository() {
    if (!nameValid || submitting) return;
    submitting = true;
    error = '';
    try {
      await api('/repositories', {
        method: 'POST',
        body: JSON.stringify({ owner, name: submittedName, description: description.trim(), visibility })
      });
      await goto(`/${owner}/${submittedName}`);
    } catch (cause) {
      error = cause instanceof MarlApiError ? cause.message : 'Marl could not create the repository. Try again.';
    } finally {
      submitting = false;
    }
  }
</script>

<svelte:head><title>New repository · Marl</title></svelte:head>
<FormShell
  title="Create a repository"
  description="Moving a project from GitHub? Import it with its history, issues, pulls, and releases instead."
  backHref="/repositories"
  backLabel="Repositories"
>
  <LinkButton size="small" class="mb-6" href="/import">Import from GitHub</LinkButton>
  <form
    class="grid gap-6"
    onsubmit={(event) => {
      event.preventDefault();
      void createRepository();
    }}
  >
    <div class="grid gap-5 sm:grid-cols-2">
      <Field label="Owner"><Select bind:value={owner} ariaLabel="Repository owner" {options} /></Field>
      <Field label="Repository name">
        <input
          class="field min-h-11"
          bind:value={name}
          oninput={() => (name = repositoryName(name))}
          onblur={() => (name = submittedName)}
          maxlength="100"
          placeholder="new-project"
          autocomplete="off"
          data-1p-ignore
        />
      </Field>
    </div>
    <Field label="Description" optional>
      <textarea
        class="field min-h-24 resize-y py-3 leading-relaxed"
        bind:value={description}
        placeholder="What is this repository for?"
        data-1p-ignore></textarea>
    </Field>
    <div class="grid gap-2">
      <span class="text-sm font-semibold text-ink-strong">Visibility</span>
      <SettingsChoices
        bind:value={visibility}
        label="Repository visibility"
        options={[
          { value: 'private', label: 'Private', description: 'Only people you invite can see and clone it.' },
          { value: 'public', label: 'Public', description: 'Anyone can read the code, issues, and pulls.' }
        ]}
      />
    </div>
    {#if error}<Notice>{error}</Notice>{/if}
    <div class="flex flex-wrap justify-end gap-2">
      <LinkButton variant="ghost" href="/repositories">Cancel</LinkButton>
      <Button type="submit" variant="primary" loading={submitting} disabled={!owner || !nameValid}
        >Create repository</Button
      >
    </div>
  </form>
</FormShell>
