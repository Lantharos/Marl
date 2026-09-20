<script lang="ts">
  import { page } from '$app/stores';
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
  const release = $derived(data.release);
  const title = $derived(release.name || release.tagName);
</script>

<Seo title={`${title} · ${owner}/${repository} · Marl`} description={seoExcerpt(release.body, `${title} is a release of ${owner}/${repository}, hosted on Marl.`)} path={$page.url.pathname} robots={data.repository.visibility === 'public' ? 'index, follow' : 'noindex, nofollow'} />
<main class="page">
  <a class="back" href="/{owner}/{repository}/releases">← All releases</a>
  <header><div class="heading"><div class="tag-icon"><Tag size={19} /></div><div><h1>{title}</h1><div class="status">{#if release.latest}<span class="latest">Latest</span>{/if}{#if release.draft}<span>Draft</span>{:else if release.prerelease}<span>Prerelease</span>{/if}</div><div class="meta"><code>{release.tagName}</code><span>·</span><GitCommitHorizontal size={13} /><a href="/{owner}/{repository}/commit/{release.targetCommitId}">{release.targetCommitId.slice(0, 8)}</a><span>·</span><UserProfileLink handle={release.author} displayName={release.authorDisplayName} avatarUrl={release.authorAvatarUrl} size={19} /><span>{release.draft ? 'created' : 'published'}</span><Time value={release.publishedAt ?? release.createdAt} /></div></div></div>{#if release.canEdit}<LinkButton href="/{owner}/{repository}/releases/edit/{release.id}"><Pencil size={13} />Edit</LinkButton>{/if}</header>
  <div class="release-workspace"><aside>
  {#key release.id}<ReleaseAssets {owner} {repository} releaseId={release.id} assets={release.assets} />{/key}
  <section class="source"><header><div><h2>Source code</h2><p>Archives are generated from the tagged commit.</p></div><FileArchive size={18} /></header><div><a href="/api/v1/repositories/{owner}/{repository}/releases/{release.id}/archive/zip"><Download size={14} /><span><strong>Source code</strong><small>ZIP archive</small></span></a><a href="/api/v1/repositories/{owner}/{repository}/releases/{release.id}/archive/tar.gz"><Download size={14} /><span><strong>Source code</strong><small>tar.gz archive</small></span></a></div></section>
  </aside>  <section class="notes"><h2>Release notes</h2>{#if release.body}<MarkdownBody source={release.body} context={{ owner, repository }} />{:else}<p>No release notes provided.</p>{/if}</section>
</div>
</main>

<style>
 .page>header{align-items:flex-start}
 .page{width:min(1200px,100%);margin:0 auto}.back{display:inline-flex;margin-bottom:24px;color:var(--text-muted);font-size:13px;text-decoration:none}.back:hover{color:var(--brand)}.page>header{display:flex;justify-content:space-between;gap:24px;margin-bottom:32px}.heading{display:flex;gap:14px;min-width:0}.tag-icon{display:grid;place-items:center;width:42px;height:42px;flex:none;border-radius:12px;background:var(--surface);color:var(--brand)}h1{margin:5px 0 0;color:var(--text-strong);font-size:32px;line-height:1.2;letter-spacing:-.04em;overflow-wrap:anywhere}.status{display:flex;gap:8px;margin-top:10px;color:var(--text-muted);font-size:12px}.status:empty{display:none}.latest{color:var(--brand)}.meta{display:flex;flex-wrap:wrap;align-items:center;gap:7px;margin-top:12px;color:var(--text-muted);font-size:12px}.meta a{color:inherit;text-decoration:none}.release-workspace{display:grid;grid-template-columns:minmax(0,1fr) 340px;align-items:start;gap:28px}.release-workspace>aside{grid-column:2;grid-row:1;min-width:0;display:grid;gap:20px}.notes{grid-column:1;grid-row:1;min-width:0;padding:28px;border-radius:16px;background:var(--surface);box-shadow:var(--shadow-surface)}h2{margin:0 0 20px;color:var(--text-strong);font-size:15px}.notes>p{color:var(--text-muted);font-size:14px}.source{padding:20px;border-radius:14px;background:var(--surface)}.source>header{display:flex;justify-content:space-between;color:var(--text-muted)}.source h2{margin:0;font-size:14px}.source header p{margin:6px 0 14px;color:var(--text-muted);font-size:12px;line-height:1.6}.source>div{display:flex;gap:8px}.source a{display:flex;align-items:center;gap:8px;padding:10px 12px;border-radius:9px;background:var(--surface-muted);color:var(--text);text-decoration:none}.source a:hover{background:var(--surface-hover)}.source strong{display:none}.source small{font-size:12px}@media(max-width:850px){.release-workspace{grid-template-columns:1fr}.release-workspace>aside,.notes{grid-column:1;grid-row:auto}.notes{padding:22px}.page>header{flex-wrap:wrap}h1{font-size:27px}}
</style>
