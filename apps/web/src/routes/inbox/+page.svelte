<script lang="ts">
  import { invalidateAll } from '$app/navigation';
  import CheckCheck from '@lucide/svelte/icons/check-check';
  import Button from '$lib/components/controls/Button.svelte';
  import LinkButton from '$lib/components/controls/LinkButton.svelte';
  import PageHeader from '$lib/components/page/PageHeader.svelte';
  import TabLinks from '$lib/components/page/TabLinks.svelte';
  import InboxList from '$lib/inbox/InboxList.svelte';
  import type { PageData } from './$types';
  import { api } from '$lib/api';

  let { data }: { data: PageData } = $props();

  async function markAllRead() {
    await api('/inbox/read', { method: 'POST' });
    await invalidateAll();
  }
</script>

<svelte:head
  ><title>Inbox · Marl</title><meta
    name="description"
    content="Mentions, assignments, and updates that need you."
  /></svelte:head
>

<main class="mx-auto w-full max-w-240 px-4 pt-8 pb-20 sm:px-6 sm:pt-10">
  <PageHeader title="Inbox" description="Mentions, assignments, and updates from work you’re part of.">
    {#snippet action()}{#if data.counts.unread}<Button onclick={markAllRead}
          ><CheckCheck size={16} />Mark all read</Button
        >{/if}{/snippet}
  </PageHeader>
  <TabLinks
    label="Inbox filters"
    class="mb-4"
    items={[
      { href: '/inbox', label: 'Inbox', count: data.counts.inbox, active: data.status === 'inbox' },
      { href: '/inbox?status=unread', label: 'Unread', count: data.counts.unread, active: data.status === 'unread' },
      { href: '/inbox?status=done', label: 'Done', count: data.counts.done, active: data.status === 'done' }
    ]}
  />
  <InboxList
    items={data.items}
    emptyTitle={data.status === 'done'
      ? 'Nothing finished yet'
      : data.status === 'unread'
        ? 'Nothing new'
        : 'All caught up'}
    emptyDescription={data.status === 'done'
      ? 'Items you finish will stay available here.'
      : 'Mentions, assignments, and updates will appear here.'}
    onChange={invalidateAll}
  />
  {#if data.nextCursor}<div class="mt-4 flex justify-center">
      <LinkButton href="/inbox?status={data.status}&cursor={encodeURIComponent(data.nextCursor)}"
        >Older items</LinkButton
      >
    </div>{/if}
</main>
