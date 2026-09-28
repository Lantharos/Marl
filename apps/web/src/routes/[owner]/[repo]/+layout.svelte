<script lang="ts">
  import ActionMenu from '$lib/components/overlays/ActionMenu.svelte';
  import { reporting } from '$lib/moderation/reporting.svelte';
  import type { Snippet } from 'svelte';
  import { page } from '$app/state';
  import { untrack } from 'svelte';
  import BookOpen from '@lucide/svelte/icons/book-open';
  import CircleDot from '@lucide/svelte/icons/circle-dot';
  import CirclePlay from '@lucide/svelte/icons/circle-play';
  import Code2 from '@lucide/svelte/icons/code-xml';
  import GitFork from '@lucide/svelte/icons/git-fork';
  import GitPullRequest from '@lucide/svelte/icons/git-pull-request';
  import Lock from '@lucide/svelte/icons/lock';
  import Settings from '@lucide/svelte/icons/settings';
  import Star from '@lucide/svelte/icons/star';
  import Tag from '@lucide/svelte/icons/tag';
  import { api } from '$lib/api';
  import Button from '$lib/components/controls/Button.svelte';
  import RepositoryIcon from '$lib/components/identity/RepositoryIcon.svelte';
  import PublicProfileNav from '$lib/components/profile/PublicProfileNav.svelte';
  import CloneMenu from '$lib/repositories/header/CloneMenu.svelte';
  import RepositoryNotifications from '$lib/repositories/header/RepositoryNotifications.svelte';
  import ForkDialog from '$lib/repositories/header/ForkDialog.svelte';
  import RepositoryTabs from '$lib/repositories/header/RepositoryTabs.svelte';
  import type { LayoutData } from './$types';

  let { children, data }: { children: Snippet; data: LayoutData } = $props();
  const owner = $derived(page.params.owner ?? '');
  const repo = $derived(page.params.repo ?? '');
  const base = $derived(`/${owner}/${repo}`);
  const path = $derived(page.url.pathname);
  const repository = $derived(data.repository);
  let starred = $state(untrack(() => Boolean(data.repository?.starred)));
  let starCount = $state(untrack(() => data.repository?.starCount ?? 0));
  let starring = $state(false);
  let forkOpen = $state(false);
  const forkOptions = $derived(
    (data.shellOrganizations ?? [])
      .filter((organization) => organization.role !== 'member')
      .toSorted(
        (left, right) =>
          Number(right.kind === 'personal') - Number(left.kind === 'personal') || left.name.localeCompare(right.name)
      )
      .map((organization) => ({
        value: organization.slug,
        label:
          organization.kind === 'personal' ? (data.shellUser?.displayName ?? organization.name) : organization.name,
        description:
          organization.kind === 'personal'
            ? `@${organization.slug} · Personal account`
            : `@${organization.slug} · Organization`
      }))
  );
  const codeActive = $derived(
    path === `${base}/code` ||
      ['tree', 'blob', 'commit', 'branches', 'search'].some((segment) => path.startsWith(`${base}/${segment}`))
  );
  const tabs = $derived([
    { key: 'overview', href: `${base}?overview=1`, label: 'Overview', icon: BookOpen, active: path === base },
    { key: 'code', href: `${base}/code`, label: 'Code', icon: Code2, active: codeActive },
    {
      key: 'releases',
      href: `${base}/releases`,
      label: 'Releases',
      icon: Tag,
      active: path.startsWith(`${base}/releases`)
    },
    {
      key: 'issues',
      href: `${base}/issues`,
      label: 'Issues',
      icon: CircleDot,
      active: path.startsWith(`${base}/issues`)
    },
    {
      key: 'pulls',
      href: `${base}/pulls`,
      label: 'Pulls',
      icon: GitPullRequest,
      active: path.startsWith(`${base}/pulls`)
    },
    ...(repository?.permissions.member
      ? [
          {
            key: 'runs',
            href: `${base}/runs`,
            label: 'Runs',
            icon: CirclePlay,
            active: path.startsWith(`${base}/runs`)
          }
        ]
      : []),
    ...(repository?.permissions.maintain
      ? [
          {
            key: 'settings',
            href: `${base}/settings`,
            label: 'Settings',
            icon: Settings,
            active: path.startsWith(`${base}/settings`)
          }
        ]
      : [])
  ]);

  $effect(() => {
    void base;
    untrack(() => {
      starred = Boolean(data.repository?.starred);
      starCount = data.repository?.starCount ?? 0;
      starring = false;
      forkOpen = false;
    });
  });

  async function toggleStar() {
    if (starring) return;
    starring = true;
    const route = base;
    try {
      const result = await api<{ starred: boolean; starCount: number }>(`/repositories/${owner}/${repo}/star`, {
        method: starred ? 'DELETE' : 'PUT'
      });
      if (base === route) {
        starred = result.starred;
        starCount = result.starCount;
      }
    } finally {
      if (base === route) starring = false;
    }
  }
</script>

<PublicProfileNav visible={!data.shellUser} />

<section class="relative bg-[linear-gradient(to_bottom,var(--color-surface)_0_64px,var(--color-canvas)_64px)]">
  <div
    class="mx-auto flex min-h-16 w-[min(1240px,calc(100%-32px))] items-center justify-between gap-4 py-2.5 sm:w-[min(1240px,calc(100%-48px))] sm:gap-5"
  >
    <div class="flex min-w-0 items-center gap-3">
      <RepositoryIcon name={repo} src={repository?.iconUrl} size={36} />
      <div class="min-w-0">
        <div class="flex min-w-0 items-center gap-1.5 text-base">
          <a class="truncate font-medium text-ink-muted hover:text-brand" href="/{owner}">{owner}</a><span
            class="text-ink-faint">/</span
          ><a class="truncate font-semibold text-ink-strong hover:text-brand" href={base}>{repo}</a>
          {#if repository?.visibility === 'private'}<span
              class="ml-1 inline-flex shrink-0 items-center gap-1 rounded-full bg-surface-muted px-2 py-0.5 text-2xs font-medium text-ink-muted"
              ><Lock size={11} />Private</span
            >{/if}
        </div>
        {#if repository?.upstream}<p class="mt-0.5 flex items-center gap-1.5 truncate text-xs text-ink-muted">
            <GitFork size={12} />Forked from
            <a class="hover:text-brand" href="/{repository.upstream.owner}/{repository.upstream.name}"
              >{repository.upstream.owner}/{repository.upstream.name}</a
            >
          </p>{:else if repository?.description}<p class="mt-0.5 truncate text-sm text-ink-muted">
            {repository.description}
          </p>{/if}
      </div>
    </div>
    <div class="flex shrink-0 items-center gap-1.5">
      {#if data.shellUser}
        <Button
          size="small"
          loading={starring}
          aria-label={starred ? 'Unstar repository' : 'Star repository'}
          aria-pressed={starred}
          onclick={toggleStar}
          ><Star size={15} fill={starred ? 'currentColor' : 'none'} class={starred ? 'text-warning' : ''} /><span
            class="max-sm:hidden">Star</span
          >{#if starCount}<span class="border-l border-line pl-1.5 text-ink-muted tabular-nums">{starCount}</span
            >{/if}</Button
        >
        <Button
          size="small"
          aria-label="Fork repository"
          disabled={!forkOptions.length}
          onclick={() => (forkOpen = true)}
          ><GitFork size={15} /><span class="max-sm:hidden">Fork</span>{#if repository?.forkCount}<span
              class="border-l border-line pl-1.5 text-ink-muted tabular-nums">{repository.forkCount}</span
            >{/if}</Button
        >
      {/if}
      {#if data.shellUser}<RepositoryNotifications {owner} repository={repo} />{/if}
      {#if repository}<CloneMenu
          cloneUrl={repository.cloneUrl}
          sshCloneUrl={repository.sshCloneUrl}
          signedIn={Boolean(data.shellUser)}
        />{/if}
      {#if repository && data.shellUser && !repository.permissions.admin}<ActionMenu
          label="More repository options"
          actions={[
            {
              label: 'Report repository',
              onSelect: () => reporting.open({ type: 'repository', id: repository.id, label: `${owner}/${repo}` })
            }
          ]}
        />{/if}
    </div>
  </div>
  <RepositoryTabs {tabs} />
</section>

<div class="mx-auto w-[min(1240px,calc(100%-32px))] pt-7 pb-18 sm:w-[min(1240px,calc(100%-48px))]">
  {@render children()}
</div>

<ForkDialog bind:open={forkOpen} {owner} repository={repo} options={forkOptions} />
