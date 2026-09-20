<script lang="ts">
  import { untrack } from 'svelte';
  import MonitorSmartphone from 'lucide-svelte/icons/monitor-smartphone';
  import { authClient } from '$lib/auth-client';
  import Button from '$lib/components/Button.svelte';
  import { formatTimestamp } from '$lib/time';
  import type { PageData } from './$types';

  type Session = { id: string; token: string; userAgent?: string | null; ipAddress?: string | null; createdAt: Date | string };
  let { data } = $props<{ data: PageData }>();
  let busy = $state('');
  let error = $state('');
  let sessions = $state<Session[]>(untrack(() => [...data.sessions]));

  function deviceName(userAgent?: string | null) {
    if (!userAgent) return 'Unknown browser';
    const platform = /Windows/i.test(userAgent) ? 'Windows' : /iPhone/i.test(userAgent) ? 'iPhone' : /iPad/i.test(userAgent) ? 'iPad' : /Android/i.test(userAgent) ? 'Android' : /Mac OS X|Macintosh/i.test(userAgent) ? 'macOS' : /Linux/i.test(userAgent) ? 'Linux' : 'an unknown device';
    const browser = /Edg\//.test(userAgent) ? 'Edge' : /Firefox\//.test(userAgent) ? 'Firefox' : /Chrome\//.test(userAgent) ? 'Chrome' : /Safari\//.test(userAgent) ? 'Safari' : 'Browser';
    return `${browser} on ${platform}`;
  }

  async function revokeSession(token: string) {
    if (busy) return;
    busy = token; error = '';
    try {
      const result = await authClient.revokeSession({ token });
      if (result.error) error = result.error.message || 'This session could not be signed out.';
      else sessions = sessions.filter((session) => session.token !== token);
    } catch { error = 'This session could not be signed out.'; }
    finally { busy = ''; }
  }
</script>

<svelte:head><title>Sessions · Marl</title></svelte:head>
<header class="page-head"><h2>Sessions</h2><p>Browsers and devices currently signed in to your account.</p></header>
{#if error}<p class="error" role="alert">{error}</p>{/if}
<div class="session-list">{#each sessions as session (session.id)}<article><span class="device"><MonitorSmartphone size={16} /></span><div><strong>{deviceName(session.userAgent)}</strong><span>{session.ipAddress || 'Unknown address'} · signed in {formatTimestamp(session.createdAt)}</span></div><Button variant="secondary" size="small" loading={busy === session.token} disabled={Boolean(busy)} aria-label="Sign out this session" onclick={() => revokeSession(session.token)}>Sign out</Button></article>{:else}<p class="empty">No active sessions.</p>{/each}</div>

<style>
  .error{color:var(--danger);font-size:13px}
  .session-list{padding:6px 18px;border-radius:14px;background:var(--surface);box-shadow:var(--shadow-surface)}

  .page-head{padding-bottom:25px;}h2{margin:0;color:var(--text-strong);font-size:23px;letter-spacing:-.03em}.page-head p{margin:6px 0 0;color:var(--text-muted);font-size:11px;line-height:1.5}.session-list article{display:grid;grid-template-columns:36px minmax(0,1fr) auto;align-items:center;gap:16px;padding:22px 0;}.device{display:grid;width:34px;height:34px;place-items:center;border-radius:7px;background:var(--surface-muted);color:var(--text-muted)}.session-list strong{display:block;color:var(--text-strong);font-size:11px}.session-list div>span{display:block;margin-top:4px;color:var(--text-faint);font-size:11px}.empty{padding:30px 0;color:var(--text-faint);font-size:11px}
</style>
