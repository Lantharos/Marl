<script lang="ts">
  import { page } from '$app/state';
  import GitBranch from '@lucide/svelte/icons/git-branch';
  import GitCommitHorizontal from '@lucide/svelte/icons/git-commit-horizontal';
  import Pencil from '@lucide/svelte/icons/pencil';
  import Tag from '@lucide/svelte/icons/tag';
  import LinkButton from '#lib/components/controls/LinkButton.svelte';
  import UserProfileLink from '#lib/components/identity/UserProfileLink.svelte';
  import MarkdownBody from '#lib/components/markdown/MarkdownBody.svelte';
  import BackLink from '#lib/components/page/BackLink.svelte';
  import Seo from '#lib/components/page/Seo.svelte';
  import Time from '#lib/components/page/Time.svelte';
  import ReleaseDownloads from '#lib/releases/detail/ReleaseDownloads.svelte';
  import { releaseState, releaseStateLabels, releaseStateTones } from '#lib/releases/release-state.js';
  import { seoExcerpt } from '#lib/seo.js';
  import type { PageProps } from './$types';

  let { data, params }: PageProps = $props();
  const owner = $derived(params.owner);
  const repository = $derived(params.repo);
  const release = $derived(data.release);
  const title = $derived(release.name || release.tagName);
  const state = $derived(releaseState(release));
</script>

<Seo
  title={`${title} · ${owner}/${repository} · Marl`}
  description={seoExcerpt(release.bodyText, `${title} is a release of ${owner}/${repository}, hosted on Marl.`)}
  path={page.url.pathname}
  robots={data.repository.visibility === 'public' ? 'index, follow' : 'noindex, nofollow'}
/>

<BackLink href="/{owner}/{repository}/releases" label="Releases" />
<header class="mt-5 mb-8 flex flex-wrap items-start justify-between gap-x-6 gap-y-4">
  <div class="min-w-0 flex-[1_1_320px]">
    <h1 class="text-2xl font-semibold tracking-tight wrap-anywhere text-ink-strong sm:text-3xl">{title}</h1>
    <p class="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-sm text-ink-muted">
      {#if state !== 'stable'}<span class={['font-semibold', releaseStateTones[state]]}
          >{releaseStateLabels[state]}</span
        >{/if}
      <span class="inline-flex items-center gap-1.5 font-mono text-xs text-ink"
        ><Tag size={14} class="text-ink-muted" />{release.tagName}</span
      >
      {#if release.targetBranch}<span class="inline-flex items-center gap-1.5 font-mono text-xs text-ink"
          ><GitBranch size={14} class="text-ink-muted" />{release.targetBranch}</span
        >{/if}
      <a
        class="inline-flex items-center gap-1.5 font-mono text-xs text-ink hover:text-brand"
        href="/{owner}/{repository}/commit/{release.targetCommitId}"
        ><GitCommitHorizontal size={14} class="text-ink-muted" />{release.targetCommitId.slice(0, 7)}</a
      >
      <span class="inline-flex items-center gap-1.5"
        ><UserProfileLink
          handle={release.author}
          displayName={release.authorDisplayName}
          avatarUrl={release.authorAvatarUrl}
          size={18}
        />
        {release.draft ? 'drafted' : 'published'}
        <Time value={release.publishedAt ?? release.createdAt} class="text-sm text-ink-muted" /></span
      >
    </p>
  </div>
  {#if release.canEdit}<LinkButton size="small" href="/{owner}/{repository}/releases/edit/{release.id}"
      ><Pencil size={13} />Edit</LinkButton
    >{/if}
</header>

<div class="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_340px] lg:gap-8">
  <section class="min-w-0 surface px-5 py-6 sm:px-8 sm:py-8" aria-label="Release notes">
    {#if release.body}<div class="max-w-[76ch]"><MarkdownBody html={release.bodyHtml} variant="document" /></div>
    {:else}<p class="text-sm text-ink-muted">No release notes were written for this version.</p>{/if}
  </section>
  <aside class="order-first min-w-0 lg:sticky lg:top-20 lg:order-none">
    {#key release.id}<ReleaseDownloads
        assets={release.assets}
        archiveBase="/api/v1/repositories/{owner}/{repository}/releases/{release.id}/archive"
        commit={release.targetCommitId}
      />{/key}
  </aside>
</div>
