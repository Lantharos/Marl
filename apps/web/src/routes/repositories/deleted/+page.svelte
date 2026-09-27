<script lang="ts">
  import { invalidateAll } from '$app/navigation';
  import { api } from '$lib/api';
  import ArchiveRestore from '@lucide/svelte/icons/archive-restore';
  import Button from '$lib/components/controls/Button.svelte';
  import EmptyState from '$lib/components/feedback/EmptyState.svelte';
  import Notice from '$lib/components/feedback/Notice.svelte';
  import BackLink from '$lib/components/page/BackLink.svelte';
  import PageHeader from '$lib/components/page/PageHeader.svelte';
  import { formatDate } from '$lib/time';
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
      await invalidateAll();
    } catch (reason) {
      error = reason instanceof Error ? reason.message : 'The repository could not be restored.';
    } finally {
      busy = '';
    }
  }
</script>

<svelte:head><title>Recently deleted · Marl</title></svelte:head>
<main class="mx-auto w-full max-w-215 px-4 pt-8 pb-20 sm:px-6 sm:pt-10">
  <div class="mb-4"><BackLink href="/repositories" label="Repositories" /></div>
  <PageHeader
    title="Recently deleted"
    description="Restore repositories within 30 days of deletion. Code and discussions are kept until then; cancelled runs stay cancelled."
  />
  {#if error}<Notice class="mb-4">{error}</Notice>{/if}
  <div class="divide-y divide-line-subtle surface px-4 sm:px-5">
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
  </div>
</main>
