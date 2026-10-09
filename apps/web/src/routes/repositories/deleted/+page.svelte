<script lang="ts">
  import { refreshAll } from '$app/navigation';
  import { api } from '#lib/api.js';
  import ArchiveRestore from '@lucide/svelte/icons/archive-restore';
  import Button from '#lib/components/controls/Button.svelte';
  import EmptyState from '#lib/components/feedback/EmptyState.svelte';
  import Notice from '#lib/components/feedback/Notice.svelte';
  import Page from '#lib/components/page/Page.svelte';
  import PageHeader from '#lib/components/page/PageHeader.svelte';
  import SettingsGroup from '#lib/components/settings/SettingsGroup.svelte';
  import { formatDate } from '#lib/time.js';
  import type { PageData } from './$types';
  let { data }: { data: PageData } = $props();
  let busy = $state('');
  let error = $state('');
  async function restore(owner: string, name: string) {
    busy = `${owner}/${name}`;
    error = '';
    try {
      await api(`/repositories/${encodeURIComponent(owner)}/${encodeURIComponent(name)}/settings/restore`, {
        method: 'POST'
      });
      await refreshAll();
    } catch (reason) {
      error = reason instanceof Error ? reason.message : 'The repository could not be restored.';
    } finally {
      busy = '';
    }
  }
</script>

<svelte:head><title>Recently deleted · Marl</title></svelte:head>
<Page width="narrow">
  <PageHeader
    title="Recently deleted"
    description="Restore repositories within 30 days of deletion. Code and discussions are kept until then; cancelled runs stay cancelled."
  />
  {#if error}<Notice class="mb-4">{error}</Notice>{/if}
  <SettingsGroup label="Deleted repositories">
    {#each data.repositories as repository (`${repository.owner}/${repository.name}`)}
      <div class="flex min-h-18 items-center justify-between gap-5 py-3">
        <div class="min-w-0">
          <strong class="block truncate text-base font-semibold text-ink-strong"
            >{repository.owner}/{repository.name}</strong
          >
          <span class="mt-0.5 block text-sm text-ink-muted"
            >{repository.deletionStartedAt
              ? 'Permanently deleting'
              : `Recover before ${formatDate(repository.deletionScheduledAt)}`}</span
          >
        </div>
        <Button
          size="small"
          disabled={Boolean(busy) ||
            Boolean(repository.deletionStartedAt) ||
            Date.parse(repository.deletionScheduledAt) <= Date.now()}
          loading={busy === `${repository.owner}/${repository.name}`}
          onclick={() => restore(repository.owner, repository.name)}>Restore</Button
        >
      </div>
    {:else}
      <EmptyState
        compact
        icon={ArchiveRestore}
        title="Nothing to restore"
        description="Repositories you delete stay here for 30 days."
      />
    {/each}
  </SettingsGroup>
</Page>
