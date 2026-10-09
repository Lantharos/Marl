<script lang="ts">
  import type { EmailNotificationMode, InboxReason, NotificationPreferences } from '@marl/contracts';
  import X from '@lucide/svelte/icons/x';
  import { api, MarlApiError } from '#lib/api.js';
  import Button from '#lib/components/controls/Button.svelte';
  import Checkbox from '#lib/components/controls/Checkbox.svelte';
  import Notice from '#lib/components/feedback/Notice.svelte';
  import SettingsChoices from '#lib/components/settings/SettingsChoices.svelte';
  import SettingsHeader from '#lib/components/settings/SettingsHeader.svelte';
  import SettingsGroup from '#lib/components/settings/SettingsGroup.svelte';
  import List from '#lib/components/list/List.svelte';
  import type { PageData } from './$types';

  let { data }: { data: PageData } = $props();
  const { preferences: savedPreferences } = $derived(data);
  let preferences = $derived(savedPreferences);
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
    preferences = { ...preferences, reasons: next };
    void save({ reasons: next });
  }

  async function reset(owner: string, name: string) {
    error = '';
    try {
      await api(`/repositories/${owner}/${name}/notifications`, {
        method: 'PUT',
        body: JSON.stringify({ level: 'all' })
      });
      preferences = {
        ...preferences,
        repositories: preferences.repositories.filter((item) => item.owner !== owner || item.name !== name)
      };
    } catch (cause) {
      error = cause instanceof MarlApiError ? cause.message : 'The repository setting could not be changed.';
    }
  }

  function chooseMode(mode: EmailNotificationMode) {
    if (mode === preferences.mode) return;
    preferences = { ...preferences, mode };
    void save({ mode });
  }
</script>

<svelte:head><title>Notifications · Marl</title></svelte:head>
<SettingsHeader
  title="Notifications"
  description={preferences.email
    ? `Email goes to ${preferences.email}. Everything also appears in your inbox.`
    : 'Verify a primary email address to receive email notifications.'}
/>
{#if error}<Notice class="mb-4">{error}</Notice>{/if}

<div class="grid gap-10">
  <SettingsGroup title="Email" divided={false}>
    <SettingsChoices bind:value={() => preferences.mode, chooseMode} options={modes} label="Email notifications" />
  </SettingsGroup>

  {#if preferences.mode !== 'off'}
    <SettingsGroup title="What to email about" divided={false}>
      <List class="grid gap-0.5">
        {#each reasons as reason (reason.value)}
          <Checkbox
            checked={preferences.reasons.includes(reason.value)}
            label={reason.label}
            description={reason.description}
            onchange={(checked) => toggleReason(reason.value, checked)}
          />
        {/each}
      </List>
    </SettingsGroup>
  {/if}

  <SettingsGroup title="Repositories">
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
        Every repository notifies you about activity involving you. Use the bell on a repository to limit it to mentions
        or ignore it.
      </p>
    {/each}
  </SettingsGroup>
</div>
