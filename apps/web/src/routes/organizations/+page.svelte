<script lang="ts">
  import { goto } from '$app/navigation';
  import { page } from '$app/state';
  import { untrack } from 'svelte';
  import Plus from '@lucide/svelte/icons/plus';
  import Button from '$lib/components/controls/Button.svelte';
  import Modal from '$lib/components/overlays/Modal.svelte';
  import PageHeader from '$lib/components/page/PageHeader.svelte';
  import OrganizationAvatar from '$lib/components/identity/OrganizationAvatar.svelte';
  import Select from '$lib/components/controls/Select.svelte';
  import { api, MarlApiError } from '$lib/api';
  import type { OrganizationSummary } from '@marl/contracts';
  import Building from '@lucide/svelte/icons/building-complex';
  import Field from '$lib/components/controls/Field.svelte';
  import EmptyState from '$lib/components/feedback/EmptyState.svelte';
  import Notice from '$lib/components/feedback/Notice.svelte';
  import Page from '$lib/components/page/Page.svelte';
  import type { PageData } from './$types';

  let { data }: { data: PageData } = $props();
  let organizations = $state(untrack(() => [...data.organizations]));
  let open = $state(false);
  let name = $state('');
  let slug = $state('');
  let baseRole = $state('read');
  let error = $state('');
  let busy = $state(false);
  let slugEdited = $state(false);
  const roles = [
    { value: 'read', label: 'Read', description: 'Members can view repositories' },
    { value: 'triage', label: 'Triage', description: 'Members can manage reviews and issues' },
    { value: 'write', label: 'Write', description: 'Members can push code' },
    { value: 'maintain', label: 'Maintain', description: 'Members can manage repository settings' }
  ];

  $effect(() => {
    if (page.url.searchParams.get('new') === '1') open = true;
  });

  function updateName(value: string) {
    name = value;
    if (!slugEdited)
      slug = value
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-|-$/g, '');
  }

  function closeCreate() {
    open = false;
    name = '';
    slug = '';
    baseRole = 'read';
    slugEdited = false;
    error = '';
    if (page.url.searchParams.has('new')) void goto('/organizations', { replaceState: true, noScroll: true });
  }

  async function create() {
    busy = true;
    error = '';
    try {
      const result = await api<{ organization: OrganizationSummary }>('/organizations', {
        method: 'POST',
        body: JSON.stringify({ name, slug, baseRepositoryRole: baseRole })
      });
      organizations = [...organizations, result.organization];
      closeCreate();
    } catch (cause) {
      error = cause instanceof MarlApiError ? cause.message : 'The organization could not be created.';
    } finally {
      busy = false;
    }
  }
</script>

<svelte:head><title>Organizations · Marl</title></svelte:head>
<Page>
  <PageHeader
    title="Organizations"
    description="Shared homes for repositories, with members, teams, and default access."
  >
    {#snippet action()}<Button variant="primary" onclick={() => (open = true)}
        ><Plus size={16} />New organization</Button
      >{/snippet}
  </PageHeader>
  <div class="surface p-1.5">
    {#each organizations as organization (organization.slug)}
      <a
        href={`/organizations/${organization.slug}/settings/profile`}
        class="group grid grid-cols-[36px_minmax(0,1fr)_auto] items-center gap-3 rounded-lg px-3 py-3 transition-colors hover:bg-surface-hover"
      >
        <OrganizationAvatar name={organization.name} src={organization.avatarUrl} size={36} />
        <div class="min-w-0">
          <strong class="block truncate text-base font-semibold text-ink-strong group-hover:text-brand"
            >{organization.name}</strong
          >
          <span class="block truncate text-xs text-ink-muted"
            >{organization.slug} · {organization.members}
            {organization.members === 1 ? 'member' : 'members'} · {organization.repositories}
            {organization.repositories === 1 ? 'repository' : 'repositories'}</span
          >
        </div>
        <span class="rounded-full bg-surface-muted px-2.5 py-1 text-xs font-medium text-ink-muted capitalize"
          >{organization.role}</span
        >
      </a>
    {:else}
      <EmptyState
        icon={Building}
        title="No organizations yet"
        description="Create one when a project needs shared ownership and team access."
      />
    {/each}
  </div>
</Page>

{#snippet createActions()}
  <Button size="small" onclick={closeCreate}>Cancel</Button>
  <Button size="small" variant="primary" loading={busy} disabled={!name.trim() || !slug.trim()} onclick={create}
    >Create organization</Button
  >
{/snippet}
<Modal
  {open}
  title="New organization"
  description="Organizations own repositories and define access through members and teams."
  onClose={closeCreate}
  actions={createActions}
>
  <div class="grid gap-5">
    <Field label="Name"
      ><input class="field" value={name} oninput={(event) => updateName(event.currentTarget.value)} /></Field
    >
    <Field label="URL name" hint={slug ? `marl.sh/${slug}` : undefined}>
      <input
        class="field font-mono"
        value={slug}
        oninput={(event) => {
          slug = event.currentTarget.value;
          slugEdited = true;
        }}
      />
    </Field>
    <Field label="Base repository role"
      ><Select bind:value={baseRole} options={roles} ariaLabel="Base repository role" /></Field
    >
    {#if error}<Notice>{error}</Notice>{/if}
  </div>
</Modal>
