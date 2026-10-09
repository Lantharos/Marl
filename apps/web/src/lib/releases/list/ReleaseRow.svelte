<script lang="ts">
  import type { ReleaseSummary } from '@marl/contracts';
  import Download from '@lucide/svelte/icons/download';
  import ListRow from '#lib/components/list/ListRow.svelte';
  import Time from '#lib/components/page/Time.svelte';
  import { releasePath } from '../release-path';
  import { countLabel, releaseState, releaseStateLabels, releaseStateTones } from '../release-state';

  let {
    release,
    owner,
    repository,
    first,
    last
  }: { release: ReleaseSummary; owner: string; repository: string; first: boolean; last: boolean } = $props();
  const state = $derived(releaseState(release));
  const href = $derived(releasePath(owner, repository, release.tagName));
  const date = $derived(release.publishedAt ?? release.createdAt);
</script>

<ListRow
  as="article"
  class="relative grid grid-cols-[14px_minmax(0,1fr)_auto] gap-x-4 py-4 sm:grid-cols-[14px_150px_minmax(0,1fr)_auto] sm:gap-x-5"
>
  <span class="relative flex justify-center" aria-hidden="true">
    {#if !first || !last}<span
        class={['absolute w-px bg-line-strong', first ? 'top-2.5 -bottom-4' : last ? '-top-4 h-7' : '-top-4 -bottom-4']}
      ></span>{/if}
    <span
      class={[
        'relative mt-1.5 size-2.5 rounded-full',
        state === 'latest' && 'bg-brand ring-4 ring-brand-soft',
        state === 'stable' && 'bg-line-strong',
        state === 'prerelease' && 'border-2 border-warning bg-surface',
        state === 'draft' && 'border-2 border-dashed border-ink-faint bg-surface'
      ]}
    ></span>
  </span>
  <div class="hidden min-w-0 sm:block">
    <code class="block truncate font-mono text-sm font-semibold text-ink-strong">{release.tagName}</code>
    <Time value={date} class="mt-0.5 block text-xs text-ink-muted" />
    {#if state !== 'stable'}<span class={['mt-1 block text-xs font-semibold', releaseStateTones[state]]}
        >{releaseStateLabels[state]}</span
      >{/if}
  </div>
  <div class="min-w-0">
    <h2 class="text-base font-semibold text-ink-strong">
      <a class="wrap-anywhere after:absolute after:inset-0 hover:text-brand" {href}>{release.name || release.tagName}</a
      >
    </h2>
    <p class="mt-0.5 flex flex-wrap items-center gap-x-1.5 text-xs text-ink-muted sm:hidden">
      <code class="font-mono text-ink">{release.tagName}</code><span aria-hidden="true">·</span><Time
        value={date}
        class="text-xs text-ink-muted"
      />{#if state !== 'stable'}<span aria-hidden="true">·</span><span
          class={['font-semibold', releaseStateTones[state]]}>{releaseStateLabels[state]}</span
        >{/if}
    </p>
    {#if release.bodyText}<p class="mt-1.5 line-clamp-2 max-w-[78ch] text-sm text-pretty text-ink-muted">
        {release.bodyText}
      </p>{/if}
  </div>
  {#if release.assetCount}
    <a
      class="relative z-1 inline-flex h-8 items-center gap-1.5 self-start rounded-md px-2.5 text-xs font-semibold whitespace-nowrap text-ink-muted transition-colors hover:bg-surface-muted hover:text-ink-strong"
      href="{href}#downloads"
      aria-label="{countLabel(release.assetCount, 'file')} to download"
      ><Download size={14} />{countLabel(release.assetCount, 'file')}<span
        class="hidden font-normal text-ink-faint lg:inline">· {countLabel(release.downloadCount, 'download')}</span
      ></a
    >
  {/if}
</ListRow>
