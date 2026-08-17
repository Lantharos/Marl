<script lang="ts">
  import { untrack } from 'svelte';
  import MonitorSmartphone from 'lucide-svelte/icons/monitor-smartphone';
  import Trash2 from 'lucide-svelte/icons/trash-2';
  import { authClient } from '$lib/auth-client';
  import { formatTimestamp } from '$lib/time';
  import type { PageData } from './$types';

  type Session = { id: string; token: string; userAgent?: string | null; ipAddress?: string | null; createdAt: Date | string };
  let { data } = $props<{ data: PageData }>();
  let sessions = $state<Session[]>(untrack(() => [...data.sessions]));

  async function revokeSession(token: string) {
    const result = await authClient.revokeSession({ token });
    if (!result.error) sessions = sessions.filter((session) => session.token !== token);
  }
</script>

<svelte:head><title>Sessions · Sty</title></svelte:head>
<header class="page-head"><h2>Sessions</h2><p>Browsers and devices currently signed in to your account.</p></header>
<div class="session-list">{#each sessions as session}<article><span class="device"><MonitorSmartphone size={16} /></span><div><strong>{session.userAgent || 'Unknown device'}</strong><span>{session.ipAddress || 'Unknown address'} · signed in {formatTimestamp(session.createdAt)}</span></div><button aria-label="Sign out this session" onclick={() => revokeSession(session.token)}><Trash2 size={14} /></button></article>{:else}<p class="empty">No active sessions.</p>{/each}</div>

<style>
  .page-head{padding-bottom:25px;border-bottom:1px solid var(--border-subtle)}h2{margin:0;color:var(--text-strong);font-size:23px;letter-spacing:-.03em}.page-head p{margin:6px 0 0;color:var(--text-muted);font-size:10px;line-height:1.5}.session-list article{display:grid;grid-template-columns:36px minmax(0,1fr) 34px;align-items:center;gap:12px;padding:16px 0;border-bottom:1px solid var(--border-subtle)}.device{display:grid;width:34px;height:34px;place-items:center;border-radius:7px;background:var(--surface-muted);color:var(--text-muted)}.session-list strong,.session-list span{display:block}.session-list strong{color:var(--text-strong);font-size:11px}.session-list div>span{margin-top:4px;color:var(--text-faint);font-size:9px}.session-list button{display:grid;width:32px;height:32px;place-items:center;border:1px solid var(--border);border-radius:6px;background:var(--surface);color:var(--danger);cursor:pointer}.session-list button:hover{background:var(--danger-soft)}.empty{padding:30px 0;color:var(--text-faint);font-size:10px}
</style>
