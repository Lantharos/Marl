<script lang="ts">
  import { page } from '$app/stores';
  import { untrack } from 'svelte';
  import type { ReleaseSummary } from '@marl/contracts';
  import Box from 'lucide-svelte/icons/box';
  import Download from 'lucide-svelte/icons/download';
  import Tag from 'lucide-svelte/icons/tag';
  import Button from '$lib/components/Button.svelte';
  import PageHeader from '$lib/components/PageHeader.svelte';
  import Seo from '$lib/components/Seo.svelte';
  import Time from '$lib/components/Time.svelte';
  import UserProfileLink from '$lib/components/UserProfileLink.svelte';
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

  $effect(() => { releases = data.releases; nextCursor = data.nextCursor; loading = false; error = ''; });

  async function loadMore() {
    if (!nextCursor || loading) return;
    loading = true;
    error = '';
    try {
      const result = await api<{ releases: ReleaseSummary[]; nextCursor: string | null }>(`/repositories/${owner}/${repository}/releases?cursor=${encodeURIComponent(nextCursor)}`);
      const ids = new Set(releases.map((release) => release.id));
      releases = [...releases, ...result.releases.filter((release) => !ids.has(release.id))];
      nextCursor = result.nextCursor;
    } catch (cause) {
      error = cause instanceof MarlApiError ? cause.message : 'More releases could not be loaded.';
    } finally {
      loading = false;
    }
  }
</script>

<Seo title={`Releases · ${owner}/${repository} · Marl`} description={`Browse releases, release notes, source archives, and downloadable files for ${owner}/${repository} on Marl.`} path={$page.url.pathname} robots={data.repository.visibility === 'public' ? 'index, follow' : 'noindex, nofollow'} />
<main class="page">
  <PageHeader title="Releases" actionHref={data.canCreate ? `/${owner}/${repository}/releases/new` : undefined} actionLabel={data.canCreate ? 'New release' : undefined} />
  <div class="list">
    {#each releases as release (release.id)}<article>
      <div class="marker"><Tag size={16} /></div>
      <div class="content"><div class="title"><a href={releasePath(owner, repository, release.tagName)}>{release.name || release.tagName}</a>{#if release.latest}<span class="latest">Latest</span>{/if}{#if release.draft}<span>Draft</span>{:else if release.prerelease}<span>Prerelease</span>{/if}</div><div class="meta"><code>{release.tagName}</code><span>at</span><a href="/{owner}/{repository}/commit/{release.targetCommitId}">{release.targetCommitId.slice(0, 8)}</a><span>·</span><UserProfileLink handle={release.author} displayName={release.authorDisplayName} avatarUrl={release.authorAvatarUrl} size={18} /><span>published</span><Time value={release.publishedAt ?? release.createdAt} /></div>{#if release.body}<p>{release.body.replace(/[#_*`>\[\]]/g, '').slice(0, 220)}</p>{/if}<div class="foot"><Box size={13} />{release.assetCount} {release.assetCount === 1 ? 'asset' : 'assets'}<span>·</span><Download size={13} />Source archives included</div></div>
    </article>{:else}<div class="empty"><Tag size={25} /><strong>No releases yet</strong><p>Publish a tagged version when this repository is ready to ship.</p>{#if data.canCreate}<a href="/{owner}/{repository}/releases/new">Create the first release</a>{/if}</div>{/each}
  </div>
  {#if error}<p class="error" role="alert">{error}</p>{/if}
  {#if nextCursor}<Button class="more" loading={loading} onclick={loadMore}>Load more</Button>{/if}
</main>

<style>
  .page{width:100%;margin:0}.list{display:grid;gap:12px}article{display:grid;grid-template-columns:34px minmax(0,1fr);gap:12px;padding:22px;border-radius:12px;background:var(--surface);transition:background-color 120ms ease}article:hover{background:var(--surface-hover)}.marker{display:grid;width:30px;height:30px;border-radius:50%;background:var(--brand-soft);color:var(--brand);place-items:center}.title{display:flex;align-items:center;gap:7px;flex-wrap:wrap}.title>a{color:var(--text-strong);font-size:18px;font-weight:650;text-decoration:none}.title>a:hover{color:var(--brand)}.title span{color:var(--text-faint);font-size:11px;font-weight:650}.title .latest{color:var(--brand)}.meta{display:flex;align-items:center;gap:5px;margin-top:6px;color:var(--text-faint);font-size:11px;flex-wrap:wrap}.meta code,.meta>a{color:var(--text-muted);text-decoration:none}.content>p{max-width:720px;margin:11px 0 0;color:var(--text-muted);font-size:13px;line-height:1.65}.foot{display:flex;flex-wrap:wrap;align-items:center;gap:5px;margin-top:12px;color:var(--text-faint);font-size:11px}.empty{padding:52px 20px;text-align:center;color:var(--text-faint)}.empty strong{display:block;margin-top:12px;color:var(--text-strong);font-size:13px}.empty p{margin:6px 0 13px;font-size:11px}.empty a{color:var(--brand);font-size:11px;text-decoration:none}.error{color:var(--danger);font-size:11px;text-align:center}.page :global(.more.button){display:flex;margin:18px auto 0}@media(max-width:620px){article{grid-template-columns:28px 1fr;padding:18px 14px}.marker{width:26px;height:26px}}
</style>
