<script lang="ts">
  import { onMount } from 'svelte';
  import MonitorSmartphone from '@lucide/svelte/icons/monitor-smartphone';
  import { authClient } from '#lib/auth-client.js';
  import Button from '#lib/components/controls/Button.svelte';
  import EmptyState from '#lib/components/feedback/EmptyState.svelte';
  import Notice from '#lib/components/feedback/Notice.svelte';
  import ConfirmDialog from '#lib/components/overlays/ConfirmDialog.svelte';
  import SettingEntry from '#lib/components/settings/SettingEntry.svelte';
  import SettingsHeader from '#lib/components/settings/SettingsHeader.svelte';
  import SettingsGroup from '#lib/components/settings/SettingsGroup.svelte';
  import { formatTimestamp } from '#lib/time.js';
  import type { PageData } from './$types';

  let { data }: { data: PageData } = $props();
  let busy = $state('');
  let error = $state('');
  const { sessions: savedSessions } = $derived(data);
  let sessions = $derived(savedSessions);
  let current = $state<string | null>(null);
  let confirmOthers = $state(false);
  const ordered = $derived(
    sessions.toSorted((left, right) => Number(right.token === current) - Number(left.token === current))
  );
  const others = $derived(sessions.filter((session) => session.token !== current).length);

  onMount(async () => {
    current = (await authClient.getSession()).data?.session.token ?? null;
  });

  function deviceName(userAgent?: string | null) {
    if (!userAgent) return 'Unknown browser';
    const platform = /Windows/i.test(userAgent)
      ? 'Windows'
      : /iPhone/i.test(userAgent)
        ? 'iPhone'
        : /iPad/i.test(userAgent)
          ? 'iPad'
          : /Android/i.test(userAgent)
            ? 'Android'
            : /Mac OS X|Macintosh/i.test(userAgent)
              ? 'macOS'
              : /Linux/i.test(userAgent)
                ? 'Linux'
                : 'an unknown device';
    const browser = /Edg\//.test(userAgent)
      ? 'Edge'
      : /Firefox\//.test(userAgent)
        ? 'Firefox'
        : /Chrome\//.test(userAgent)
          ? 'Chrome'
          : /Safari\//.test(userAgent)
            ? 'Safari'
            : 'Browser';
    return `${browser} on ${platform}`;
  }

  async function revokeOthers() {
    busy = 'others';
    error = '';
    const result = await authClient.revokeOtherSessions();
    busy = '';
    if (result.error) {
      error = result.error.message || 'Other sessions could not be signed out.';
      return;
    }
    sessions = sessions.filter((session) => session.token === current);
    confirmOthers = false;
  }

  async function revokeSession(token: string) {
    if (busy) return;
    busy = token;
    error = '';
    try {
      const result = await authClient.revokeSession({ token });
      if (result.error) error = result.error.message || 'This session could not be signed out.';
      else sessions = sessions.filter((session) => session.token !== token);
    } catch {
      error = 'This session could not be signed out.';
    } finally {
      busy = '';
    }
  }
</script>

<svelte:head><title>Sessions · Marl</title></svelte:head>
<SettingsHeader title="Sessions" description="Browsers and devices signed in to your account.">
  {#snippet action()}{#if current && others}<Button
        size="small"
        variant="danger-soft"
        disabled={Boolean(busy)}
        onclick={() => {
          error = '';
          confirmOthers = true;
        }}>Sign out other sessions</Button
      >{/if}{/snippet}
</SettingsHeader>
{#if error && !confirmOthers}<Notice class="mb-4">{error}</Notice>{/if}
<SettingsGroup>
  {#each ordered as session (session.id)}
    <SettingEntry icon={MonitorSmartphone} title={deviceName(session.userAgent)}>
      <span class="truncate"
        >{#if session.token === current}<span class="font-semibold text-success">This browser</span
          >{' · '}{/if}{session.ipAddress || 'Unknown address'} · signed in {formatTimestamp(session.createdAt)}</span
      >
      {#snippet actions()}{#if session.token !== current}<Button
            size="small"
            loading={busy === session.token}
            disabled={Boolean(busy)}
            aria-label={`Sign out ${deviceName(session.userAgent)}`}
            onclick={() => revokeSession(session.token)}>Sign out</Button
          >{/if}{/snippet}
    </SettingEntry>
  {:else}
    <EmptyState compact icon={MonitorSmartphone} title="No active sessions" />
  {/each}
</SettingsGroup>

<ConfirmDialog
  open={confirmOthers}
  title="Sign out other sessions?"
  confirmLabel="Sign out {others} {others === 1 ? 'session' : 'sessions'}"
  busy={busy === 'others'}
  {error}
  onConfirm={revokeOthers}
  onClose={() => (confirmOthers = false)}
>
  Every other browser and device signed in to your account is signed out. This browser stays signed in.
</ConfirmDialog>
