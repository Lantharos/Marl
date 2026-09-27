<script lang="ts">
  import { page } from '$app/state';
  import { untrack } from 'svelte';
  import type { ReleaseSummary } from '@marl/contracts';
  import Download from '@lucide/svelte/icons/download';
  import Tag from '@lucide/svelte/icons/tag';
  import LinkButton from '$lib/components/controls/LinkButton.svelte';
  import EmptyState from '$lib/components/feedback/EmptyState.svelte';
  import InfiniteScroll from '$lib/components/feedback/InfiniteScroll.svelte';
  import PageHeader from '$lib/components/page/PageHeader.svelte';
  import Seo from '$lib/components/page/Seo.svelte';
  import Time from '$lib/components/page/Time.svelte';
  import { api, MarlApiError } from '$lib/api';
  import { releasePath } from '$lib/releases/release-path';
  import type { PageData } from './$types';

  let { data }: { data: PageData } = $props();
  const owner = $derived(page.params.owner ?? '');
  const repository = $derived(page.params.repo ?? '');
  let releases = $state.raw<ReleaseSummary[]>(untrack(() => data.releases));
  let nextCursor = $state<string | null>(untrack(() => data.nextCursor));
  let loading = $state(false);
  let error = $state('');
  let generation = 0;

  $effect(() => {
    releases = data.releases;
    nextCursor = data.nextCursor;
    loading = false;
    error = '';
    generation++;
  });

  async function loadMore() {
    if (!nextCursor || loading) return;
    const version = generation;
    loading = true;
    error = '';
    try {
      const result = await api<{ releases: ReleaseSummary[]; nextCursor: string | null }>(
        `/repositories/${owner}/${repository}/releases?limit=30&cursor=${encodeURIComponent(nextCursor)}`
      );
      if (version !== generation) return;
      const ids = new Set(releases.map((release) => release.id));
      releases = [...releases, ...result.releases.filter((release) => !ids.has(release.id))];
      nextCursor = result.nextCursor;
    } catch (cause) {
      if (version === generation)
        error = cause instanceof MarlApiError ? cause.message : 'More releases could not be loaded.';
    } finally {
      if (version === generation) loading = false;
    }
  }
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
{#if releases.length}
  <div class="surface p-1.5">
    {#each releases as release (release.id)}
      <article
        class="relative grid grid-cols-[32px_minmax(0,1fr)_auto] items-center gap-3 rounded-lg px-3 py-4 transition-colors hover:bg-surface-hover sm:gap-4"
      >
        <span
          class={[
            'grid size-8 place-items-center rounded-lg',
            release.latest ? 'bg-brand-soft text-brand' : 'bg-surface-muted text-ink-muted'
          ]}><Tag size={16} /></span
        >
        <div class="min-w-0">
          <div class="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
            <a
              class="min-w-0 truncate text-base font-semibold text-ink-strong after:absolute after:inset-0"
              href={releasePath(owner, repository, release.tagName)}>{release.name || release.tagName}</a
            >
            {#if release.latest}<span class="rounded-full bg-brand-soft px-2 py-0.5 text-2xs font-semibold text-brand"
                >Latest</span
              >{/if}
            {#if release.draft}<span
                class="rounded-full bg-surface-muted px-2 py-0.5 text-2xs font-semibold text-ink-muted">Draft</span
              >{:else if release.prerelease}<span
                class="rounded-full bg-warning-soft px-2 py-0.5 text-2xs font-semibold text-warning">Prerelease</span
              >{/if}
          </div>
          <p class="mt-1 flex flex-wrap items-center gap-x-1.5 text-xs text-ink-muted">
            <code class="font-mono">{release.tagName}</code><span aria-hidden="true">·</span><Time
              value={release.publishedAt ?? release.createdAt}
              class="text-ink-muted"
            />
          </p>
          {#if release.bodyText}<p class="mt-2 line-clamp-2 max-w-[80ch] text-sm text-ink">{release.bodyText}</p>{/if}
        </div>
        {#if release.assetCount}<LinkButton
            size="small"
            variant="ghost"
            class="relative z-1"
            href="{releasePath(owner, repository, release.tagName)}#downloads"
            ><Download size={14} /><span class="max-sm:hidden"
              >{release.assetCount} {release.assetCount === 1 ? 'file' : 'files'}</span
            ></LinkButton
          >{/if}
      </article>
    {/each}
  </div>
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
<InfiniteScroll cursor={nextCursor} {loading} {error} onload={loadMore} />
