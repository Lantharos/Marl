<script lang="ts">
  import { goto } from '$app/navigation';
  import Download from '@lucide/svelte/icons/download';
  import { api, MarlApiError } from '$lib/api';
  import Button from '$lib/components/controls/Button.svelte';
  import Field from '$lib/components/controls/Field.svelte';
  import Notice from '$lib/components/feedback/Notice.svelte';
  import Modal from '$lib/components/overlays/Modal.svelte';
  import SettingItem from '$lib/components/settings/SettingItem.svelte';
  import SettingsHeader from '$lib/components/settings/SettingsHeader.svelte';
  import { clearShellCache } from '$lib/shell-cache';
  import type { PageData } from './$types';

  let { data }: { data: PageData } = $props();
  const handle = $derived(data.shellUser?.handle ?? '');
  let exporting = $state(false);
  let deleting = $state(false);
  let confirmation = $state('');
  let busy = $state(false);
  let error = $state('');

  async function download() {
    exporting = true;
    error = '';
    try {
      const { url } = await api<{ url: string }>('/account/export', { method: 'POST', body: '{}' });
      window.location.assign(url);
    } catch (cause) {
      error = cause instanceof MarlApiError ? cause.message : 'Your data could not be prepared.';
    } finally {
      exporting = false;
    }
  }

  async function deleteAccount() {
    busy = true;
    error = '';
    try {
      await api('/account', { method: 'DELETE', body: JSON.stringify({ confirmation }) });
      clearShellCache(true);
      await goto('/', { invalidateAll: true });
    } catch (cause) {
      error = cause instanceof MarlApiError ? cause.message : 'Your account could not be deleted.';
    } finally {
      busy = false;
    }
  }
</script>

<svelte:head><title>Data and deletion · Marl</title></svelte:head>
<SettingsHeader
  title="Data and deletion"
  description="Take a copy of everything you have on Marl, or close your account."
/>
{#if error && !deleting}<Notice class="mb-4">{error}</Notice>{/if}

<div class="grid gap-8">
  <section>
    <h2 class="mb-2.5 px-1 text-sm font-semibold text-ink-strong">Your data</h2>
    <div class="divide-y divide-line-subtle surface px-4 sm:px-5">
      <SettingItem
        title="Download your data"
        description="Your profile, emails, keys, organizations, and every issue, pull, review, comment, and release in repositories you own, plus everything you wrote elsewhere, as one JSON file."
      >
        <Button size="small" loading={exporting} onclick={download}><Download size={14} />Download</Button>
      </SettingItem>
      <p class="py-4 text-sm leading-relaxed text-ink-muted">
        The file links to a Git bundle with the full history of each repository you own. Restore one with
        <code class="rounded bg-surface-muted px-1.5 py-0.5 font-mono text-xs text-ink">git clone name.bundle</code>, or
        clone the repository with Git as usual.
      </p>
    </div>
  </section>

  <section>
    <h2 class="mb-2.5 px-1 text-sm font-semibold text-ink-strong">Delete account</h2>
    <div class="surface px-4 sm:px-5">
      {#if data.blockers.length}
        <div class="grid gap-3 py-4">
          <p class="text-sm text-ink">
            You are the only owner of organizations that have other members. Make someone else an owner, or remove the
            other members, before deleting your account.
          </p>
          <ul class="grid gap-1">
            {#each data.blockers as organization (organization.slug)}
              <li>
                <a
                  class="text-sm font-semibold text-brand-strong hover:underline"
                  href="/organizations/{organization.slug}/settings/access">{organization.name}</a
                >
              </li>
            {/each}
          </ul>
        </div>
      {:else}
        <SettingItem
          title="Delete your account"
          description="Your personal information is removed immediately. Comments you left in other people's repositories stay, attributed to a deleted user."
        >
          <Button
            size="small"
            variant="danger-soft"
            onclick={() => {
              confirmation = '';
              error = '';
              deleting = true;
            }}>Delete account</Button
          >
        </SettingItem>
      {/if}
    </div>
  </section>
</div>

<Modal open={deleting} size="small" title="Delete your account?" onClose={() => !busy && (deleting = false)}>
  <div class="grid gap-4 text-sm leading-relaxed text-ink-muted">
    <p>
      {#if data.repositoryCount}
        {data.repositoryCount}
        {data.repositoryCount === 1 ? 'repository' : 'repositories'} you own will be hidden now and permanently deleted after
        30 days.
      {:else}
        You don’t own any repositories.
      {/if}
      {#if data.teamOrganizations.length}
        {data.teamOrganizations.map((organization) => organization.name).join(', ')}
        {data.teamOrganizations.length === 1 ? 'closes' : 'close'} with your account.
      {/if}
      This can’t be undone.
    </p>
    <Field label={`Type ${handle} to confirm`}>
      <input class="field font-mono" bind:value={confirmation} autocomplete="off" placeholder={handle} data-1p-ignore />
    </Field>
    {#if error}<Notice>{error}</Notice>{/if}
  </div>
  {#snippet actions()}
    <Button size="small" disabled={busy} onclick={() => (deleting = false)}>Cancel</Button>
    <Button size="small" variant="danger" loading={busy} disabled={confirmation !== handle} onclick={deleteAccount}
      >Delete account</Button
    >
  {/snippet}
</Modal>
