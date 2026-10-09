<script lang="ts">
  import { page } from '$app/state';
  import type { ReleaseSummary } from '@marl/contracts';
  import Tag from '@lucide/svelte/icons/tag';
  import List from '#lib/components/list/List.svelte';
  import LinkButton from '#lib/components/controls/LinkButton.svelte';
  import EmptyState from '#lib/components/feedback/EmptyState.svelte';
  import InfiniteScroll from '#lib/components/feedback/InfiniteScroll.svelte';
  import PageHeader from '#lib/components/page/PageHeader.svelte';
  import Seo from '#lib/components/page/Seo.svelte';
  import { api } from '#lib/api.js';
  import ReleaseRow from '#lib/releases/list/ReleaseRow.svelte';
  import { CursorList } from '#lib/ui/cursor-list.svelte.js';
  import type { PageProps } from './$types';

  let { data, params }: PageProps = $props();
  const owner = $derived(params.owner);
  const repository = $derived(params.repo);
  const releases = new CursorList(
    () => ({ items: data.releases, nextCursor: data.nextCursor }),
    async (cursor) => {
      const result = await api<{ releases: ReleaseSummary[]; nextCursor: string | null }>(
        `/repositories/${owner}/${repository}/releases?limit=30&cursor=${encodeURIComponent(cursor)}`
      );
      return { items: result.releases, nextCursor: result.nextCursor };
    },
    'More releases could not be loaded.'
  );
</script>

<Seo
  title={`Releases · ${owner}/${repository} · Marl`}
  description={`Browse releases, release notes, source archives, and downloadable files for ${owner}/${repository} on Marl.`}
  path={page.url.pathname}
  robots={data.repository.visibility === 'public' ? 'index, follow' : 'noindex, nofollow'}
/>
<PageHeader
  title="Releases"
  actionHref={data.canCreate ? `/${owner}/${repository}/releases/new` : undefined}
  actionLabel={data.canCreate ? 'New release' : undefined}
/>
{#if releases.items.length}
  <List>
    {#each releases.items as release, index (release.id)}
      <ReleaseRow
        {release}
        {owner}
        {repository}
        first={index === 0}
        last={index === releases.items.length - 1 && !releases.nextCursor}
      />
    {/each}
  </List>
{:else}
  <div class="surface">
    <EmptyState
      icon={Tag}
      title="No releases yet"
      description="Publish a tagged version when this repository is ready to ship."
    >
      {#if data.canCreate}<LinkButton size="small" variant="primary" href="/{owner}/{repository}/releases/new"
          >Create the first release</LinkButton
        >{/if}
    </EmptyState>
  </div>
{/if}
<InfiniteScroll list={releases} />
