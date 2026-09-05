<script lang="ts">
  import { page } from '$app/stores';
  import { untrack } from 'svelte';
  import Download from 'lucide-svelte/icons/download';
  import FileArchive from 'lucide-svelte/icons/file-archive';
  import GitCommitHorizontal from 'lucide-svelte/icons/git-commit-horizontal';
  import Pencil from 'lucide-svelte/icons/pencil';
  import Tag from 'lucide-svelte/icons/tag';
  import LinkButton from '$lib/components/LinkButton.svelte';
  import MarkdownBody from '$lib/components/MarkdownBody.svelte';
  import Seo from '$lib/components/Seo.svelte';
  import Time from '$lib/components/Time.svelte';
  import UserProfileLink from '$lib/components/UserProfileLink.svelte';
  import ReleaseAssets from '$lib/releases/ReleaseAssets.svelte';
  import { seoExcerpt } from '$lib/seo';
  import type { PageData } from './$types';

  let { data } = $props<{ data: PageData }>();
  const owner = $derived($page.params.owner ?? '');
  const repository = $derived($page.params.repo ?? '');
  let assets = $state(untrack(() => data.release.assets));
  const release = $derived(data.release);
  const title = $derived(release.name || release.tagName);
</script>

<Seo title={`${title} · ${owner}/${repository} · Marl`} description={seoExcerpt(release.body, `${title} is a release of ${owner}/${repository}, hosted on Marl.`)} path={$page.url.pathname} robots={data.repository.visibility === 'public' ? 'index, follow' : 'noindex, nofollow'} />
<main class="page">
  <header><div class="heading"><div class="tag-icon"><Tag size={19} /></div><div><div class="status">{#if release.latest}<span class="latest">Latest release</span>{/if}{#if release.draft}<span>Draft</span>{:else if release.prerelease}<span>Prerelease</span>{/if}</div><h1>{title}</h1><div class="meta"><code>{release.tagName}</code><span>·</span><GitCommitHorizontal size={13} /><a href="/{owner}/{repository}/commit/{release.targetCommitId}">{release.targetCommitId.slice(0, 8)}</a><span>·</span><UserProfileLink handle={release.author} displayName={release.authorDisplayName} avatarUrl={release.authorAvatarUrl} size={19} /><span>published</span><Time value={release.publishedAt ?? release.createdAt} /></div></div></div>{#if release.canEdit}<LinkButton href="/{owner}/{repository}/releases/edit/{release.id}"><Pencil size={13} />Edit</LinkButton>{/if}</header>
  <section class="notes">{#if release.body}<MarkdownBody source={release.body} context={{ owner, repository }} />{:else}<p>No release notes provided.</p>{/if}</section>
  <ReleaseAssets {owner} {repository} releaseId={release.id} bind:assets />
  <section class="source"><header><div><h2>Source code</h2><p>Archives are generated from the tagged commit.</p></div><FileArchive size={18} /></header><div><a href="/api/v1/repositories/{owner}/{repository}/releases/{release.id}/archive/zip"><Download size={14} /><span><strong>Source code</strong><small>ZIP archive</small></span></a><a href="/api/v1/repositories/{owner}/{repository}/releases/{release.id}/archive/tar.gz"><Download size={14} /><span><strong>Source code</strong><small>tar.gz archive</small></span></a></div></section>
  <a class="back" href="/{owner}/{repository}/releases">All releases</a>
</main>

<style>
  .page{width:min(920px,100%);margin:0 auto}.page>header{display:flex;align-items:flex-start;justify-content:space-between;gap:20px;padding-bottom:26px;border-bottom:1px solid var(--border-subtle)}.heading{display:flex;min-width:0;gap:13px}.tag-icon{display:grid;width:38px;height:38px;flex:0 0 auto;border-radius:50%;background:var(--brand-soft);color:var(--brand);place-items:center}.status{display:flex;gap:7px;min-height:14px}.status span{color:var(--text-faint);font-size:11px;font-weight:650}.status .latest{color:var(--brand)}h1{margin:3px 0 0;color:var(--text-strong);font-size:27px;letter-spacing:-.035em}.meta{display:flex;align-items:center;gap:5px;margin-top:8px;color:var(--text-faint);font-size:11px;flex-wrap:wrap}.meta code,.meta>a{color:var(--text-muted);text-decoration:none}.notes{min-height:120px;padding:28px 0}.notes>p{color:var(--text-faint);font-size:11px}.source{margin-top:25px;padding-top:24px;border-top:1px solid var(--border-subtle)}.source>header{display:flex;align-items:flex-start;justify-content:space-between;color:var(--text-faint)}h2{margin:0;color:var(--text-strong);font-size:16px}.source header p{margin:5px 0 0;font-size:11px}.source>div{display:grid;margin-top:15px;border-top:1px solid var(--border-subtle)}.source>div>a{display:flex;min-height:54px;align-items:center;gap:10px;border-bottom:1px solid var(--border-subtle);color:var(--text-muted);text-decoration:none}.source>div>a:hover{color:var(--brand)}.source a span{display:block}.source strong,.source small{display:block}.source strong{color:var(--text-strong);font-size:11px}.source small{margin-top:3px;color:var(--text-faint);font-size:11px}.back{display:inline-block;margin-top:24px;color:var(--text-muted);font-size:11px;text-decoration:none}.back:hover{color:var(--brand)}@media(max-width:620px){.page>header{flex-wrap:wrap}.tag-icon{width:32px;height:32px}h1{font-size:23px}}
</style>
