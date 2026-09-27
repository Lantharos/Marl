<script lang="ts">
  import { untrack } from 'svelte';
  import type { EmailNotificationMode, InboxReason, NotificationPreferences } from '@marl/contracts';
  import X from '@lucide/svelte/icons/x';
  import { api, MarlApiError } from '$lib/api';
  import Button from '$lib/components/controls/Button.svelte';
  import Checkbox from '$lib/components/controls/Checkbox.svelte';
  import Notice from '$lib/components/feedback/Notice.svelte';
  import SettingsChoices from '$lib/components/settings/SettingsChoices.svelte';
  import SettingsHeader from '$lib/components/settings/SettingsHeader.svelte';
  import type { PageData } from './$types';

  let { data }: { data: PageData } = $props();
  let preferences = $state<NotificationPreferences>(untrack(() => data));
  let mode = $state<EmailNotificationMode>(untrack(() => data.mode));
  let error = $state('');
  const modes: Array<{ value: EmailNotificationMode; label: string; description: string }> = [
    {
      value: 'immediate',
      label: 'As it happens',
      description: 'A short email within about ten minutes of new activity.'
    },
    { value: 'daily', label: 'Daily summary', description: 'One email a day with everything you haven’t read yet.' },
    { value: 'off', label: 'Off', description: 'Only the inbox. Account and security email still arrives.' }
  ];
  const reasons: Array<{ value: InboxReason; label: string; description: string }> = [
    { value: 'mention', label: 'Mentions', description: 'Someone mentions you in an issue, pull, or comment.' },
    { value: 'assignment', label: 'Assignments', description: 'You are assigned to an issue or pull.' },
    {
      value: 'authored',
      label: 'Your issues and pulls',
      description: 'New comments, reviews, and changes on work you opened.'
    },
    {
      value: 'participating',
      label: 'Conversations you joined',
      description: 'Replies where you commented or follow along.'
    },
    { value: 'failure', label: 'Failed runs', description: 'A run you started fails.' }
  ];
  const levelLabels = { mentions: 'Mentions only', ignore: 'Ignored' };

  async function save(patch: { mode?: EmailNotificationMode; reasons?: InboxReason[] }) {
    error = '';
    try {
      preferences = await api<NotificationPreferences>('/notifications/preferences', {
        method: 'PATCH',
        body: JSON.stringify(patch)
      });
    } catch (cause) {
      error = cause instanceof MarlApiError ? cause.message : 'Notification settings could not be saved.';
    }
  }

  function toggleReason(reason: InboxReason, enabled: boolean) {
    const next = enabled ? [...preferences.reasons, reason] : preferences.reasons.filter((item) => item !== reason);
    preferences.reasons = next;
    void save({ reasons: next });
  }

  async function reset(owner: string, name: string) {
    error = '';
    try {
      await api(`/repositories/${owner}/${name}/notifications`, {
        method: 'PUT',
        body: JSON.stringify({ level: 'all' })
      });
      preferences.repositories = preferences.repositories.filter((item) => item.owner !== owner || item.name !== name);
    } catch (cause) {
      error = cause instanceof MarlApiError ? cause.message : 'The repository setting could not be changed.';
    }
  }

  $effect(() => {
    if (mode !== untrack(() => preferences.mode)) void save({ mode });
  });
</script>

<svelte:head><title>Notifications · Marl</title></svelte:head>
<SettingsHeader
  title="Notifications"
  description={preferences.email
    ? `Email goes to ${preferences.email}. Everything also appears in your inbox.`
    : 'Verify a primary email address to receive email notifications.'}
/>
{#if error}<Notice class="mb-4">{error}</Notice>{/if}

<div class="grid gap-8">
  <section>
    <h2 class="mb-2.5 px-1 text-sm font-semibold text-ink-strong">Email</h2>
    <SettingsChoices bind:value={mode} options={modes} label="Email notifications" />
  </section>

  {#if mode !== 'off'}
    <section>
      <h2 class="mb-2.5 px-1 text-sm font-semibold text-ink-strong">What to email about</h2>
      <div class="grid gap-0.5 surface p-1.5">
        {#each reasons as reason (reason.value)}
          <Checkbox
            checked={preferences.reasons.includes(reason.value)}
            label={reason.label}
            description={reason.description}
            onchange={(checked) => toggleReason(reason.value, checked)}
          />
        {/each}
      </div>
    </section>
  {/if}

  <section>
    <h2 class="mb-2.5 px-1 text-sm font-semibold text-ink-strong">Repositories</h2>
    <div class="divide-y divide-line-subtle surface px-4 sm:px-5">
      {#each preferences.repositories as repository (`${repository.owner}/${repository.name}`)}
        <div class="flex min-h-15 items-center justify-between gap-3 py-2.5">
          <span class="min-w-0">
            <a
              class="block truncate text-sm font-semibold text-ink-strong hover:text-brand"
              href="/{repository.owner}/{repository.name}">{repository.owner}/{repository.name}</a
            >
            <span class="text-xs text-ink-muted">{levelLabels[repository.level]}</span>
          </span>
          <Button
            icon
            size="small"
            variant="ghost"
            aria-label="Notify about all activity in {repository.owner}/{repository.name}"
            title="Notify about all activity"
            onclick={() => reset(repository.owner, repository.name)}><X size={15} /></Button
          >
        </div>
      {:else}
        <p class="py-5 text-sm text-ink-muted">
          Every repository notifies you about activity involving you. Use the bell on a repository to limit it to
          mentions or ignore it.
        </p>
      {/each}
    </div>
  </section>
</div>
