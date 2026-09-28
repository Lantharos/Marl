<script lang="ts">
  import { page } from '$app/state';
  import ListOrdered from '@lucide/svelte/icons/list-ordered';
  import EmptyState from '$lib/components/feedback/EmptyState.svelte';
  import UserProfileLink from '$lib/components/identity/UserProfileLink.svelte';
  import PageHeader from '$lib/components/page/PageHeader.svelte';
  import Seo from '$lib/components/page/Seo.svelte';
  import Time from '$lib/components/page/Time.svelte';
  import type { PageData } from './$types';

  let { data }: { data: PageData } = $props();
  const owner = $derived(page.params.owner ?? '');
  const repo = $derived(page.params.repo ?? '');
  const states = { queued: 'Waiting', testing: 'Testing', merging: 'Merging' };
</script>

<Seo
  title={`Merge queue · ${owner}/${repo} · Marl`}
  description={`Pulls waiting to merge into ${data.branch}.`}
  path={page.url.pathname}
  robots="noindex, nofollow"
/>
<PageHeader
  title="Merge queue"
  description={`Pulls merge into ${data.branch} one at a time, in the order they were queued.`}
/>
{#if data.entries.length}
  <ol class="divide-y divide-line-subtle overflow-hidden surface">
    {#each data.entries as entry (entry.number)}
      <li class="flex items-center gap-4 px-4 py-3 sm:px-5">
        <span class="w-6 shrink-0 text-right text-sm font-semibold text-ink-muted tabular-nums">{entry.position}</span>
        <div class="min-w-0 flex-1">
          <a
            class="block truncate font-semibold text-ink-strong hover:text-brand"
            href="/{owner}/{repo}/pulls/{entry.number}">{entry.title}</a
          >
          <p class="mt-0.5 flex flex-wrap items-center gap-x-1.5 text-xs text-ink-muted">
            <span>!{entry.number} by</span>
            <UserProfileLink
              handle={entry.author}
              displayName={entry.authorDisplayName}
              avatar={false}
              class="text-xs"
            />
            <span>· queued by @{entry.enqueuedBy}</span>
            <Time value={entry.enqueuedAt} />
          </p>
        </div>
        <span class={['shrink-0 text-sm font-medium', entry.state === 'queued' ? 'text-ink-muted' : 'text-merged']}
          >{states[entry.state]}</span
        >
      </li>
    {/each}
  </ol>
{:else}
  <div class="surface">
    <EmptyState
      icon={ListOrdered}
      title="The queue is empty"
      description={`No pulls are waiting to merge into ${data.branch}.`}
    />
  </div>
{/if}
