<script lang="ts">
  import CheckCheck from '@lucide/svelte/icons/check-check';
  import Button from '#lib/components/controls/Button.svelte';
  import InfiniteScroll from '#lib/components/feedback/InfiniteScroll.svelte';
  import Notice from '#lib/components/feedback/Notice.svelte';
  import PageHeader from '#lib/components/page/PageHeader.svelte';
  import TabLinks from '#lib/components/page/TabLinks.svelte';
  import InboxList from '#lib/inbox/InboxList.svelte';
  import { InboxState } from '#lib/inbox/inbox-state.svelte.js';
  import type { PageData } from './$types';

  let { data }: { data: PageData } = $props();
  const inbox = new InboxState(() => data);
</script>

<svelte:head
  ><title>Inbox · Marl</title><meta
    name="description"
    content="Mentions, assignments, and updates that need you."
  /></svelte:head
>

<main class="mx-auto w-full max-w-240 px-4 pt-8 pb-20 sm:px-6 sm:pt-10">
  <PageHeader title="Inbox" description="Mentions, assignments, and updates from work you’re part of.">
    {#snippet action()}{#if inbox.counts.unread}<Button onclick={inbox.markAllRead}
          ><CheckCheck size={16} />Mark all read</Button
        >{/if}{/snippet}
  </PageHeader>
  <TabLinks
    label="Inbox filters"
    class="mb-4"
    items={[
      { href: '/inbox', label: 'Inbox', count: inbox.counts.inbox, active: data.status === 'inbox' },
      { href: '/inbox?status=unread', label: 'Unread', count: inbox.counts.unread, active: data.status === 'unread' },
      { href: '/inbox?status=done', label: 'Done', count: inbox.counts.done, active: data.status === 'done' }
    ]}
  />
  {#if inbox.error}<Notice class="mb-4">{inbox.error}</Notice>{/if}
  <InboxList
    items={inbox.list.items}
    emptyTitle={data.status === 'done'
      ? 'Nothing finished yet'
      : data.status === 'unread'
        ? 'Nothing new'
        : 'All caught up'}
    emptyDescription={data.status === 'done'
      ? 'Items you finish will stay available here.'
      : 'Mentions, assignments, and updates will appear here.'}
    onOpen={inbox.open}
    onToggleDone={inbox.toggleDone}
  />
  <InfiniteScroll list={inbox.list} />
</main>
