<script lang="ts">
  import type { ReleaseSummary } from '@marl/contracts';
  import CircleDot from '@lucide/svelte/icons/circle-dot';
  import CirclePlay from '@lucide/svelte/icons/circle-play';
  import GitPullRequest from '@lucide/svelte/icons/git-pull-request';
  import Tag from '@lucide/svelte/icons/tag';
  import Time from '#lib/components/page/Time.svelte';
  import BranchPicker from '#lib/repositories/browser/BranchPicker.svelte';
  import type { CodeLocation } from '#lib/repositories/browser/entry-path.js';
  import type { BranchSummary, TreeEntry } from '#lib/repositories/browser/types.js';
  import CloneUrl from '#lib/repositories/header/CloneUrl.svelte';
  import InspectorSection from '../inspector/InspectorSection.svelte';
  import { workspaceLinks, type CodeRepository } from './code-repository';
  import FileLatestCommit from './FileLatestCommit.svelte';
  import RepositoryAbout from './RepositoryAbout.svelte';

  let {
    repository,
    location,
    branches,
    entry,
    latestRelease,
    signedIn
  }: {
    repository: CodeRepository;
    location: CodeLocation;
    branches: BranchSummary[];
    entry?: TreeEntry;
    latestRelease: Promise<ReleaseSummary | null>;
    signedIn: boolean;
  } = $props();
  const slug = $derived(`${repository.owner}/${repository.name}`);
  const scope = $derived(`?repository=${encodeURIComponent(slug)}`);
  const work = $derived([
    { href: `/next/pulls${scope}`, label: 'Pulls', icon: GitPullRequest },
    { href: `/next/issues${scope}`, label: 'Issues', icon: CircleDot },
    ...(repository.permissions.member ? [{ href: `/next/runs${scope}`, label: 'Runs', icon: CirclePlay }] : [])
  ]);
</script>

<RepositoryAbout {repository} {signedIn} />

{#if branches.length}
  <InspectorSection title="Branch">
    <BranchPicker
      class="w-full"
      {branches}
      selected={location.revision}
      href={(branch) => workspaceLinks.tree({ ...location, revision: branch })}
    />
    <p class="mt-2 text-xs text-ink-muted">
      {branches.length}
      {branches.length === 1 ? 'branch' : 'branches'} · {repository.defaultBranch} is the default
    </p>
  </InspectorSection>
{/if}

{#if entry}<FileLatestCommit {entry} {location} />{/if}

<InspectorSection>
  <CloneUrl heading="Clone" cloneUrl={repository.cloneUrl} sshCloneUrl={repository.sshCloneUrl} {signedIn} />
</InspectorSection>

{#await latestRelease then release}
  {#if release}
    <InspectorSection title="Latest release">
      <a
        class="-mx-2 grid grid-cols-[16px_minmax(0,1fr)] items-start gap-2 rounded-md px-2 py-1.5 transition-colors hover:bg-surface-hover"
        href="/{slug}/releases/tag/{encodeURIComponent(release.tagName)}"
      >
        <Tag size={14} class="mt-0.5 text-ink-muted" />
        <span class="min-w-0">
          <span class="block truncate text-sm text-ink-strong">{release.name || release.tagName}</span>
          <span class="flex items-center gap-1.5 text-xs text-ink-muted"
            ><code class="truncate font-mono">{release.tagName}</code>·<Time
              value={release.publishedAt ?? release.createdAt}
            /></span
          >
        </span>
      </a>
    </InspectorSection>
  {/if}
{/await}

<InspectorSection>
  <ul class="-mx-2 grid gap-px">
    {#each work as link (link.href)}
      <li>
        <a
          class="flex h-8 items-center gap-2.5 rounded-md px-2 text-sm text-ink transition-colors hover:bg-surface-hover hover:text-ink-strong"
          href={link.href}><link.icon size={15} class="text-ink-muted" />{link.label}</a
        >
      </li>
    {/each}
  </ul>
</InspectorSection>
