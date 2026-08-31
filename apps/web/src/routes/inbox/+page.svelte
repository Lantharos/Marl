<script lang="ts">
  import { invalidateAll } from '$app/navigation';
  import CheckCheck from 'lucide-svelte/icons/check-check';
  import InboxList from '$lib/inbox/InboxList.svelte';
  import type { PageData } from './$types';
  import { api } from '$lib/api';

  let { data } = $props<{ data: PageData }>();

  async function markAllRead() {
    await api('/inbox/read', { method: 'POST' });
    await invalidateAll();
  }
</script>

<svelte:head><title>Inbox · Marl</title><meta name="description" content="Mentions, assignments, and updates that need you." /></svelte:head>

<main class="page">
  <header class="heading"><div><h1>Inbox</h1><p>Mentions, assignments, and updates from work you’re part of.</p></div>{#if data.counts.unread}<button onclick={markAllRead}><CheckCheck size={15} />Mark all read</button>{/if}</header>
  <nav class="filters" aria-label="Inbox filters"><a class:active={data.status === 'inbox'} href="/inbox">Inbox <span>{data.counts.inbox}</span></a><a class:active={data.status === 'unread'} href="/inbox?status=unread">Unread <span>{data.counts.unread}</span></a><a class:active={data.status === 'done'} href="/inbox?status=done">Done <span>{data.counts.done}</span></a></nav>
  <InboxList items={data.items} emptyTitle={data.status === 'done' ? 'Nothing finished yet.' : data.status === 'unread' ? 'Nothing new.' : 'All caught up.'} emptyDescription={data.status === 'done' ? 'Items you finish will stay available here.' : 'Mentions, assignments, and updates will appear here.'} onChange={invalidateAll} />
  {#if data.nextCursor}<a class="older" href="/inbox?status={data.status}&cursor={encodeURIComponent(data.nextCursor)}">Older items</a>{/if}
</main>

<style>
  .page{width:min(820px,calc(100% - 48px));margin:0 auto;padding:46px 0 76px}.heading{display:flex;align-items:flex-end;justify-content:space-between;gap:24px}.heading h1{margin:0;color:var(--text-strong);font-size:28px;font-weight:650;letter-spacing:-.04em}.heading p{margin:7px 0 0;color:var(--text-muted);font-size:11px}.heading button{display:inline-flex;height:32px;align-items:center;gap:6px;padding:0 10px;border:0;border-radius:7px;background:transparent;color:var(--text-muted);font:inherit;font-size:10px;cursor:pointer}.heading button:hover{background:var(--surface-hover);color:var(--text-strong)}.heading button:focus-visible{outline:2px solid var(--focus);outline-offset:2px}.filters{display:flex;gap:4px;margin:28px 0 12px}.filters a{display:inline-flex;height:31px;align-items:center;gap:6px;padding:0 10px;border-radius:7px;color:var(--text-muted);font-size:10px;font-weight:600;text-decoration:none}.filters a:hover{background:var(--surface-hover);color:var(--text-strong)}.filters a.active{background:var(--surface-muted);color:var(--text-strong)}.filters span{color:var(--text-faint);font-size:9px;font-variant-numeric:tabular-nums}.older{display:table;margin:18px auto 0;padding:7px 10px;border-radius:6px;color:var(--text-muted);font-size:10px;text-decoration:none}.older:hover{background:var(--surface-hover);color:var(--text-strong)}@media(max-width:560px){.page{width:calc(100% - 28px);padding-top:32px}.heading{align-items:flex-start}.heading button{width:32px;padding:0;justify-content:center;font-size:0}.filters{margin-top:22px}}
</style>
