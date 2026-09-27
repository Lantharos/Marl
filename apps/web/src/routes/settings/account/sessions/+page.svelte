<script lang="ts">
  import { untrack } from 'svelte';
  import type { AccountSession } from '@marl/contracts';
  import MonitorSmartphone from '@lucide/svelte/icons/monitor-smartphone';
  import { authClient } from '$lib/auth-client';
  import Button from '$lib/components/controls/Button.svelte';
  import EmptyState from '$lib/components/feedback/EmptyState.svelte';
  import Notice from '$lib/components/feedback/Notice.svelte';
  import SettingsHeader from '$lib/components/settings/SettingsHeader.svelte';
  import { formatTimestamp } from '$lib/time';
  import type { PageData } from './$types';

  let { data }: { data: PageData } = $props();
  let busy = $state('');
  let error = $state('');
  let sessions = $state<AccountSession[]>(untrack(() => [...data.sessions]));

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
<SettingsHeader title="Sessions" description="Browsers and devices currently signed in to your account." />
{#if error}<Notice class="mb-4">{error}</Notice>{/if}
<div class="divide-y divide-line-subtle surface px-4 sm:px-5">
  {#each sessions as session (session.id)}
    <article class="grid min-h-19 grid-cols-[24px_minmax(0,1fr)_auto] items-center gap-3">
      <MonitorSmartphone size={18} class="text-ink-muted" />
      <div class="min-w-0">
        <strong class="block truncate text-base font-semibold text-ink-strong">{deviceName(session.userAgent)}</strong>
        <span class="mt-0.5 block truncate text-sm text-ink-muted"
          >{session.ipAddress || 'Unknown address'} · signed in {formatTimestamp(session.createdAt)}</span
        >
      </div>
      <Button
        size="small"
        loading={busy === session.token}
        disabled={Boolean(busy)}
        aria-label={`Sign out ${deviceName(session.userAgent)}`}
        onclick={() => revokeSession(session.token)}>Sign out</Button
      >
    </article>
  {:else}
    <EmptyState compact icon={MonitorSmartphone} title="No active sessions" />
  {/each}
</div>
