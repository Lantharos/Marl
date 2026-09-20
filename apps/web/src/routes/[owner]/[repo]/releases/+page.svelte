<script lang="ts">
  import { page } from '$app/stores';
  import { untrack } from 'svelte';
  import type { ReleaseSummary } from '@marl/contracts';
  import Download from 'lucide-svelte/icons/download';
  import Tag from 'lucide-svelte/icons/tag';
  import InfiniteScroll from '$lib/components/InfiniteScroll.svelte';
  import PageHeader from '$lib/components/PageHeader.svelte';
  import Seo from '$lib/components/Seo.svelte';
  import Time from '$lib/components/Time.svelte';
  import { api, MarlApiError } from '$lib/api';
  import { releasePath } from '$lib/releases/release-path';
  import type { PageData } from './$types';

  let { data } = $props<{ data: PageData }>();
  const owner = $derived($page.params.owner ?? '');
  const repository = $derived($page.params.repo ?? '');
  let releases = $state.raw<ReleaseSummary[]>(untrack(() => data.releases));
  let nextCursor = $state<string | null>(untrack(() => data.nextCursor));
  let loading = $state(false);
  let error = $state('');
  let generation = 0;

  $effect(() => { releases = data.releases; nextCursor = data.nextCursor; loading = false; error = ''; generation++; });

  async function loadMore() {
    if (!nextCursor || loading) return;
    const version = generation;
    loading = true;
    error = '';
    try {
      const result = await api<{ releases: ReleaseSummary[]; nextCursor: string | null }>(`/repositories/${owner}/${repository}/releases?limit=30&cursor=${encodeURIComponent(nextCursor)}`);
      if (version !== generation) return;
      const ids = new Set(releases.map((release) => release.id));
      releases = [...releases, ...result.releases.filter((release) => !ids.has(release.id))];
      nextCursor = result.nextCursor;
    } catch (cause) {
      if (version === generation) error = cause instanceof MarlApiError ? cause.message : 'More releases could not be loaded.';
    } finally {
      if (version === generation) loading = false;
    }
  }
</script>

<Seo title={`Releases · ${owner}/${repository} · Marl`} description={`Browse releases, release notes, source archives, and downloadable files for ${owner}/${repository} on Marl.`} path={$page.url.pathname} robots={data.repository.visibility === 'public' ? 'index, follow' : 'noindex, nofollow'} />
<main class="page">
  <PageHeader title="Releases" actionHref={data.canCreate ? `/${owner}/${repository}/releases/new` : undefined} actionLabel={data.canCreate ? 'New release' : undefined} />
  <div class="list">
    {#each releases as release (release.id)}<article>
      <div class="marker"><Tag size={16} /></div>
      <div class="content"><div class="title"><a href={releasePath(owner, repository, release.tagName)}>{release.name || release.tagName}</a>{#if release.latest}<span class="latest">Latest</span>{/if}{#if release.draft}<span>Draft</span>{:else if release.prerelease}<span>Prerelease</span>{/if}</div><div class="meta"><code>{release.tagName}</code><span>·</span><Time value={release.publishedAt ?? release.createdAt} /></div>{#if release.body}<p>{release.body.replace(/[#_*`>\[\]]/g, '').slice(0, 160)}</p>{/if}</div>
      <a class="downloads" href={releasePath(owner, repository, release.tagName) + '#downloads'}><Download size={15} /><span>{release.assetCount ? 'Downloads' : 'View release'}</span></a>
    </article>{:else}<div class="empty"><Tag size={25} /><strong>No releases yet</strong><p>Publish a tagged version when this repository is ready to ship.</p>{#if data.canCreate}<a href="/{owner}/{repository}/releases/new">Create the first release</a>{/if}</div>{/each}
  </div>
  <InfiniteScroll cursor={nextCursor} {loading} {error} onload={loadMore} />
</main>

<style>
 .page{width:100%;margin:0}.list{display:grid;gap:8px;padding:6px;border-radius:16px;background:var(--surface)}article{display:grid;grid-template-columns:32px minmax(0,1fr) auto;align-items:center;gap:16px;padding:22px 18px;border-radius:10px}.marker{display:grid;place-items:center;color:var(--brand)}.content{min-width:0}.title{display:flex;flex-wrap:wrap;align-items:center;gap:10px}.title>a{color:var(--text-strong);font-size:18px;font-weight:640;text-decoration:none;overflow-wrap:anywhere}.title>a:hover{color:var(--brand)}.title span{color:var(--text-muted);font-size:12px}.title .latest{color:var(--brand)}.meta{display:flex;align-items:center;gap:7px;margin-top:8px;color:var(--text-muted);font-size:12px}.content>p{max-width:64ch;display:-webkit-box;-webkit-box-orient:vertical;-webkit-line-clamp:2;overflow:hidden;margin:12px 0 0;font-size:13px;line-height:1.6;color:var(--text-muted)}.downloads{display:inline-flex;align-items:center;gap:8px;padding:10px 13px;border-radius:9px;background:var(--surface-muted);color:var(--text);font-size:12px;text-decoration:none}.downloads:hover{background:var(--surface-hover);color:var(--brand)}.empty{padding:56px 24px;text-align:center;color:var(--text-muted)}.empty strong{display:block;margin-top:14px;color:var(--text-strong);font-size:16px}.empty p{font-size:13px}.empty a{color:var(--brand);font-size:13px}@media(max-width:620px){article{grid-template-columns:24px minmax(0,1fr);padding:18px 12px;gap:12px}.downloads{grid-column:2;justify-self:start}.title>a{font-size:16px}}
</style>
