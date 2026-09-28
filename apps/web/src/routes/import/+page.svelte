<script lang="ts">
  import { goto } from '$app/navigation';
  import { untrack } from 'svelte';
  import { api, MarlApiError } from '$lib/api';
  import Button from '$lib/components/controls/Button.svelte';
  import Checkbox from '$lib/components/controls/Checkbox.svelte';
  import Field from '$lib/components/controls/Field.svelte';
  import LinkButton from '$lib/components/controls/LinkButton.svelte';
  import Select from '$lib/components/controls/Select.svelte';
  import Notice from '$lib/components/feedback/Notice.svelte';
  import FormShell from '$lib/components/page/FormShell.svelte';
  import SettingsChoices from '$lib/components/settings/SettingsChoices.svelte';
  import { ownerOptions } from '$lib/repositories/owner-options';
  import { completeRepositoryName, repositoryName } from '$lib/repositories/repository-name';
  import type { PageData } from './$types';

  let { data }: { data: PageData } = $props();
  const options = $derived(ownerOptions(data.organizations, data.shellUser?.displayName));
  let source = $state('');
  let token = $state('');
  let owner = $state(
    untrack(() => data.organizations.find((organization) => organization.kind === 'personal')?.slug ?? '')
  );
  let name = $state('');
  let visibility = $state<'source' | 'private' | 'public'>('source');
  let include = $state({ issues: true, pulls: true, releases: true });
  let busy = $state(false);
  let error = $state('');
  const suggestedName = $derived(
    source
      .trim()
      .replace(/\.git$/, '')
      .split('/')
      .filter(Boolean)
      .at(-1) ?? ''
  );

  async function start() {
    busy = true;
    error = '';
    try {
      const result = await api<{ import: { id: string } }>('/imports', {
        method: 'POST',
        body: JSON.stringify({
          source,
          token: token.trim() || undefined,
          owner,
          name: completeRepositoryName(name) || undefined,
          visibility: visibility === 'source' ? undefined : visibility,
          include
        })
      });
      await goto(`/import/${result.import.id}`);
    } catch (cause) {
      error = cause instanceof MarlApiError ? cause.message : 'The import could not be started.';
    } finally {
      busy = false;
    }
  }
</script>

<svelte:head><title>Import from GitHub · Marl</title></svelte:head>
<FormShell
  title="Import from GitHub"
  description="Bring a repository over with its full Git history, labels, issues, pulls, comments, and releases."
  backHref="/repositories/new"
  backLabel="New repository"
>
  <form
    class="grid gap-6"
    onsubmit={(event) => {
      event.preventDefault();
      void start();
    }}
  >
    <Field label="GitHub repository" hint="A URL like https://github.com/owner/name, or just owner/name.">
      <input
        class="field min-h-11 font-mono text-sm"
        bind:value={source}
        placeholder="owner/name"
        autocomplete="off"
        required
        data-1p-ignore
      />
    </Field>
    <Field
      label="Access token"
      optional
      hint="Needed for private repositories and recommended for large ones. Create a fine-grained token with read access to contents, issues, pull requests, and metadata. Marl deletes it when the import finishes."
    >
      <input
        class="field min-h-11 font-mono text-sm"
        type="password"
        bind:value={token}
        autocomplete="off"
        data-1p-ignore
      />
    </Field>
    <div class="grid gap-5 sm:grid-cols-2">
      <Field label="Owner"><Select bind:value={owner} ariaLabel="Repository owner" {options} /></Field>
      <Field label="Repository name" optional>
        <input
          class="field min-h-11"
          bind:value={name}
          oninput={() => (name = repositoryName(name))}
          placeholder={suggestedName || 'Same as on GitHub'}
          maxlength="100"
          autocomplete="off"
          data-1p-ignore
        />
      </Field>
    </div>
    <div class="grid gap-2">
      <span class="text-sm font-semibold text-ink-strong">Visibility</span>
      <SettingsChoices
        bind:value={visibility}
        label="Repository visibility"
        options={[
          { value: 'source', label: 'Same as on GitHub', description: 'Public stays public, private stays private.' },
          { value: 'private', label: 'Private', description: 'Only people you invite can see and clone it.' },
          { value: 'public', label: 'Public', description: 'Anyone can read the code, issues, and pulls.' }
        ]}
      />
    </div>
    <div class="grid gap-2">
      <span class="text-sm font-semibold text-ink-strong">Also import</span>
      <div class="grid gap-0.5 rounded-xl bg-surface p-1">
        <Checkbox bind:checked={include.issues} label="Issues" description="With their labels and comments." />
        <Checkbox
          bind:checked={include.pulls}
          label="Pulls"
          description="Open, closed, and merged, with their reviews and conversations."
        />
        <Checkbox
          bind:checked={include.releases}
          label="Releases"
          description="Release notes and files for tags in the repository."
        />
      </div>
      <p class="text-xs leading-relaxed text-ink-muted">People who aren’t on Marl appear by their GitHub username.</p>
    </div>
    {#if error}<Notice>{error}</Notice>{/if}
    <div class="flex flex-wrap justify-end gap-2">
      <LinkButton variant="ghost" href="/repositories/new">Cancel</LinkButton>
      <Button type="submit" variant="primary" loading={busy} disabled={!source.trim() || !owner}>Start import</Button>
    </div>
  </form>
</FormShell>
