<script lang="ts">
  import { page } from '$app/state';
  import Download from '@lucide/svelte/icons/download';
  import GitCommitHorizontal from '@lucide/svelte/icons/git-commit-horizontal';
  import Pencil from '@lucide/svelte/icons/pencil';
  import Tag from '@lucide/svelte/icons/tag';
  import LinkButton from '$lib/components/controls/LinkButton.svelte';
  import UserProfileLink from '$lib/components/identity/UserProfileLink.svelte';
  import MarkdownBody from '$lib/components/markdown/MarkdownBody.svelte';
  import BackLink from '$lib/components/page/BackLink.svelte';
  import Seo from '$lib/components/page/Seo.svelte';
  import Time from '$lib/components/page/Time.svelte';
  import ReleaseAssets from '$lib/releases/ReleaseAssets.svelte';
  import { seoExcerpt } from '$lib/seo';
  import type { PageData } from './$types';

  let { data }: { data: PageData } = $props();
  const owner = $derived(page.params.owner ?? '');
  const repository = $derived(page.params.repo ?? '');
  const release = $derived(data.release);
  const title = $derived(release.name || release.tagName);
  const archiveBase = $derived(`/api/v1/repositories/${owner}/${repository}/releases/${release.id}/archive`);
</script>

<Seo
  title={`${title} · ${owner}/${repository} · Marl`}
  description={seoExcerpt(release.bodyText, `${title} is a release of ${owner}/${repository}, hosted on Marl.`)}
  path={page.url.pathname}
  robots={data.repository.visibility === 'public' ? 'index, follow' : 'noindex, nofollow'}
/>

<BackLink href="/{owner}/{repository}/releases" label="All releases" />
<header class="mt-5 mb-8 flex flex-wrap items-start justify-between gap-6">
  <div class="flex min-w-0 gap-3.5">
    <span class="grid size-10.5 shrink-0 place-items-center rounded-xl bg-brand-soft text-brand"><Tag size={19} /></span
    >
    <div class="min-w-0">
      <h1
        class="flex flex-wrap items-center gap-x-3 gap-y-1 text-2xl font-semibold tracking-tight wrap-anywhere text-ink-strong sm:text-3xl"
      >
        {title}
        {#if release.latest}<span
            class="rounded-full bg-brand-soft px-2 py-0.5 text-xs font-semibold tracking-normal text-brand">Latest</span
          >{/if}
        {#if release.draft}<span
            class="rounded-full bg-surface-muted px-2 py-0.5 text-xs font-semibold tracking-normal text-ink-muted"
            >Draft</span
          >{:else if release.prerelease}<span
            class="rounded-full bg-warning-soft px-2 py-0.5 text-xs font-semibold tracking-normal text-warning"
            >Prerelease</span
          >{/if}
      </h1>
      <p class="mt-2.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-ink-muted">
        <code class="font-mono text-xs text-ink">{release.tagName}</code>
        <a
          class="inline-flex items-center gap-1 font-mono text-xs hover:text-brand"
          href="/{owner}/{repository}/commit/{release.targetCommitId}"
          ><GitCommitHorizontal size={13} />{release.targetCommitId.slice(0, 8)}</a
        >
        <span class="inline-flex items-center gap-1.5"
          ><UserProfileLink
            handle={release.author}
            displayName={release.authorDisplayName}
            avatarUrl={release.authorAvatarUrl}
            size={18}
          />
          {release.draft ? 'created' : 'published'}
          <Time value={release.publishedAt ?? release.createdAt} /></span
        >
      </p>
    </div>
  </div>
  {#if release.canEdit}<LinkButton size="small" href="/{owner}/{repository}/releases/edit/{release.id}"
      ><Pencil size={13} />Edit</LinkButton
    >{/if}
</header>

<div class="grid items-start gap-8 lg:grid-cols-[minmax(0,1fr)_320px]">
  <section class="min-w-0 surface p-5 sm:p-7" aria-label="Release notes">
    {#if release.body}<MarkdownBody html={release.bodyHtml} variant="document" />{:else}<p
        class="text-sm text-ink-muted"
      >
        No release notes provided.
      </p>{/if}
  </section>
  <aside class="grid min-w-0 gap-6">
    {#key release.id}<ReleaseAssets {owner} {repository} releaseId={release.id} assets={release.assets} />{/key}
    <section>
      <h2 class="mb-2 text-base font-semibold text-ink-strong">Source code</h2>
      <div class="grid grid-cols-2 gap-2">
        {#each [['zip', 'ZIP'], ['tar.gz', 'tar.gz']] as [format, label] (format)}
          <a
            class="flex items-center justify-center gap-2 rounded-lg bg-surface-muted px-3 py-2.5 text-sm font-medium text-ink transition-colors hover:bg-surface-hover hover:text-ink-strong"
            href="{archiveBase}/{format}"
            aria-label="Download source code as {label}"><Download size={14} />{label}</a
          >
        {/each}
      </div>
    </section>
  </aside>
</div>
